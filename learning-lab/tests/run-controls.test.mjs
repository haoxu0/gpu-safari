import test from "node:test";
import assert from "node:assert/strict";

import { renderExecutionCards } from "../src/run-controls.mjs";

test("execution targets render as two distinct CPU and GPU cards", () => {
  const html = renderExecutionCards({ cpuRun: null, gpuRun: null, running: null, gpuAvailable: true, codeMode: "cpu" });

  assert.match(html, /class="run-target-grid"/);
  assert.match(html, /class="run-target-card is-selected cpu-target"/);
  assert.match(html, /class="run-target-card gpu-target"/);
  assert.match(html, /data-run="cpu"[^>]*>Run CPU/);
  assert.match(html, /data-run="webgpu"[^>]*>Run GPU/);
  assert.match(html, /data-view-code="cpu"[^>]*aria-pressed="true"/);
  assert.match(html, /data-view-code="webgpu"[^>]*aria-pressed="false"/);
});

test("each execution card owns its run status", () => {
  const html = renderExecutionCards({ cpuRun: { result: {} }, gpuRun: null, running: "webgpu", gpuAvailable: true, codeMode: "webgpu" });

  assert.match(html, /CPU measured/);
  assert.match(html, /Running on GPU/);
  assert.match(html, /gpu-target is-selected/);
});

test("an unavailable browser GPU stays explained inside the GPU card", () => {
  const html = renderExecutionCards({ cpuRun: null, gpuRun: null, running: null, gpuAvailable: false, codeMode: "cpu" });

  assert.match(html, /data-run="webgpu" disabled/);
  assert.match(html, /WebGPU unavailable in this browser/);
});
