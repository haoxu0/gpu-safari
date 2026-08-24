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

test("workgroup geometry stays bounded and non-overlapping for every lesson size", () => {
  for (const groupSize of [4, 8, 16, 32]) {
    const layout = buildWorkgroupLayout({ totalPixels: 64, groupSize });
    for (const group of layout.groups) {
      assert.ok(group.x >= 0 && group.y >= 0);
      assert.ok(group.x + group.width <= layout.width);
      assert.ok(group.y + group.height <= layout.height);
    }
    for (let left = 0; left < layout.groups.length; left += 1) {
      for (let right = left + 1; right < layout.groups.length; right += 1) {
        const a = layout.groups[left];
        const b = layout.groups[right];
        const separated = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        assert.equal(separated, true, `groups ${left} and ${right} overlap at size ${groupSize}`);
      }
    }
    for (const worker of layout.workers) {
      assert.ok(worker.x >= 0 && worker.y >= 0);
      assert.ok(worker.x + worker.size <= layout.width);
      assert.ok(worker.y + worker.size <= layout.height);
    }
  }
});
