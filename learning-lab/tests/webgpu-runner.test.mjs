import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWebGpuResult,
  createPaintShader,
  formatAdapterName,
  getWebGpuCapability,
  planWebGpuDispatch,
  summarizeWebGpuOutput,
  withWebGpuCapability,
} from "../src/webgpu-runner.mjs";

test("WebGPU capability is instant and local when the browser exposes an adapter API", () => {
  assert.deepEqual(getWebGpuCapability({ gpu: { requestAdapter() {} } }), {
    id: "browser-webgpu",
    label: "This device · WebGPU",
    available: true,
    kind: "local",
    requires_confirmation: false,
    reason: null,
  });
});

test("WebGPU capability explains a missing browser API without mentioning a companion server", () => {
  const capability = getWebGpuCapability({});

  assert.equal(capability.available, false);
  assert.match(capability.reason, /WebGPU/i);
  assert.doesNotMatch(capability.reason, /server|python/i);
});

test("browser capability stays first when optional companion providers are present", () => {
  const capabilities = withWebGpuCapability(
    { schema_version: "1.0.0", providers: [{ id: "apple-mlx", available: true }] },
    { gpu: { requestAdapter() {} } },
  );

  assert.deepEqual(capabilities.providers.map(({ id }) => id), ["browser-webgpu", "apple-mlx"]);
});

test("paint shader assigns one constant color with an explicit boundary mask", () => {
  const shader = createPaintShader({ pixels: 64, groupSize: 10, rowStride: 70 });

  assert.match(shader, /@workgroup_size\(10\)/);
  assert.match(shader, /id\.y \* 70u \+ id\.x/);
  assert.match(shader, /pixel < 64u/);
  assert.match(shader, /output\[pixel\] = 0\.5/);
});

test("large workloads spread workgroups across two dimensions within device limits", () => {
  assert.deepEqual(planWebGpuDispatch({
    pixels: 1_048_576,
    groupSize: 8,
    maxWorkgroupsPerDimension: 65_535,
  }), {
    workgroupsX: 65_535,
    workgroupsY: 3,
    rowStride: 524_280,
  });
});

test("dispatch planning rejects invalid dimensions before creating GPU resources", () => {
  assert.throws(
    () => planWebGpuDispatch({ pixels: 64, groupSize: 0, maxWorkgroupsPerDimension: 65_535 }),
    /groupSize/,
  );
  assert.throws(
    () => planWebGpuDispatch({ pixels: 64, groupSize: 8, maxWorkgroupsPerDimension: 0 }),
    /maxWorkgroupsPerDimension/,
  );
});

test("WebGPU output summary independently checks every painted pixel", () => {
  const summary = summarizeWebGpuOutput(new Float32Array([0.5, 0.5, 0.5]));

  assert.deepEqual(summary, {
    checksum: 1.5,
    maxAbsError: 0,
    passed: true,
  });
});

test("WebGPU result labels browser round-trip timing instead of kernel latency", () => {
  const result = buildWebGpuResult({
    device: "Apple GPU",
    pixels: 64,
    groupSize: 8,
    elapsedMs: 1.25,
    checksum: 32,
    maxAbsError: 0,
    dispatch: { workgroupsX: 8, workgroupsY: 1, rowStride: 64 },
  });

  assert.equal(result.provider, "browser-webgpu");
  assert.equal(result.measurements[0].name, "browser_round_trip");
  assert.equal(result.measurements[0].unit, "ms");
  assert.equal(result.measurements[0].value, 1.25);
  assert.equal(result.correctness.passed, true);
  assert.deepEqual(result.workload.dispatch, {
    workgroups_x: 8,
    workgroups_y: 1,
    total_workgroups: 8,
  });
});

test("opaque Metal adapter identifiers become a learner-friendly device label", () => {
  assert.equal(formatAdapterName({ description: "metal-3" }), "Apple GPU via Metal");
  assert.equal(formatAdapterName({ description: "NVIDIA RTX 5090" }), "NVIDIA RTX 5090");
  assert.equal(formatAdapterName({}), "Browser GPU");
});
