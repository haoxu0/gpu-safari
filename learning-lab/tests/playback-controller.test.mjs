import test from "node:test";
import assert from "node:assert/strict";

import { createPlaybackController } from "../src/playback-controller.mjs";

function createTestScheduler() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    schedule(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      callbacks.delete(id);
    },
    flushOne() {
      const entry = callbacks.entries().next().value;
      if (!entry) return;
      callbacks.delete(entry[0]);
      entry[1]();
    },
    flush() {
      while (callbacks.size) this.flushOne();
    },
  };
}

test("playback renders frames in order and returns to idle", () => {
  const seen = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onFrame: (frame) => seen.push(frame.phase),
  });

  controller.play([{ phase: "prepare" }, { phase: "submit" }], 100);
  scheduler.flush();

  assert.deepEqual(seen, ["prepare", "submit"]);
  assert.equal(controller.isRunning(), false);
});

test("reset cancels pending frames and returns playback to idle", () => {
  const seen = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onFrame: (frame) => seen.push(frame.phase),
  });

  controller.play([{ phase: "prepare" }, { phase: "submit" }], 100);
  controller.reset();
  scheduler.flush();

  assert.deepEqual(seen, []);
  assert.equal(controller.isRunning(), false);
  assert.equal(controller.frameCount(), 0);
  assert.equal(controller.currentIndex(), -1);
});

test("pause preserves the current frame and replay starts from frame zero", () => {
  const seen = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onFrame: (frame) => seen.push(frame.phase),
  });

  const frames = [{ phase: "prepare" }, { phase: "submit" }];
  controller.play(frames, 100);
  scheduler.flushOne();
  controller.pause();
  scheduler.flush();
  controller.play(frames, 100);
  scheduler.flush();

  assert.deepEqual(seen, ["prepare", "prepare", "submit"]);
});

test("zero-delay playback still follows scheduler order", () => {
  const seen = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onFrame: (frame) => seen.push(frame.phase),
  });

  controller.play([{ phase: "prepare" }, { phase: "readback" }], 0);
  assert.deepEqual(seen, []);
  scheduler.flush();
  assert.deepEqual(seen, ["prepare", "readback"]);
});

test("seek renders one deterministic frame and reports its index", () => {
  const seen = [];
  const states = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({ schedule: scheduler.schedule, cancel: scheduler.cancel, onFrame: (frame) => seen.push(frame.phase), onStateChange: (state) => states.push(state) });
  const frames = [{ phase: "prepare" }, { phase: "submit" }, { phase: "work" }];
  controller.load(frames);
  controller.seek(2);
  assert.deepEqual(seen, ["work"]);
  assert.equal(controller.currentIndex(), 2);
  assert.equal(controller.isRunning(), false);
  assert.equal(states.at(-1).index, 2);
});

test("loading a timeline does not publish a transient empty state", () => {
  const states=[]; const scheduler=createTestScheduler();
  const controller=createPlaybackController({schedule:scheduler.schedule,cancel:scheduler.cancel,onFrame:()=>{},onStateChange:state=>states.push(state)});
  controller.load([{phase:"prepare"},{phase:"submit"}]);
  assert.deepEqual(states.map(({count})=>count),[2]);
});
