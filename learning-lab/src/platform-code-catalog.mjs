export const GPU_CODE_PLATFORMS = Object.freeze(["webgpu", "cuda", "triton", "metal", "hip"]);
const META = Object.freeze({ webgpu:["WebGPU","browser"], cuda:["CUDA","equivalent"], triton:["Triton","equivalent"], metal:["Metal","equivalent"], hip:["HIP","equivalent"] });
const PIXELS = new Set([64, 65_536, 1_048_576]);
const GROUPS = new Set([4, 8, 16, 32]);
const PHASES = new Set(["prepare", "submit", "work", "readback", "complete"]);

function validate(platform, pixels=64, groupSize=8) {
  if (!META[platform]) throw new RangeError("unknown platform");
  if (!PIXELS.has(pixels) || !GROUPS.has(groupSize)) throw new RangeError("invalid experiment configuration");
}
export function getPlatformDefinition(platform) { validate(platform); const [label, executionKind]=META[platform]; return {id:platform,label,ecosystem:label,executionKind}; }
export function generatePlatformCode({platform,layer,pixels,groupSize}) {
  validate(platform,pixels,groupSize); if (!new Set(["host","kernel"]).has(layer)) throw new RangeError("invalid code layer");
  const host = {
    webgpu:`const n_pixels = ${pixels};\nconst group_size = ${groupSize};\nconst encoder = device.createCommandEncoder();\npass.dispatchWorkgroups(Math.ceil(n_pixels / group_size));\ndevice.queue.submit([encoder.finish()]);\nawait readback.mapAsync(GPUMapMode.READ);`,
    cuda:`const int n_pixels = ${pixels};\nconst int group_size = ${groupSize};\nfloat* output; cudaMalloc(&output, n_pixels * sizeof(float));\npaint<<<(n_pixels + group_size - 1) / group_size, group_size>>>(output, n_pixels);\ncudaDeviceSynchronize();\ncudaMemcpy(host, output, n_pixels * sizeof(float), cudaMemcpyDeviceToHost);`,
    triton:`n_pixels = ${pixels}\nBLOCK_SIZE = ${groupSize}\noutput = torch.empty(n_pixels, device="cuda")\npaint[(triton.cdiv(n_pixels, BLOCK_SIZE),)](output, n_pixels, BLOCK_SIZE)\ntorch.cuda.synchronize()\nresult = output.cpu()`,
    metal:`const uint n_pixels = ${pixels};\nconst uint group_size = ${groupSize};\nid<MTLCommandBuffer> commands = [queue commandBuffer];\n[encoder dispatchThreads:MTLSizeMake(n_pixels,1,1) threadsPerThreadgroup:MTLSizeMake(group_size,1,1)];\n[commands commit];\n[commands waitUntilCompleted];`,
    hip:`const int n_pixels = ${pixels};\nconst int group_size = ${groupSize};\nfloat* output; hipMalloc(&output, n_pixels * sizeof(float));\nhipLaunchKernelGGL(paint, dim3((n_pixels+group_size-1)/group_size), dim3(group_size), 0, 0, output, n_pixels);\nhipDeviceSynchronize();\nhipMemcpy(host, output, n_pixels*sizeof(float), hipMemcpyDeviceToHost);`,
  };
  const kernel = {
    webgpu:`const n_pixels = ${pixels}u;\n@compute @workgroup_size(${groupSize})\nfn paint(@builtin(global_invocation_id) id: vec3<u32>) { let pixel = id.x; if (pixel < n_pixels) { output[pixel] = 0.5; } }`,
    cuda:`constexpr int n_pixels = ${pixels}; constexpr int group_size = ${groupSize};\n__global__ void paint(float* output) { int pixel = blockIdx.x * blockDim.x + threadIdx.x; if (pixel < n_pixels) output[pixel] = 0.5f; }`,
    triton:`n_pixels: tl.constexpr = ${pixels}\nBLOCK_SIZE: tl.constexpr = ${groupSize}\nprogram = tl.program_id(0)\noffsets = program * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)\ntl.store(output + offsets, 0.5, mask=offsets < n_pixels)`,
    metal:`constant uint n_pixels = ${pixels}; constant uint group_size = ${groupSize};\nkernel void paint(device float* output [[buffer(0)]], uint pixel [[thread_position_in_grid]]) { if (pixel < n_pixels) output[pixel] = 0.5f; }`,
    hip:`constexpr int n_pixels = ${pixels}; constexpr int group_size = ${groupSize};\n__global__ void paint(float* output) { int pixel = hipBlockIdx_x * hipBlockDim_x + hipThreadIdx_x; if (pixel < n_pixels) output[pixel] = 0.5f; }`,
  }; return (layer === "host" ? host : kernel)[platform];
}
export function getPlatformPhaseMapping({platform,phase,workerId,pixels,groupSize}) {
  validate(platform,pixels,groupSize); if (!PHASES.has(phase) || !Number.isInteger(workerId) || workerId < 0) throw new RangeError("invalid phase or worker");
  const tokens={webgpu:["createCommandEncoder","queue.submit","global_invocation_id","mapAsync"],cuda:["cudaMalloc","<<<","blockIdx.x","cudaMemcpy"],triton:["torch.empty","paint[","tl.program_id","output.cpu"],metal:["commandBuffer","dispatchThreads","thread_position_in_grid","waitUntilCompleted"],hip:["hipMalloc","hipLaunchKernelGGL","hipBlockIdx_x","hipMemcpy"]}[platform];
  const index=phase==="prepare"?0:phase==="submit"?1:phase==="work"?2:3; return {layer:index===2?"kernel":"host",highlightedToken:tokens[index],caption:`Worker ${workerId} maps to pixel ${workerId} in ${META[platform][0]}.`};
}
