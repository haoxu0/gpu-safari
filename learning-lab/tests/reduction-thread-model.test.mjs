import test from "node:test";
import assert from "node:assert/strict";
import { buildGpuThreadTimeline, projectThreadActivity } from "../src/reduction-thread-model.mjs";

test("every GPU reduction round expands into read add write and barrier", () => {
  const frames = buildGpuThreadTimeline([3, 1, 4, 1], 4);
  assert.equal(frames[0].microPhase, "ready");
  assert.deepEqual(frames.slice(1, 5).map(({ microPhase }) => microPhase), ["read", "add", "write", "barrier"]);
  assert.equal(frames.filter(({ done }) => done).length, 1);
  assert.equal(frames.at(-1).microPhase, "barrier");
});

test("the first round shows active threads and idle threads separately", () => {
  const frame = buildGpuThreadTimeline([3, 1, 4, 1, 5, 9, 2, 6], 8).find(({ microPhase }) => microPhase === "read");
  const activity = projectThreadActivity(frame, 0);
  assert.equal(activity.threads.length, 8);
  assert.deepEqual(activity.threads.map(({ status }) => status), ["active", "active", "active", "active", "idle", "idle", "idle", "idle"]);
  assert.equal(activity.selected.detail, "T0 reads 3 and 1 from shared memory.");
});

test("padding-only work is masked rather than presented as useful work", () => {
  const frame = buildGpuThreadTimeline([3, 1, 4], 4).find(({ microPhase }) => microPhase === "read");
  const activity = projectThreadActivity(frame, 1);
  assert.equal(activity.threads[1].status, "active");
  assert.equal(activity.selected.detail, "T1 reads 4 and padding 0 from shared memory.");
});

test("every thread waits at the workgroup barrier", () => {
  const frame = buildGpuThreadTimeline([3, 1, 4, 1], 4).find(({ microPhase }) => microPhase === "barrier");
  const activity = projectThreadActivity(frame, 3);
  assert.deepEqual(activity.threads.map(({ status }) => status), ["waiting", "waiting", "waiting", "waiting"]);
  assert.equal(activity.selected.detail, "T3 waits for the other threads in WG 0.");
});

test("multiple workgroups keep stable thread and group identities", () => {
  const frame = buildGpuThreadTimeline([3, 1, 4, 1, 5, 9, 2, 6], 4).find(({ microPhase, round }) => microPhase === "add" && round === 1);
  const activity = projectThreadActivity(frame, 4);
  assert.equal(activity.threads[4].groupId, 1);
  assert.equal(activity.selected.detail, "T4 adds 5 + 9 = 14.");
});

test("selected thread is clamped when a merge dispatch has fewer workers", () => {
  const frame = buildGpuThreadTimeline([3, 1, 4, 1, 5, 9, 2, 6], 4).find(({ phase, microPhase }) => phase === "merge" && microPhase === "read");
  const activity = projectThreadActivity(frame, 7);
  assert.equal(activity.selected.threadId, 3);
});
