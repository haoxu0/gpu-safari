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
