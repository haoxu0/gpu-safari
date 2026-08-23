import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_SAMPLES,
  getLessonCopy,
} from "../src/lesson-content.mjs";

test("the four visual lesson steps have concise progressive-reveal copy", () => {
  for (const step of ["see", "experiment", "race", "code"]) {
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
