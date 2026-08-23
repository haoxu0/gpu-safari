import { summarizeWebGpuOutput } from "./webgpu-runner.mjs";

export const RACE_WORKLOADS = Object.freeze([64, 65_536, 1_048_576]);
const FALLBACK_TIMER_RESOLUTION_MS = 0.1;

export function observeTimerResolution(now = () => performance.now(), maxSamples = 10_000) {
  let previous = now();
  let smallestStep = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample < maxSamples; sample += 1) {
    const current = now();
    const step = current - previous;
    if (step > 0) smallestStep = Math.min(smallestStep, step);
    previous = current;
  }
  return Number.isFinite(smallestStep)
    ? Number(smallestStep.toPrecision(12))
    : FALLBACK_TIMER_RESOLUTION_MS;
}

export function runCpuPaint({
  pixels,
  now = () => performance.now(),
  timerResolutionMs = observeTimerResolution(now),
}) {
  if (!Number.isInteger(pixels) || pixels <= 0 || pixels > RACE_WORKLOADS.at(-1)) {
    throw new RangeError("pixels must be a positive integer within the race limit");
  }
  const output = new Float32Array(pixels);
  const started = now();
  for (let pixel = 0; pixel < pixels; pixel += 1) output[pixel] = 0.5;
  const elapsedMs = now() - started;
  const summary = summarizeWebGpuOutput(output);
  return {
    schema_version: "1.0.0",
    experiment: "paint-pixels",
    provider: "browser-cpu",
    device: "Browser CPU · JavaScript",
    implementation: "JavaScript loop",
    workload: { pixels, dtype: "float32", group_size: 1 },
    correctness: { passed: summary.passed, max_abs_error: summary.maxAbsError },
    measurements: [{ name: "browser_cpu_loop", value: elapsedMs, unit: "ms", resolution_ms: timerResolutionMs }],
    output: { checksum: summary.checksum },
  };
}

export function buildRaceSummary({ cpu, gpu, pixels }) {
  const cpuMs = cpu.measurements[0].value;
  const gpuMs = gpu.measurements[0].value;
  const timerResolutionMs = cpu.measurements[0].resolution_ms ?? FALLBACK_TIMER_RESOLUTION_MS;
  const unresolved = [
    ...(cpuMs <= timerResolutionMs ? ["cpu"] : []),
    ...(gpuMs <= timerResolutionMs ? ["gpu"] : []),
  ];
  const winner = unresolved.length ? null : (gpuMs < cpuMs ? "gpu" : "cpu");
  const ratio = winner ? Math.max(cpuMs, gpuMs) / Math.min(cpuMs, gpuMs) : null;
  let message;
  if (unresolved.length) {
    message = `The ${unresolved.join(" and ").toUpperCase()} path finished at or below this browser's timer resolution, so we cannot name a winner for this run.`;
  } else if (winner === "gpu") {
    message = "The GPU path finished first for this run. More independent pixels gave its workers enough parallel work to offset launch costs.";
  } else if (pixels === 64) {
    message = "The CPU path finished first. With only 64 pixels, GPU dispatch and readback overhead cost more than the painting work.";
  } else {
    message = "The CPU path finished first in this browser-observed run. Hardware, browser scheduling, dispatch, and readback all influence the crossover point.";
  }
  return { winner, ratio, unresolved, timerResolutionMs, message };
}

export function formatObservedTime(milliseconds, timerResolutionMs) {
  return milliseconds <= timerResolutionMs ? "At or below timer resolution" : `${milliseconds.toFixed(4)} ms`;
}
