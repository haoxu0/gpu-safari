import test from "node:test";
import assert from "node:assert/strict";
import { moveGroupSelection, projectDispatchWorld } from "../src/dispatch-world-model.mjs";

const dispatch = { workgroups_x: 8, workgroups_y: 1, active_workgroups: 8, dispatched_workgroups: 8 };

test("GPU frames project observed work into illustrative workgroup states", () => {
  const frame = { phase: "work", cpuPainted: [], gpuPainted: [0, 1, 2, 3, 4, 5, 6, 7] };
  const scene = projectDispatchWorld({ frame, pixels: 64, groupSize: 8, dispatch, selectedGroup: 1, executionKind: "gpu", reducedMotion: false });
  assert.deepEqual(scene.groups.slice(0, 3).map(({ state }) => state), ["complete", "active", "waiting"]);
  assert.deepEqual(scene.selection, { groupId: 1, workerStart: 8, workerEnd: 15, pixelStart: 8, pixelEnd: 15 });
  assert.equal(scene.truth.observed, "64 pixels · 8 active workgroups");
  assert.equal(scene.truth.illustrated, "Workgroup waves are illustrated");
  assert.equal(scene.camera, "angled");
});

test("CPU frames advance one output without pretending to use workgroups", () => {
  const frame = { phase: "cpu", cpuPainted: [0, 1, 2], gpuPainted: [] };
  const scene = projectDispatchWorld({ frame, pixels: 64, groupSize: 8, dispatch: null, selectedGroup: 0, executionKind: "cpu", reducedMotion: true });
  assert.equal(scene.commandState, "work");
  assert.equal(scene.output.filter(({ state }) => state === "complete").length, 3);
  assert.equal(scene.groups.length, 0);
  assert.equal(scene.camera, "still");
});

test("partial final groups expose only active workers and pixels", () => {
  const scene = projectDispatchWorld({ frame: { phase: "complete", cpuPainted: [], gpuPainted: Array.from({ length: 10 }, (_, i) => i) }, pixels: 10, groupSize: 8, dispatch: { workgroups_x: 2, workgroups_y: 1, active_workgroups: 2, dispatched_workgroups: 2 }, selectedGroup: 1, executionKind: "gpu", reducedMotion: false });
  assert.deepEqual(scene.selection, { groupId: 1, workerStart: 8, workerEnd: 9, pixelStart: 8, pixelEnd: 9 });
  assert.equal(scene.output.length, 10);
});

test("arrow navigation remains inside the logical dispatch grid", () => {
  assert.equal(moveGroupSelection({ selectedGroup: 0, direction: "left", columns: 4, groupCount: 6 }), 0);
  assert.equal(moveGroupSelection({ selectedGroup: 0, direction: "right", columns: 4, groupCount: 6 }), 1);
  assert.equal(moveGroupSelection({ selectedGroup: 1, direction: "down", columns: 4, groupCount: 6 }), 5);
  assert.equal(moveGroupSelection({ selectedGroup: 5, direction: "right", columns: 4, groupCount: 6 }), 5);
});
