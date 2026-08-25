import { CODE_SAMPLES, getCodeSelection } from "./lesson-content.mjs";

const WEBGPU_HOST = `const encoder = device.createCommandEncoder();
const pass = encoder.beginComputePass();
pass.setPipeline(pipeline);
pass.dispatchWorkgroups(workgroupsX, workgroupsY);
pass.end();
device.queue.submit([encoder.finish()]);
await readback.mapAsync(GPUMapMode.READ);`;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildCodePhaseSelection({ backend, phase, workerId }) {
  if (backend === "cpu") {
    return {
      source: CODE_SAMPLES.cpu,
      highlightedToken: phase === "work" ? "output[pixel] = 0.5" : "new Float32Array(pixels)",
      caption: phase === "work" ? "The CPU loop paints one pixel per iteration." : "The CPU prepares one output array.",
    };
  }
  if (backend !== "webgpu") throw new Error(`Unknown runnable backend: ${backend}`);
  if (phase === "work" && workerId !== null) return getCodeSelection("webgpu", workerId);
  const tokens = {
    prepare: "createCommandEncoder",
    submit: "queue.submit",
    work: "dispatchWorkgroups",
    readback: "mapAsync",
    complete: "mapAsync",
    ready: "createCommandEncoder",
  };
  return {
    source: WEBGPU_HOST,
    highlightedToken: tokens[phase] ?? tokens.ready,
    caption: `WebGPU ${phase === "work" ? "dispatches workgroups" : phase}.`,
  };
}

function highlightedCode(selection) {
  const start = selection.source.indexOf(selection.highlightedToken);
  if (start < 0) return escapeHtml(selection.source);
  return `${escapeHtml(selection.source.slice(0, start))}<mark>${escapeHtml(selection.highlightedToken)}</mark>${escapeHtml(selection.source.slice(start + selection.highlightedToken.length))}`;
}

export function renderRunWorkspace({ backend, sceneHtml, codeVisible, codeSelection, dispatchFacts = "" }) {
  const code = codeVisible && codeSelection
    ? `<aside class="run-code-panel" aria-label="Code synchronized with the run"><div class="run-code-header"><strong>${backend === "cpu" ? "CPU · JavaScript" : "GPU · WebGPU"}</strong><button type="button" class="button button-quiet" data-toggle-code>Hide code</button></div><pre class="code-panel"><code>${highlightedCode(codeSelection)}</code></pre><p class="code-caption">${escapeHtml(codeSelection.caption)}</p><details class="other-platforms"><summary>Other platforms</summary><p>Metal, CUDA, and Triton use the same worker-to-output idea with different APIs.</p></details></aside>`
    : "";
  return `<div class="run-workspace ${codeVisible ? "has-code" : ""}"><section class="run-visual" aria-label="Processing visualization">${sceneHtml}${dispatchFacts}</section>${code}</div>${codeVisible ? "" : '<button type="button" class="button button-quiet show-code" data-toggle-code>Show code</button>'}`;
}
