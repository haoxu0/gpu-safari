import test from "node:test";
import assert from "node:assert/strict";

import { getAvailableLessons, getLesson, LESSONS } from "../src/lesson-catalog.mjs";

test("the catalog exposes two available beginner lessons with stable routes", () => {
  assert.equal(LESSONS.length >= 4, true);
  assert.deepEqual(getAvailableLessons().map(({ id, route }) => ({ id, route })), [
    { id: "paint-pixels", route: "./learn/paint-pixels/" },
    { id: "parallel-reduction", route: "./learn/parallel-reduction/" },
  ]);

  const lesson = getLesson("paint-pixels");
  assert.equal(lesson.title, "Paint Pixels in Parallel");
  assert.equal(lesson.difficulty, "Beginner");
  assert.equal(lesson.durationMinutes, 10);
  assert.deepEqual(lesson.ecosystems, ["Metal", "Triton", "CUDA"]);
});

test("parallel reduction follows paint pixels as the second foundation lesson", () => {
  const lesson = getLesson("parallel-reduction");
  assert.equal(lesson.title, "Add It Up Together");
  assert.equal(lesson.difficulty, "Beginner");
  assert.deepEqual(lesson.ecosystems, ["WebGPU", "CUDA", "Triton", "Metal", "HIP"]);
});

test("the catalog marks future trails unavailable instead of linking to unfinished pages", () => {
  const upcoming = LESSONS.filter((lesson) => lesson.status === "upcoming");

  assert.equal(upcoming.length >= 3, true);
  assert.equal(upcoming.every((lesson) => lesson.route === null), true);
  assert.deepEqual(
    upcoming.map((lesson) => lesson.id),
    ["cuda-memory", "triton-tiles", "rocm-first-kernel", "profile-kernels", "ai-workload"],
  );
});

test("unknown lesson IDs fail clearly", () => {
  assert.throws(() => getLesson("missing"), /Unknown lesson: missing/);
});
