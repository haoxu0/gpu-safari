import test from "node:test";
import assert from "node:assert/strict";

import {
  RACE_WORKLOADS,
  buildRaceSummary,
  formatObservedTime,
  observeTimerResolution,
  runCpuPaint,
} from "../src/race-runner.mjs";

function measuredResult(value, { resolution = 0.1, checksum = 32, passed = true } = {}) {
  return {
    measurements: [{ value, resolution_ms: resolution }],
    correctness: { passed },
    output: { checksum },
  };
}

test("race workloads progress from the teaching picture to enough parallel work", () => {
  assert.deepEqual(RACE_WORKLOADS, [64, 65_536, 1_048_576]);
});

test("CPU paint runs the same operation and reports browser-observed loop time", () => {
  const ticks = [10, 11.25];
  const result = runCpuPaint({ pixels: 4, now: () => ticks.shift(), timerResolutionMs: 0.1 });

  assert.equal(result.provider, "browser-cpu");
  assert.equal(result.workload.pixels, 4);
  assert.deepEqual(result.measurements, [{ name: "browser_cpu_loop", value: 1.25, unit: "ms", resolution_ms: 0.1 }]);
  assert.deepEqual(result.correctness, { passed: true, max_abs_error: 0 });
  assert.deepEqual(result.output, { checksum: 2 });
});

test("race summary names the observed winner and computes a stable ratio", () => {
  const summary = buildRaceSummary({
    cpu: measuredResult(8),
    gpu: measuredResult(2),
    pixels: 65_536,
  });

  assert.equal(summary.winner, "gpu");
  assert.equal(summary.ratio, 4);
  assert.match(summary.message, /GPU path finished first/);
});

test("tiny CPU wins are explained as launch overhead rather than GPU failure", () => {
  const summary = buildRaceSummary({
    cpu: measuredResult(0.2),
    gpu: measuredResult(1.2),
    pixels: 64,
  });

  assert.equal(summary.winner, "cpu");
  assert.match(summary.message, /dispatch and readback overhead/i);
});

test("sub-resolution measurements never produce a misleading speed ratio", () => {
  const summary = buildRaceSummary({
    cpu: measuredResult(0),
    gpu: measuredResult(237.7),
    pixels: 64,
  });

  assert.equal(summary.winner, null);
  assert.equal(summary.ratio, null);
  assert.match(summary.message, /timer resolution/i);
  assert.deepEqual(summary.unresolved, ["cpu"]);
  assert.equal(formatObservedTime(0, 0.1), "At or below timer resolution");
  assert.equal(formatObservedTime(1.23456, 0.1), "1.2346 ms");
});

test("an unresolved GPU time also suppresses the winner and comparison", () => {
  const summary = buildRaceSummary({
    cpu: measuredResult(3),
    gpu: measuredResult(0.1),
    pixels: 65_536,
  });

  assert.equal(summary.winner, null);
  assert.equal(summary.ratio, null);
  assert.deepEqual(summary.unresolved, ["gpu"]);
  assert.match(summary.message, /cannot name a winner/i);
});

test("timer resolution is observed from the smallest positive clock step", () => {
  const ticks = [10, 10, 10.2, 10.2, 10.3];

  assert.equal(observeTimerResolution(() => ticks.shift(), 4), 0.1);
});

test("race summary rejects incorrect or mismatched outputs before timing comparison", () => {
  const valid = {
    measurements: [{ value: 2, resolution_ms: 0.1 }],
    correctness: { passed: true },
    output: { checksum: 32 },
  };

  assert.throws(() => buildRaceSummary({
    cpu: { ...valid, correctness: { passed: false } },
    gpu: valid,
    pixels: 64,
  }), /correct output/);
  assert.throws(() => buildRaceSummary({
    cpu: valid,
    gpu: { ...valid, output: { checksum: 31 } },
    pixels: 64,
  }), /checksums must match/);
});

test("race summary rejects missing and non-finite timings", () => {
  const valid = {
    measurements: [{ value: 2, resolution_ms: 0.1 }],
    correctness: { passed: true },
    output: { checksum: 32 },
  };

  assert.throws(() => buildRaceSummary({ cpu: valid, gpu: { ...valid, measurements: [] }, pixels: 64 }), /finite timing/);
  assert.throws(() => buildRaceSummary({ cpu: valid, gpu: { ...valid, measurements: [{ value: Number.NaN }] }, pixels: 64 }), /finite timing/);
});
