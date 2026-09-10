import test from "node:test";
import assert from "node:assert/strict";
import { renderReductionStep, reductionSceneSummary } from "../src/reduction-view.mjs";

const state = {
  step: "question",
  count: 16,
  groupSize: 8,
  prediction: null,
  selectedPath: "gpu",
  frame: { kind: "gpu", phase: "local", round: 1, values: [4, 5], pairs: [[0, 1], [2, 3]], active: [true, true], laneCount: 2, done: false },
  timeline: { index: 1, count: 5, running: false },
  codeVisible: false,
  codePlatform: "webgpu",
  viewed: { cpu: false, gpu: true },
};

test("question step asks one concrete visual puzzle", () => {
  const html = renderReductionStep(state);
  assert.match(html, /How many rounds/);
  assert.match(html, /16 numbers/);
  assert.match(html, /Make a guess/);
});

test("guess choices follow the configured reduction depth", () => {
  const html = renderReductionStep({ ...state, count: 8 });
  assert.match(html, />3 rounds</);
  assert.doesNotMatch(html, />4 rounds</);
});

test("run step has CPU and GPU cards around one canvas", () => {
  const html = renderReductionStep({ ...state, step: "run" });
  assert.match(html, /Run CPU/);
  assert.match(html, /Run GPU/);
  assert.equal((html.match(/<canvas/g) ?? []).length, 1);
  assert.match(html, /data-reduction-canvas/);
  assert.match(html, /This is a visual teaching model/);
  assert.match(html, /16 values · 8 workers\/group/);
  assert.match(html, /CPU ready/);
  assert.match(html, /GPU viewed/);
  assert.doesNotMatch(html, /<svg/);
});

test("compare step presents depth as a visual result rather than timing", () => {
  const html = renderReductionStep({ ...state, step: "compare" });
  assert.match(html, /15 sequential additions/);
  assert.match(html, /4 parallel rounds/);
  assert.match(html, /Outputs match/);
  assert.doesNotMatch(html, /ms|faster/i);
});

test("scene summary announces the active parallel round", () => {
  assert.equal(reductionSceneSummary(state.frame), "GPU round 1 combines 2 pairs at the same time.");
});
