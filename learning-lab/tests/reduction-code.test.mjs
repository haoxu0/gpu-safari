import test from "node:test";
import assert from "node:assert/strict";
import { REDUCTION_PLATFORMS, reductionCode, renderReductionCodePanel } from "../src/reduction-code.mjs";

test("reduction code is available across the five GPU ecosystems", () => {
  assert.deepEqual(REDUCTION_PLATFORMS, ["webgpu", "cuda", "triton", "metal", "hip"]);
  for (const platform of REDUCTION_PLATFORMS) assert.match(reductionCode(platform), /sum|reduce/i);
});

test("syntax selection is secondary to execution", () => {
  const html = renderReductionCodePanel("cuda");
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"[^>]*>CUDA/);
  assert.match(html, /aria-controls="reduction-code-body"/);
  assert.match(html, /role="tabpanel" id="reduction-code-body"/);
  assert.match(html, /aria-selected="true" tabindex="0"/);
  assert.match(html, /aria-selected="false" tabindex="-1"/);
  assert.match(html, /matches this animation/);
  assert.doesNotMatch(html, /Run CUDA/);
});

test("adjacent-pair syntax follows the configured teaching group size", () => {
  const cuda = reductionCode("cuda", 8);
  assert.match(cuda, /scratch\[2\]\[8\]/);
  assert.match(cuda, /src\[2 \* threadIdx\.x\]/);
  assert.doesNotMatch(cuda, /scratch\[2\]\[16\]/);
  assert.match(cuda, /blockIdx\.x/);
  assert.match(renderReductionCodePanel("metal", 8), /lanes may be mapped differently/);
});
