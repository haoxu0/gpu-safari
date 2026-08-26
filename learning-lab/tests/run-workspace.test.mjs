import test from "node:test";
import assert from "node:assert/strict";

import { buildCodePhaseSelection, renderRunWorkspace } from "../src/run-workspace.mjs";

test("CPU and WebGPU phases select the code that performs the visible work", () => {
  assert.match(buildCodePhaseSelection({ executionBackend: "cpu", codePlatform: "webgpu", phase: "work", workerId: null, pixels:64, groupSize:8 }).highlightedToken, /output\[pixel\]/);
  assert.match(buildCodePhaseSelection({ executionBackend: "webgpu", codePlatform: "webgpu", phase: "prepare", workerId: null, pixels:64, groupSize:8 }).highlightedToken, /createCommandEncoder/);
});

test("a selected GPU worker highlights the shader invocation", () => {
  const selection = buildCodePhaseSelection({ executionBackend: "webgpu", codePlatform: "cuda", phase: "work", workerId: 10, pixels:64, groupSize:8 });
  assert.match(selection.highlightedToken, /blockIdx/);
  assert.match(selection.caption, /Worker 10.*pixel 10/);
});

test("GPU syntax tabs distinguish running code from equivalents", () => {
  const selection = buildCodePhaseSelection({ executionBackend:"webgpu", codePlatform:"triton", phase:"work", workerId:0, pixels:65536, groupSize:16, gpuHasRun:true });
  const html = renderRunWorkspace({ backend:"webgpu", codePlatform:"triton", sceneHtml:"<svg></svg>", codeVisible:true, codeSelection:selection, platforms:["webgpu","cuda","triton","metal","hip"] });
  assert.match(html, /role="tablist"/); assert.match(html, /aria-selected="true"/);
  assert.match(html, /Equivalent syntax · not executed/); assert.match(html, /role="tabpanel"/);
  assert.doesNotMatch(html, /data-run="triton"/);
});

test("code can be hidden without removing the processing visualization", () => {
  const hidden = renderRunWorkspace({ backend: "cpu", sceneHtml: "<svg>scene</svg>", codeVisible: false, codeSelection: null });
  assert.match(hidden, /<svg>scene<\/svg>/);
  assert.doesNotMatch(hidden, /run-code-panel/);
  assert.match(hidden, /Show code/);
});
