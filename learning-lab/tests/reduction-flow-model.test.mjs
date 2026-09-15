import test from "node:test";
import assert from "node:assert/strict";
import { advanceReductionMachine, flowProgressAt, flowStartForProgress, projectReductionMachine } from "../src/reduction-flow-model.mjs";

const frame = {
  kind: "gpu", phase: "local", microPhase: "read", round: 1,
  inputs: [3, 1, 4, 1, 5, 9, 2, 6], inputActive: Array(8).fill(true),
  values: [4, 5, 14, 8], active: Array(4).fill(true),
  pairs: [[0, 1], [2, 3], [4, 5], [6, 7]], groupIds: [0, 0, 1, 1],
  groupSize: 4, groupCount: 2, done: false,
};

test("machine projection exposes memory workgroups threads compute and shared memory", () => {
  const machine = projectReductionMachine(frame, 800, 560, 0, 0.5);
  assert.equal(machine.globalMemory.label, "GLOBAL MEMORY");
  assert.equal(machine.workgroups.length, 2);
  assert.equal(machine.workgroups[0].threads.length, 4);
  assert.equal(machine.workgroups[0].computeUnits.length, 4);
  assert.equal(machine.workgroups[0].sharedMemory.label, "SHARED MEMORY");
  assert.equal(machine.partialSums.label, "PARTIAL SUMS");
});

test("read round flows values from workgroup shared memory into active threads", () => {
  const machine = projectReductionMachine(frame, 800, 560, 0, 0.25);
  assert.equal(machine.flow.phase, "read");
  assert.equal(machine.flow.particles.length, 8);
  assert.ok(machine.flow.particles.every(({ source }) => source === "shared"));
  assert.ok(machine.flow.particles.some(({ selected }) => selected));
});

test("ready phase loads global values into each workgroup shared memory", () => {
  const ready = { ...frame, phase: "ready", microPhase: "ready", round: 0, inputs: [], values: frame.inputs, active: frame.inputActive, pairs: [], groupIds: [0, 0, 0, 0, 1, 1, 1, 1] };
  const machine = projectReductionMachine(ready, 800, 560, 0, 0.5);
  assert.equal(machine.flow.particles.length, 8);
  assert.ok(machine.flow.particles.every(({ source, target }) => source === "global" && target === "shared"));
  assert.ok(machine.flow.particles.every(({ points }) => points.length === 4));
  assert.equal(machine.partialSums.slots.length, 0);
});

test("write phase flows computed values into each workgroup shared memory", () => {
  const machine = projectReductionMachine({ ...frame, microPhase: "write" }, 800, 560, 1, 0.5);
  assert.equal(machine.flow.particles.length, 4);
  assert.ok(machine.flow.particles.every(({ source, target }) => source === "compute" && target === "shared"));
});

test("barrier stops data flow inside each workgroup", () => {
  const machine = projectReductionMachine({ ...frame, microPhase: "barrier" }, 800, 560, 0, 0.5);
  assert.equal(machine.flow.particles.length, 0);
  assert.deepEqual(machine.workgroups.map(({ barrier }) => barrier.active), [true, true]);
});

test("merge dispatch draws partial sums flowing into one new workgroup", () => {
  const merge = { ...frame, phase: "merge", round: 4, inputs: [9, 22], inputActive: [true, true], values: [31], active: [true], pairs: [[0, 1]], groupIds: [0], groupCount: 2 };
  const machine = projectReductionMachine(merge, 800, 560, 0, 0.5);
  assert.equal(machine.workgroups.length, 1);
  assert.ok(machine.flow.particles.every(({ source }) => source === "partial"));
  assert.equal(machine.flow.particles[0].from.y, machine.partialSums.slots[0].y);
});

test("many workgroups form readable rows on a phone instead of collapsing horizontally", () => {
  const dense = { ...frame, inputs: Array(32).fill(1), inputActive: Array(32).fill(true), values: Array(16).fill(2), active: Array(16).fill(true), pairs: Array.from({ length: 16 }, (_, index) => [index * 2, index * 2 + 1]), groupIds: Array.from({ length: 16 }, (_, index) => Math.floor(index / 2)), groupCount: 8 };
  const machine = projectReductionMachine(dense, 320, 720, 0, 0.5);
  assert.equal(new Set(machine.workgroups.map(({ top }) => top)).size, 4);
  assert.ok(machine.workgroups.every(({ left, right }) => right - left >= 120));
});

test("flow progress loops smoothly for continuous glowing pulses", () => {
  assert.equal(flowProgressAt(0), 0);
  assert.equal(flowProgressAt(450), 0.5);
  assert.equal(flowProgressAt(900), 0);
});

test("cached machine geometry can advance particles without moving components", () => {
  const machine = projectReductionMachine(frame, 800, 560, 0, 0);
  const advanced = advanceReductionMachine(machine, 0.75);
  assert.equal(advanced.workgroups, machine.workgroups);
  assert.notEqual(advanced.flow.particles[0].y, machine.flow.particles[0].y);
});

test("resuming rebases the phase clock to the frozen pulse position", () => {
  const startedAt = flowStartForProgress(10_000, 0.4);
  assert.equal(startedAt, 9_640);
  assert.equal(flowProgressAt(10_000 - startedAt), 0.4);
});
