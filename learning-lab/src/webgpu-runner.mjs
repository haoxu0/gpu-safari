const WEBGPU_PROVIDER = {
  id: "browser-webgpu",
  label: "This device · WebGPU",
  kind: "local",
  requires_confirmation: false,
};

export function getWebGpuCapability(navigatorLike = globalThis.navigator) {
  const available = typeof navigatorLike?.gpu?.requestAdapter === "function";
  return {
    ...WEBGPU_PROVIDER,
    available,
    reason: available ? null : "WebGPU is unavailable in this browser. Try a current Safari, Chrome, or Edge release.",
  };
}

export function withWebGpuCapability(serverCapabilities = {}, navigatorLike = globalThis.navigator) {
  return {
    schema_version: serverCapabilities.schema_version ?? "1.0.0",
    providers: [getWebGpuCapability(navigatorLike), ...(serverCapabilities.providers ?? [])],
  };
}

export function createPaintShader({ pixels, groupSize }) {
  if (!Number.isInteger(pixels) || pixels <= 0) throw new RangeError("pixels must be a positive integer");
  if (!Number.isInteger(groupSize) || groupSize <= 0 || groupSize > 256) {
    throw new RangeError("groupSize must be an integer from 1 to 256");
  }
  return `@group(0) @binding(0) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(${groupSize})
fn paint(@builtin(global_invocation_id) id: vec3<u32>) {
  let pixel = id.x;
  if (pixel < ${pixels}u) {
    output[pixel] = 0.5;
  }
}`;
}

export function summarizeWebGpuOutput(values) {
  let checksum = 0;
  let maxAbsError = 0;
  for (const value of values) {
    checksum += value;
    maxAbsError = Math.max(maxAbsError, Math.abs(value - 0.5));
  }
  return { checksum, maxAbsError, passed: maxAbsError <= 1e-6 };
}

export function formatAdapterName(info) {
  const description = info?.description || info?.device || info?.architecture;
  if (/^metal-\d+$/i.test(description ?? "")) return "Apple GPU via Metal";
  return description || "Browser GPU";
}

export function buildWebGpuResult({ device, pixels, groupSize, elapsedMs, checksum, maxAbsError }) {
  return {
    schema_version: "1.0.0",
    experiment: "paint-pixels",
    provider: "browser-webgpu",
    device,
    implementation: "WebGPU · WGSL",
    workload: { pixels, dtype: "float32", group_size: groupSize },
    correctness: { passed: maxAbsError <= 1e-6, max_abs_error: maxAbsError },
    measurements: [{ name: "browser_round_trip", value: elapsedMs, unit: "ms" }],
    output: { checksum },
  };
}

export async function runWebGpuPaint({ pixels = 64, groupSize = 8 } = {}) {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) throw new Error("WebGPU is unavailable in this browser.");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("The browser could not access a GPU adapter.");

  const device = await adapter.requestDevice();
  const byteLength = pixels * Float32Array.BYTES_PER_ELEMENT;
  const output = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  try {
    const module = device.createShaderModule({ code: createPaintShader({ pixels, groupSize }) });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "paint" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: output } }],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(pixels / groupSize));
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, byteLength);

    const started = performance.now();
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const elapsedMs = performance.now() - started;
    const values = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    const summary = summarizeWebGpuOutput(values);
    if (!summary.passed) throw new Error("WebGPU returned an incorrect pixel result.");

    const deviceName = formatAdapterName(adapter.info);
    return buildWebGpuResult({
      device: deviceName,
      pixels,
      groupSize,
      elapsedMs,
      checksum: summary.checksum,
      maxAbsError: summary.maxAbsError,
    });
  } finally {
    output.destroy();
    readback.destroy();
    device.destroy();
  }
}
