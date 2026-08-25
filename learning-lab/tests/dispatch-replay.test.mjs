import test from "node:test";
import assert from "node:assert/strict";

import { buildDispatchReplay, renderDispatchFacts } from "../src/dispatch-replay.mjs";

test("dispatch replay follows the real phase order and workgroup shape", () => {
  const replay = buildDispatchReplay({
    pixels: 64,
    groupSize: 8,
    dispatch: { workgroups_x: 8, workgroups_y: 1, total_workgroups: 8 },
  });

  assert.equal(replay.visiblePixels, 64);
  assert.equal(replay.isRepresentative, false);
  assert.deepEqual(replay.frames[0].cpuPainted, Array.from({ length: 64 }, (_, id) => id));
  assert.deepEqual(replay.frames.map(({ phase }) => phase), [
    "prepare", "submit", "work", "work", "work", "work",
    "work", "work", "work", "work", "readback", "complete",
  ]);
  assert.deepEqual(replay.frames.at(-2).gpuPainted, Array.from({ length: 64 }, (_, id) => id));
});

test("large dispatch replay uses a labeled representative window", () => {
  const replay = buildDispatchReplay({
    pixels: 1_048_576,
    groupSize: 8,
    dispatch: { workgroups_x: 65_535, workgroups_y: 3, total_workgroups: 131_072 },
  });

  assert.equal(replay.visiblePixels, 64);
  assert.equal(replay.visibleWorkgroups, 8);
  assert.equal(replay.totalWorkgroups, 131_072);
  assert.equal(replay.isRepresentative, true);
});

test("dispatch facts label full measured work separately from the representative animation", () => {
  const replay = buildDispatchReplay({
    pixels: 1_048_576,
    groupSize: 8,
    dispatch: { workgroups_x: 65_535, workgroups_y: 3, total_workgroups: 131_072 },
  });
  const html = renderDispatchFacts({
    replay,
    device: "Apple GPU via Metal",
    pixels: 1_048_576,
    groupSize: 8,
  });

  assert.match(html, /Apple GPU via Metal/);
  assert.match(html, /1,048,576/);
  assert.match(html, /131,072/);
  assert.match(html, /Representative view · 64 of 1,048,576 workers/);
  assert.match(html, /Worker timing is illustrative/);
});
