import test from "node:test";
import assert from "node:assert/strict";
import { projectReductionLayout } from "../src/reduction-canvas.mjs";

test("GPU layout connects each input pair to its own result", () => {
  const layout = projectReductionLayout({ kind: "gpu", round: 1, inputs: [3, 1, 4, 1], values: [4, 5], active: [true, true], pairs: [[0, 1], [2, 3]], laneCount: 2, groupSize: 4, done: false }, 600, 320);
  assert.equal(layout.mode, "gpu");
  assert.equal(layout.nodes.length, 2);
  assert.ok(layout.nodes[0].x < layout.nodes[1].x);
  assert.equal(layout.connections.length, 4);
  assert.equal(layout.connections[0].toX, layout.nodes[0].x);
  assert.equal(layout.connections[2].toX, layout.nodes[1].x);
  assert.equal(layout.caption, "ROUND 1 · 2 PAIRS · GROUPS OF 4");
});

test("CPU layout exposes one accumulator and the current input", () => {
  const layout = projectReductionLayout({ kind: "cpu", step: 2, sum: 4, values: [3, 1, 4], activeIndex: 1, done: false }, 600, 320);
  assert.equal(layout.mode, "cpu");
  assert.equal(layout.accumulator.value, 4);
  assert.equal(layout.activeIndex, 1);
  assert.equal(layout.caption, "STEP 2 · ONE ADDITION");
});

test("canvas projection rejects unusable dimensions", () => {
  assert.throws(() => projectReductionLayout({ kind: "gpu", round: 0, values: [1], active: [true], pairs: [], laneCount: 1 }, 0, 320), /positive/);
});

test("the final GPU sum is centered", () => {
  const layout = projectReductionLayout({ kind: "gpu", round: 3, inputs: [4, 5], values: [9], active: [true], pairs: [[0, 1]], laneCount: 1, done: true }, 600, 320);
  assert.equal(layout.nodes[0].x, 300);
});

test("sixteen GPU lanes remain separate on a phone canvas", () => {
  const frame = { kind: "gpu", round: 0, inputs: [], values: Array(16).fill(3), active: Array(16).fill(true), pairs: [], laneCount: 16, groupSize: 8, done: false };
  const layout = projectReductionLayout(frame, 290, 300);
  const gap = layout.nodes[1].x - layout.nodes[0].x;
  assert.ok(layout.nodeRadius * 2 < gap);
});

test("rounds beyond a workgroup are labeled as partial-sum merges", () => {
  const layout = projectReductionLayout({ kind: "gpu", phase: "merge", round: 3, inputs: [4, 5, 6, 7], values: [9, 13], active: [true, true], pairs: [[0, 1], [2, 3]], laneCount: 2, groupSize: 4, groupIds: [0, 0], done: false }, 600, 320);
  assert.equal(layout.caption, "ROUND 3 · MERGE PARTIAL SUMS");
});

test("layout exposes visible boundaries between workgroups", () => {
  const layout = projectReductionLayout({ kind: "gpu", phase: "local", round: 1, inputs: Array(8).fill(1), values: [2, 2, 2, 2], active: Array(4).fill(true), pairs: [[0, 1], [2, 3], [4, 5], [6, 7]], laneCount: 4, groupSize: 4, groupIds: [0, 0, 1, 1], done: false }, 600, 320);
  assert.equal(layout.groupBoundaries.length, 1);
  assert.ok(layout.groupBoundaries[0] > layout.nodes[1].x);
  assert.ok(layout.groupBoundaries[0] < layout.nodes[2].x);
});
