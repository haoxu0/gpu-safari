import test from "node:test";
import assert from "node:assert/strict";

import { buildCodePhaseSelection, renderRunWorkspace } from "../src/run-workspace.mjs";

test("CPU and WebGPU phases select the code that performs the visible work", () => {
  assert.match(buildCodePhaseSelection({ backend: "cpu", phase: "work", workerId: null }).highlightedToken, /output\[pixel\]/);
  assert.match(buildCodePhaseSelection({ backend: "webgpu", phase: "prepare", workerId: null }).highlightedToken, /createCommandEncoder/);
  assert.match(buildCodePhaseSelection({ backend: "webgpu", phase: "submit", workerId: null }).highlightedToken, /queue\.submit/);
  assert.match(buildCodePhaseSelection({ backend: "webgpu", phase: "readback", workerId: null }).highlightedToken, /mapAsync/);
});

test("a selected GPU worker highlights the shader invocation", () => {
  const selection = buildCodePhaseSelection({ backend: "webgpu", phase: "work", workerId: 10 });
  assert.match(selection.highlightedToken, /global_invocation_id/);
  assert.match(selection.caption, /Worker 10.*pixel 10/);
});

test("code can be hidden without removing the processing visualization", () => {
  const hidden = renderRunWorkspace({ backend: "cpu", sceneHtml: "<svg>scene</svg>", codeVisible: false, codeSelection: null });
  assert.match(hidden, /<svg>scene<\/svg>/);
  assert.doesNotMatch(hidden, /run-code-panel/);
  assert.match(hidden, /Show code/);
});
