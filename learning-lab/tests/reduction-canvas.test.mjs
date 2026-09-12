import test from "node:test";
import assert from "node:assert/strict";
import { projectReductionLayout } from "../src/reduction-canvas.mjs";

const phasedFrame = { kind: "gpu", phase: "local", microPhase: "read", round: 1, inputs: [3, 1, 4, 1], inputActive: [true, true, true, true], values: [4, 5], active: [true, true], pairs: [[0, 1], [2, 3]], groupIds: [0, 0], laneCount: 2, groupSize: 4, groupCount: 1, done: false };

test("selected thread highlights the two shared-memory values it reads", () => {
  const layout = projectReductionLayout(phasedFrame, 600, 320, 1);
  assert.deepEqual(layout.selectedInputIndices, [2, 3]);
  assert.equal(layout.microPhase, "read");
});

test("barrier layout explicitly pauses the whole workgroup", () => {
  const layout = projectReductionLayout({ ...phasedFrame, microPhase: "barrier" }, 600, 320, 0);
  assert.equal(layout.barrierVisible, true);
  assert.equal(layout.barriers.length, 1);
});

test("each workgroup gets its own barrier instead of a global barrier", () => {
  const frame = { ...phasedFrame, inputs: [3, 1, 4, 1, 5, 9, 2, 6], inputActive: Array(8).fill(true), values: [4, 5, 14, 8], active: Array(4).fill(true), pairs: [[0, 1], [2, 3], [4, 5], [6, 7]], groupSize: 4, groupCount: 2, groupIds: [0, 0, 1, 1] };
  const layout = projectReductionLayout({ ...frame, microPhase: "barrier" }, 600, 320, 0);
  assert.deepEqual(layout.barriers.map(({ groupId }) => groupId), [0, 1]);
  assert.ok(layout.barriers[0].toX < layout.barriers[1].fromX);
});

test("later local rounds keep shrunken workgroup barriers separate", () => {
  const frame = { ...phasedFrame, inputs: [4, 5, 14, 8], inputActive: Array(4).fill(true), values: [9, 22], active: [true, true], pairs: [[0, 1], [2, 3]], groupSize: 8, groupCount: 2, groupIds: [0, 1] };
  const layout = projectReductionLayout({ ...frame, microPhase: "barrier" }, 600, 320, 0);
  assert.equal(layout.barriers.length, 2);
  assert.ok(layout.barriers[0].toX < layout.barriers[1].fromX);
});

test("dense phone barriers remain visibly separate for every workgroup", () => {
  const inputs = Array.from({ length: 32 }, (_, index) => index + 1);
  const frame = { ...phasedFrame, inputs, inputActive: Array(32).fill(true), values: Array(16).fill(3), active: Array(16).fill(true), pairs: Array.from({ length: 16 }, (_, index) => [index * 2, index * 2 + 1]), groupSize: 4, groupCount: 8, groupIds: Array.from({ length: 16 }, (_, index) => Math.floor(index / 2)) };
  const layout = projectReductionLayout({ ...frame, microPhase: "barrier" }, 320, 300, 0);
  assert.equal(layout.barriers.length, 8);
  for (let index = 1; index < layout.barriers.length; index += 1) assert.ok(layout.barriers[index - 1].toX < layout.barriers[index].fromX);
});

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
