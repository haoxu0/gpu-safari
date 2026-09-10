import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkgroupLayout, renderProcessingScene, sceneFrameState } from "../src/processing-scene.mjs";

test("the scene distinguishes sequential and asynchronous processing", () => {
  const html = renderProcessingScene({
    totalPixels: 8,
    groupSize: 4,
    selectedWorker: null,
    frame: sceneFrameState(),
  });

  assert.match(html, /CPU · sequential/);
  assert.match(html, /GPU · asynchronous/);
  assert.match(html, /Slowed visual · not timing/);
  assert.doesNotMatch(html, /<svg|<circle|<rect|<text/);
  assert.match(html, /class="cpu-worker"/);
  assert.match(html, /class="gpu-worker/);
  assert.equal((html.match(/data-cpu-job=/g) ?? []).length, 8);
  assert.equal((html.match(/data-gpu-worker=/g) ?? []).length, 8);
});

test("the GPU path exposes every asynchronous phase", () => {
  const html = renderProcessingScene({
    totalPixels: 8,
    groupSize: 4,
    selectedWorker: null,
    frame: sceneFrameState({ phase: "submit" }),
  });

  for (const phase of ["prepare", "submit", "work", "readback"]) {
    assert.match(html, new RegExp(`data-phase="${phase}"`));
  }
  assert.doesNotMatch(html, /<button[^>]+data-phase=/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /CPU is free/);
});

test("workers are focusable and connect their identity to one pixel", () => {
  const html = renderProcessingScene({
    totalPixels: 8,
    groupSize: 4,
    selectedWorker: 3,
    frame: sceneFrameState({ gpuPainted: [0, 1, 2, 3], selectedWorker: 3 }),
  });

  assert.match(html, /data-gpu-worker="3"[^>]*role="button"[^>]*tabindex="0"/);
  assert.match(html, /aria-label="Worker 3; paints pixel 3; selected"/);
  assert.match(html, /data-pixel="3"[^>]*is-selected/);
});

test("a partial final workgroup renders masked overflow workers", () => {
  const html = renderProcessingScene({
    totalPixels: 10,
    groupSize: 4,
    selectedWorker: null,
    frame: sceneFrameState(),
  });

  assert.equal((html.match(/data-gpu-worker=/g) ?? []).length, 12);
  assert.equal((html.match(/is-masked/g) ?? []).length, 2);
  assert.match(html, /Worker 10; masked outside the image/);
});

test("scene frame state copies input arrays and validates phases", () => {
  const painted = [0, 1];
  const state = sceneFrameState({ cpuPainted: painted, phase: "work" });
  painted.push(2);

  assert.deepEqual(state.cpuPainted, [0, 1]);
  assert.throws(() => sceneFrameState({ phase: "finished" }), RangeError);
});

test("workgroup layout contains logical workers without renderer coordinates", () => {
  for (const groupSize of [4, 8, 16, 32]) {
    const layout = buildWorkgroupLayout({ totalPixels: 64, groupSize });
    assert.equal(layout.groups.length, Math.ceil(64 / groupSize));
    assert.equal(layout.workers.length, 64);
    assert.deepEqual(layout.groups[0].workerIds, Array.from({ length: groupSize }, (_, id) => id));
    assert.equal("x" in layout.groups[0], false);
    assert.equal("size" in layout.workers[0], false);
  }
});

test("a real dispatch replay distinguishes measured facts from illustrative scheduling", () => {
  const html = renderProcessingScene({
    totalPixels: 8,
    groupSize: 4,
    selectedWorker: null,
    frame: sceneFrameState({ phase: "work", gpuPainted: [0, 1, 2, 3] }),
    presentation: "dispatch-replay",
  });

  assert.match(html, /Real WebGPU dispatch/);
  assert.match(html, /Worker timing is illustrative/);
  assert.doesNotMatch(html, /Slowed visual · not timing/);
});
