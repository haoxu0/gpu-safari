import test from "node:test";
import assert from "node:assert/strict";
import { GPU_CODE_PLATFORMS, generatePlatformCode, getPlatformDefinition, getPlatformPhaseMapping } from "../src/platform-code-catalog.mjs";

test("the catalog generates configured code for five GPU ecosystems", () => {
  assert.deepEqual(GPU_CODE_PLATFORMS, ["webgpu", "cuda", "triton", "metal", "hip"]);
  for (const platform of GPU_CODE_PLATFORMS) {
    const definition = getPlatformDefinition(platform);
    const source = generatePlatformCode({ platform, layer: "kernel", pixels: 65_536, groupSize: 16 });
    assert.ok(definition.label);
    assert.match(source, /65536/);
    assert.match(source, /16/);
  }
  assert.equal(getPlatformDefinition("webgpu").executionKind, "browser");
  assert.equal(getPlatformDefinition("cuda").executionKind, "equivalent");
});

test("displayed host and kernel pairs agree on their signatures and real WebGPU geometry", () => {
  const wgsl=generatePlatformCode({platform:"webgpu",layer:"kernel",pixels:1_048_576,groupSize:8});
  const webHost=generatePlatformCode({platform:"webgpu",layer:"host",pixels:1_048_576,groupSize:8});
  assert.match(wgsl,/var<storage, read_write> output/); assert.match(wgsl,/row_stride = 524280u/); assert.match(wgsl,/id\.y \* row_stride \+ id\.x/);
  assert.match(webHost,/dispatchWorkgroups\(65535, 3\)/);
  for(const platform of ["cuda","hip"]){const host=generatePlatformCode({platform,layer:"host",pixels:64,groupSize:8});const kernel=generatePlatformCode({platform,layer:"kernel",pixels:64,groupSize:8});assert.match(host,/output, n_pixels/);assert.match(kernel,/output, int n_pixels/);}
  assert.match(generatePlatformCode({platform:"triton",layer:"kernel",pixels:64,groupSize:8}),/@triton\.jit[\s\S]*def paint\(output/);
  assert.match(generatePlatformCode({platform:"metal",layer:"host",pixels:64,groupSize:8}),/setBuffer[\s\S]*contents/);
});

test("every phase maps to a token present in generated source", () => {
  for (const platform of GPU_CODE_PLATFORMS) for (const phase of ["prepare", "submit", "work", "readback", "complete"]) {
    const mapping = getPlatformPhaseMapping({ platform, phase, workerId: 10, pixels: 64, groupSize: 8 });
    const source = generatePlatformCode({ platform, layer: mapping.layer, pixels: 64, groupSize: 8 });
    assert.ok(source.includes(mapping.highlightedToken), `${platform}/${phase}`);
    assert.match(mapping.caption, /10/);
  }
});

test("invalid catalog inputs fail before rendering", () => {
  assert.throws(() => getPlatformDefinition("opencl"), /platform/i);
  assert.throws(() => generatePlatformCode({ platform: "cuda", layer: "kernel", pixels: 10, groupSize: 8 }), RangeError);
  assert.throws(() => getPlatformPhaseMapping({ platform: "cuda", phase: "launch", workerId: -1, pixels: 64, groupSize: 8 }), RangeError);
});
