import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_SAMPLES,
  getCodeSelection,
  getLessonCopy,
} from "../src/lesson-content.mjs";

test("the three experiment stages have concise progressive-reveal copy", () => {
  for (const step of ["configure", "run", "compare"]) {
    const copy = getLessonCopy(step);

    assert.equal(typeof copy.eyebrow, "string");
    assert.equal(typeof copy.title, "string");
    assert.ok(copy.eyebrow.length > 0);
    assert.ok(copy.title.length > 0);
  }
});

test("the Triton sample teaches block programs and masked vector stores", () => {
  assert.match(CODE_SAMPLES.triton, /tl\.program_id\(0\)/);
  assert.match(CODE_SAMPLES.triton, /tl\.arange/);
  assert.match(CODE_SAMPLES.triton, /tl\.store/);
  assert.match(CODE_SAMPLES.triton, /mask=/);
  assert.doesNotMatch(CODE_SAMPLES.triton, /if pixel|image\[pixel\]/);
});

test("the WebGPU sample connects browser workers to a masked WGSL compute shader", () => {
  assert.match(CODE_SAMPLES.webgpu, /@compute/);
  assert.match(CODE_SAMPLES.webgpu, /@builtin\(global_invocation_id\)/);
  assert.match(CODE_SAMPLES.webgpu, /pixel < n_pixels/);
  assert.match(CODE_SAMPLES.webgpu, /output\[pixel\]/);
});

test("platform code keeps one conceptual worker selected", () => {
  const webgpu = getCodeSelection("webgpu", 10);
  const metal = getCodeSelection("metal", 10);
  const triton = getCodeSelection("triton", 10);
  const cuda = getCodeSelection("cuda", 10);

  assert.match(webgpu.highlightedToken, /global_invocation_id/);
  assert.match(metal.highlightedToken, /thread_position_in_grid/);
  assert.match(triton.highlightedToken, /program_id.*arange/s);
  assert.match(cuda.highlightedToken, /blockIdx\.x.*threadIdx\.x/);
  for (const selection of [webgpu, metal, triton, cuda]) {
    assert.match(selection.caption, /worker 10/i);
    assert.match(selection.source, new RegExp(selection.highlightedToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(triton.caption, /program.*vector lanes/i);
});

test("code selection rejects unknown platforms and invalid workers", () => {
  assert.throws(() => getCodeSelection("opencl", 1), /Unknown code platform/);
  assert.throws(() => getCodeSelection("cuda", -1), RangeError);
  assert.throws(() => getCodeSelection("cuda", 1.5), RangeError);
});
