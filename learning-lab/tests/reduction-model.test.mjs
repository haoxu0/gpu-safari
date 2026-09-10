import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCpuReductionFrames,
  buildGpuReductionFrames,
  buildReductionComparison,
  reductionValues,
} from "../src/reduction-model.mjs";

test("the reduction problem provides deterministic positive values", () => {
  assert.deepEqual(reductionValues(8), [3, 1, 4, 1, 5, 9, 2, 6]);
  assert.throws(() => reductionValues(7), /8, 16, or 32/);
});

test("CPU frames add exactly one value at a time", () => {
  const frames = buildCpuReductionFrames([3, 1, 4, 1]);
  assert.equal(frames.length, 4);
  assert.deepEqual(frames.map((frame) => frame.sum), [3, 4, 8, 9]);
  assert.deepEqual(frames.at(-1).values, [9]);
  assert.equal(frames.at(-1).done, true);
});

test("GPU frames combine every pair in parallel rounds", () => {
  const frames = buildGpuReductionFrames([3, 1, 4, 1], 4);
  assert.deepEqual(frames.map((frame) => frame.values), [
    [3, 1, 4, 1],
    [4, 5],
    [9],
  ]);
  assert.deepEqual(frames[1].pairs, [[0, 1], [2, 3]]);
  assert.deepEqual(frames[1].inputs, [3, 1, 4, 1]);
  assert.equal(frames.at(-1).done, true);
});

test("GPU frames visibly mask padding without changing the sum", () => {
  const frames = buildGpuReductionFrames([3, 1, 4], 4);
  assert.equal(frames[0].laneCount, 4);
  assert.deepEqual(frames[0].active, [true, true, true, false]);
  assert.equal(frames.at(-1).values[0], 8);
});

test("a larger workgroup exposes inactive lanes", () => {
  const frames = buildGpuReductionFrames([3, 1, 4, 1, 5, 9, 2, 6], 16);
  assert.equal(frames[0].laneCount, 16);
  assert.equal(frames[0].active.filter(Boolean).length, 8);
  assert.equal(frames[0].active.filter((active) => !active).length, 8);
});

test("multiple workgroups reduce locally before partial sums merge", () => {
  const frames = buildGpuReductionFrames([3, 1, 4, 1, 5, 9, 2, 6], 4);
  assert.equal(frames[0].groupCount, 2);
  assert.deepEqual(frames[1].groupIds, [0, 0, 1, 1]);
  assert.equal(frames[1].phase, "local");
  assert.equal(frames.at(-1).phase, "merge");
  assert.equal(frames.at(-1).values[0], 31);
});

test("comparison distinguishes sequential additions from parallel rounds", () => {
  assert.deepEqual(buildReductionComparison([3, 1, 4, 1], 4), {
    sum: 9,
    outputsMatch: true,
    cpuAdditions: 3,
    gpuRounds: 2,
    operationCount: 3,
  });
});
