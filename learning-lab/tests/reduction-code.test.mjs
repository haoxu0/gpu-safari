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
  assert.match(html, /Syntax view/);
  assert.doesNotMatch(html, /Run CUDA/);
});
