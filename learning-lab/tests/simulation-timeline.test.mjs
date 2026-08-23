import test from "node:test";
import assert from "node:assert/strict";

import { buildProcessingTimeline } from "../src/simulation-timeline.mjs";

test("CPU processing visits exactly one pixel per sequential frame", () => {
  const timeline = buildProcessingTimeline({ totalPixels: 8, groupSize: 4 });

  assert.deepEqual(timeline.cpu.map((frame) => frame.pixelIds), [
    [0], [1], [2], [3], [4], [5], [6], [7],
  ]);
});

test("GPU processing exposes async phases and paints a workgroup in each wave", () => {
  const timeline = buildProcessingTimeline({ totalPixels: 10, groupSize: 4 });

  assert.deepEqual(timeline.gpu, [
    { phase: "prepare", pixelIds: [] },
    { phase: "submit", pixelIds: [] },
    { phase: "work", pixelIds: [0, 1, 2, 3] },
    { phase: "work", pixelIds: [4, 5, 6, 7] },
    { phase: "work", pixelIds: [8, 9] },
    { phase: "readback", pixelIds: [] },
  ]);
});

test("processing timeline rejects invalid dimensions", () => {
  assert.throws(() => buildProcessingTimeline({ totalPixels: 0, groupSize: 4 }), RangeError);
  assert.throws(() => buildProcessingTimeline({ totalPixels: 8, groupSize: 0 }), RangeError);
  assert.throws(() => buildProcessingTimeline({ totalPixels: 8.5, groupSize: 4 }), RangeError);
});
