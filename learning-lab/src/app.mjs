import {
  LESSON_STEPS,
  advanceLesson,
  createLessonState,
  retreatLesson,
  selectWorker,
} from "./lesson-model.mjs";
import { CODE_SAMPLES, getCodeSelection, getLessonCopy } from "./lesson-content.mjs";
import { buildProcessingTimeline } from "./simulation-timeline.mjs";
import { renderProcessingScene, sceneFrameState } from "./processing-scene.mjs";
import { createPlaybackController } from "./playback-controller.mjs";
import { runWebGpuPaint, withWebGpuCapability } from "./webgpu-runner.mjs";
import {
  RACE_WORKLOADS,
  buildRaceSummary,
  formatObservedTime,
  runCpuPaint,
} from "./race-runner.mjs";

const TOTAL_PIXELS = 64;
const STEP_LABELS = ["See", "Experiment", "Race", "Code"];
const state = {
  lesson: createLessonState(),
  blockSize: 8,
  racePixels: 64,
  codeTab: "webgpu",
  frame: sceneFrameState(),
  reducedFrameIndex: 0,
  capabilities: null,
  executionResult: null,
  executionError: null,
  executionRunning: false,
};

const elements = {
  back: document.querySelector("#back-button"),
  next: document.querySelector("#next-button"),
  content: document.querySelector("#step-content"),
  count: document.querySelector("#step-count"),
  mode: document.querySelector("#execution-mode"),
  progress: document.querySelector("#progress-list"),
  panel: document.querySelector("#processing-panel"),
  scene: document.querySelector("#processing-scene"),
  status: document.querySelector("#processing-status"),
};

const playback = createPlaybackController({
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (id) => window.clearTimeout(id),
  onFrame: (frame) => {
    state.frame = frame;
    renderScene();
  },
});

function currentStep() {
  return LESSON_STEPS[state.lesson.stepIndex];
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatPixelCount(pixels) {
  return new Intl.NumberFormat("en-US").format(pixels);
}

function renderProgress() {
  elements.progress.innerHTML = STEP_LABELS.map((label, index) => {
    const status = index < state.lesson.stepIndex ? "complete" : index === state.lesson.stepIndex ? "current" : "upcoming";
    const marker = status === "complete" ? "✓" : String(index + 1).padStart(2, "0");
    return `<li class="progress-item progress-${status}" ${status === "current" ? 'aria-current="step"' : ""}><span class="progress-marker">${marker}</span><span>${label}</span></li>`;
  }).join("");
}

function buildVisualFrames() {
  const timeline = buildProcessingTimeline({ totalPixels: TOTAL_PIXELS, groupSize: state.blockSize });
  const allPixels = Array.from({ length: TOTAL_PIXELS }, (_, id) => id);
  const cpuPainted = [];
  const gpuPainted = [];
  const cpuFrames = timeline.cpu.map((frame) => {
    cpuPainted.push(...frame.pixelIds);
    return sceneFrameState({ cpuPainted, phase: "cpu", selectedWorker: state.lesson.selectedWorker });
  });
  const gpuFrames = timeline.gpu.map((frame) => {
    if (frame.phase === "work") gpuPainted.push(...frame.pixelIds);
    return sceneFrameState({ cpuPainted: allPixels, gpuPainted, phase: frame.phase, selectedWorker: state.lesson.selectedWorker });
  });
  return [...cpuFrames, ...gpuFrames, sceneFrameState({
    cpuPainted: allPixels,
    gpuPainted: allPixels,
    phase: "complete",
    selectedWorker: state.lesson.selectedWorker,
  })];
}

function reducedFrames() {
  const frames = buildVisualFrames();
  return [
    sceneFrameState(),
    frames.find((frame) => frame.phase === "cpu"),
    frames.find((frame) => frame.phase === "submit"),
    frames.find((frame) => frame.phase === "work"),
    frames.at(-1),
  ];
}

function seeMarkup() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return `<div class="copy-column compact-copy visual-step-copy">
    <p class="lede">Watch the same 64 jobs move through two different processing paths.</p>
    <div class="scene-controls"><button class="button button-quiet" type="button" data-reset-processing>Reset</button><button class="button button-primary" type="button" data-play-processing>${reducedMotion ? "Next phase" : "▶ Play processing"}</button></div>
  </div>`;
}

function experimentMarkup() {
  return `<div class="copy-column compact-copy visual-step-copy">
    <p class="lede">Change the number of workers in each wave. The same 64 jobs reorganize immediately.</p>
    <div class="experiment-controls"><label for="block-size"><span>Workers per wave</span><strong>${state.blockSize}</strong></label><input id="block-size" type="range" min="0" max="3" step="1" value="${[4, 8, 16, 32].indexOf(state.blockSize)}" aria-valuetext="${state.blockSize} workers per wave"><div class="group-size-labels" aria-hidden="true"><span>4</span><span>8</span><span>16</span><span>32</span></div><button class="button button-primary" type="button" data-play-processing>▶ Replay with ${state.blockSize}</button></div>
  </div>`;
}

function providerById(id) {
  return state.capabilities?.providers?.find((provider) => provider.id === id);
}

function raceMarkup() {
  const webgpu = providerById("browser-webgpu");
  const apple = providerById("apple-mlx");
  const modal = providerById("modal-triton");
  const webgpuReady = webgpu?.available === true;
  const appleReady = apple?.available === true;
  const modalReady = modal?.available === true;
  return `<div class="copy-column run-column">
    <p class="lede">Now measure equivalent work. This trace uses real JavaScript and WebGPU results—not the slowed animation.</p>
    <div class="provider-grid">
      <article class="provider-card provider-card-featured"><span class="provider-kind">Local · instant · no cloud charge</span><h2>CPU ↔ GPU race</h2><p>Same operation. Same output. Compare a JavaScript loop with a WGSL compute shader.</p><div class="execution-traces" aria-label="CPU and GPU execution paths"><div><strong>CPU · JavaScript</strong><span class="trace-segments cpu-trace" aria-hidden="true">${"<i></i>".repeat(8)}</span></div><div><strong>GPU · WebGPU</strong><span class="trace-segments gpu-trace" aria-hidden="true">${"<i></i>".repeat(8)}</span></div></div><label class="race-workload" for="race-workload"><span>Workload</span><select id="race-workload" ${state.executionRunning ? "disabled" : ""}>${RACE_WORKLOADS.map((pixels) => `<option value="${pixels}" ${state.racePixels === pixels ? "selected" : ""}>${formatPixelCount(pixels)} pixels</option>`).join("")}</select></label><p class="provider-status ${webgpuReady ? "is-ready" : ""}">${webgpuReady ? "Ready in this browser · No install" : webgpu?.reason ?? "Checking this browser…"}</p><button class="button button-primary" type="button" data-run-provider="browser-race" ${webgpuReady && !state.executionRunning ? "" : "disabled"}>Run CPU ↔ GPU race</button></article>
      <details class="advanced-runs"><summary>Advanced hardware paths</summary><div class="provider-grid advanced-provider-grid"><article class="provider-card"><span class="provider-kind">Advanced local · companion server</span><h2>Apple GPU · MLX</h2><p>Runs a custom Metal kernel on this Mac.</p><p class="provider-status ${appleReady ? "is-ready" : ""}">${apple ? (appleReady ? "Ready on this Mac" : apple.reason) : "Checking local companion…"}</p><button class="button button-primary" type="button" data-run-provider="apple-mlx" ${appleReady && !state.executionRunning ? "" : "disabled"}>Run on your Apple GPU</button></article><article class="provider-card"><span class="provider-kind">Cloud · explicit confirmation</span><h2>NVIDIA L4 · Triton</h2><p>Runs the equivalent masked Triton kernel through your authenticated Modal account.</p><p class="provider-status ${modalReady ? "is-ready" : ""}">${modal ? (modalReady ? "Modal CLI detected" : modal.reason) : "Checking local companion…"}</p><label class="cost-confirm"><input id="modal-confirm" type="checkbox"> Modal uses billable NVIDIA L4 compute. I want to launch one run.</label><button class="button button-quiet" type="button" data-run-provider="modal-triton" ${modalReady && !state.executionRunning ? "" : "disabled"}>Run once on Modal</button></article></div></details>
    </div><div id="gpu-run-status" class="gpu-run-status" aria-live="polite">${executionStatusMarkup()}</div>
  </div>`;
}

function highlightedCode(source, token) {
  const start = source.indexOf(token);
  if (start < 0) return escapeHtml(source);
  return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(token)}</mark>${escapeHtml(source.slice(start + token.length))}`;
}

function codeMarkup() {
  const tabs = ["webgpu", "metal", "triton", "cuda"];
  const selected = state.lesson.selectedWorker;
  const selection = selected === null ? null : getCodeSelection(state.codeTab, selected);
  const source = selection?.source ?? CODE_SAMPLES[state.codeTab];
  const code = selection ? highlightedCode(source, selection.highlightedToken) : escapeHtml(source);
  const caption = selection?.caption ?? "Select a worker in the processing scene to connect its identity to this code.";
  return `<div class="copy-column code-column"><p class="lede">Select a GPU worker below, then switch platforms. The same conceptual job stays highlighted.</p><div class="selected-worker-readout">${selected === null ? "Select a worker" : `Worker ${selected} ↔ pixel ${selected}`}</div><div class="code-tabs" role="group" aria-label="GPU implementation">${tabs.map((tab) => `<button type="button" class="code-tab ${state.codeTab === tab ? "is-selected" : ""}" aria-pressed="${state.codeTab === tab}" data-code-tab="${tab}">${tab === "webgpu" ? "WebGPU" : tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</div><pre class="code-panel" tabindex="0"><code>${code}</code></pre><p class="code-caption">${escapeHtml(caption)}</p></div>`;
}

function executionStatusMarkup() {
  if (state.executionRunning) return "Running both paths and validating their output…";
  if (state.executionError) return `<strong>Run unavailable</strong><span>${escapeHtml(state.executionError)}</span>`;
  if (!state.executionResult) return "Choose an available backend when you are ready.";
  const result = state.executionResult;
  if (result.provider === "browser-race") return raceStatusMarkup(result);
  const measurement = result.measurements[0];
  const browserRun = measurement.name === "browser_round_trip";
  return `<div class="result-heading"><span class="result-check">✓</span><div><strong>Correct output on ${escapeHtml(result.device)}</strong><span>${browserRun ? "Real GPU result · timing includes browser submission and readback" : "Measured GPU execution · not simulation"}</span></div></div><dl class="result-grid"><div><dt>Backend</dt><dd>${escapeHtml(result.implementation)}</dd></div><div><dt>${browserRun ? "Browser round trip" : "Kernel latency"}</dt><dd>${measurement.value.toFixed(4)} ms</dd></div><div><dt>Max error</dt><dd>${result.correctness.max_abs_error}</dd></div><div><dt>Checksum</dt><dd>${result.output.checksum}</dd></div></dl>`;
}

function raceStatusMarkup(result) {
  const cpuMs = result.cpu.measurements[0].value;
  const gpuMs = result.gpu.measurements[0].value;
  const comparable = result.summary.winner !== null;
  const fastest = Math.max(Math.min(cpuMs, gpuMs), Number.EPSILON);
  const width = (value) => Math.max(8, (fastest / Math.max(value, Number.EPSILON)) * 100);
  const heading = comparable ? `${result.summary.winner.toUpperCase()} finished first · ${result.summary.ratio.toFixed(2)}× difference.` : "No reliable winner for this run.";
  return `<div class="result-heading"><span class="result-check">✓</span><div><strong>Outputs match · ${formatPixelCount(result.pixels)} pixels</strong><span>Browser-observed comparison · not a hardware benchmark</span></div></div><div class="race-results"><div class="race-result"><div><strong>CPU · JavaScript</strong><span>${formatObservedTime(cpuMs, result.summary.timerResolutionMs)}</span></div>${comparable ? `<span class="race-track"><span style="width:${width(cpuMs)}%"></span></span>` : ""}</div><div class="race-result"><div><strong>GPU · WebGPU</strong><span>${formatObservedTime(gpuMs, result.summary.timerResolutionMs)}</span></div>${comparable ? `<span class="race-track"><span style="width:${width(gpuMs)}%"></span></span>` : ""}</div></div><p class="race-insight"><strong>${heading}</strong> ${escapeHtml(result.summary.message)}</p><p class="race-caveat">CPU time covers the JavaScript paint loop. GPU time covers browser submission through result readback.</p>`;
}

function renderScene() {
  if (elements.panel.hidden) return;
  elements.scene.innerHTML = renderProcessingScene({ totalPixels: TOTAL_PIXELS, groupSize: state.blockSize, selectedWorker: state.lesson.selectedWorker, frame: state.frame });
  elements.status.textContent = elements.scene.querySelector("[data-scene-status]")?.textContent ?? "Processing view ready";
  elements.scene.querySelectorAll("[data-gpu-worker]").forEach((worker) => {
    const activate = () => {
      const workerId = Number(worker.dataset.gpuWorker);
      if (workerId >= TOTAL_PIXELS) return;
      state.lesson = selectWorker(state.lesson, workerId, TOTAL_PIXELS);
      state.frame = sceneFrameState({ ...state.frame, selectedWorker: workerId });
      if (currentStep() === "code") renderStep(); else renderScene();
    };
    worker.addEventListener("click", activate);
    worker.addEventListener("keydown", (event) => {
      if (!new Set(["Enter", " "]).has(event.key)) return;
      event.preventDefault();
      activate();
    });
  });
  elements.scene.querySelectorAll("[data-phase]").forEach((button) => button.addEventListener("click", () => {
    playback.pause();
    state.frame = sceneFrameState({ ...state.frame, phase: button.dataset.phase });
    renderScene();
  }));
}

function playProcessing() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    const frames = reducedFrames();
    state.reducedFrameIndex = (state.reducedFrameIndex + 1) % frames.length;
    state.frame = frames[state.reducedFrameIndex];
    renderScene();
    return;
  }
  state.frame = sceneFrameState();
  renderScene();
  playback.play(buildVisualFrames(), 34);
}

function resetProcessing() {
  playback.reset();
  state.reducedFrameIndex = 0;
  state.frame = sceneFrameState({ selectedWorker: state.lesson.selectedWorker });
  renderScene();
}

function renderStep() {
  playback.reset();
  const step = currentStep();
  const copy = getLessonCopy(step);
  const content = { see: seeMarkup, experiment: experimentMarkup, race: raceMarkup, code: codeMarkup }[step]();
  elements.count.textContent = `Step ${state.lesson.stepIndex + 1} of ${LESSON_STEPS.length}`;
  elements.mode.textContent = step === "race" ? "Real CPU + GPU execution" : "Visual processing";
  elements.content.innerHTML = `<div class="step-heading"><span class="eyebrow">${copy.eyebrow}</span><h1 id="step-title">${copy.title}</h1></div>${content}`;
  elements.panel.hidden = step === "race";
  elements.back.disabled = state.lesson.stepIndex === 0;
  elements.next.textContent = step === "code" ? "Finish lesson ✓" : "Continue →";
  renderProgress();
  bindStepEvents();
  if (!elements.panel.hidden) renderScene();
}

function bindStepEvents() {
  document.querySelector("[data-play-processing]")?.addEventListener("click", playProcessing);
  document.querySelector("[data-reset-processing]")?.addEventListener("click", resetProcessing);
  document.querySelector("#block-size")?.addEventListener("input", (event) => {
    state.blockSize = [4, 8, 16, 32][Number(event.target.value)];
    resetProcessing();
    renderStep();
    document.querySelector("#block-size")?.focus();
  });
  document.querySelectorAll("[data-code-tab]").forEach((button) => button.addEventListener("click", () => {
    state.codeTab = button.dataset.codeTab;
    renderStep();
    document.querySelector(`[data-code-tab="${state.codeTab}"]`)?.focus();
  }));
  document.querySelector("#race-workload")?.addEventListener("change", (event) => {
    state.racePixels = Number(event.target.value);
    state.executionResult = null;
    state.executionError = null;
    renderStep();
    document.querySelector("#race-workload")?.focus();
  });
  document.querySelectorAll("[data-run-provider]").forEach((button) => button.addEventListener("click", () => runRealGpu(button.dataset.runProvider)));
}

async function loadCapabilities() {
  try {
    const response = await fetch("/api/capabilities");
    if (!response.ok) throw new Error("Companion API unavailable");
    state.capabilities = withWebGpuCapability(await response.json());
  } catch (_error) {
    state.capabilities = withWebGpuCapability({ providers: [
      { id: "apple-mlx", available: false, reason: "Start with `python learning-lab/server.py` to enable real GPU runs." },
      { id: "modal-triton", available: false, reason: "Start the companion server and authenticate Modal first." },
    ] });
  }
  if (currentStep() === "race") renderStep();
}

async function runRealGpu(provider) {
  const requestedRacePixels = state.racePixels;
  const confirmed = provider === "modal-triton" ? document.querySelector("#modal-confirm")?.checked === true : false;
  if (provider === "modal-triton" && !confirmed) {
    state.executionError = "Confirm the billable Modal L4 run before launching.";
    renderStep();
    return;
  }
  state.executionRunning = true;
  state.executionError = null;
  state.executionResult = null;
  renderStep();
  try {
    if (provider === "browser-race") {
      const cpu = runCpuPaint({ pixels: requestedRacePixels });
      const gpu = await runWebGpuPaint({ pixels: requestedRacePixels, groupSize: state.blockSize });
      if (cpu.output.checksum !== gpu.output.checksum) throw new Error("CPU and GPU outputs did not match.");
      state.executionResult = { provider: "browser-race", pixels: requestedRacePixels, cpu, gpu, summary: buildRaceSummary({ cpu, gpu, pixels: requestedRacePixels }) };
    } else if (provider === "browser-webgpu") {
      state.executionResult = await runWebGpuPaint({ pixels: 64, groupSize: state.blockSize });
    } else {
      const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, group_size: state.blockSize, confirmed: provider === "modal-triton" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "GPU execution failed");
      state.executionResult = payload;
    }
  } catch (_error) {
    state.executionError = "The selected run could not complete. Check the local terminal for details.";
  } finally {
    state.executionRunning = false;
    renderStep();
  }
}

elements.next.addEventListener("click", () => {
  if (currentStep() === "code") {
    playback.reset();
    elements.content.innerHTML = `<div class="completion"><span class="completion-mark">✓</span><h1 id="step-title">Trail marker reached</h1><p>You watched processing, reshaped the workers, measured the browser, and connected a worker to GPU code.</p><button class="button button-primary" type="button" id="restart-lesson">Run the lesson again</button></div>`;
    elements.panel.hidden = true;
    elements.next.hidden = true;
    elements.back.hidden = true;
    document.querySelector("#restart-lesson").addEventListener("click", () => window.location.reload());
    return;
  }
  state.lesson = advanceLesson(state.lesson);
  resetProcessing();
  renderStep();
});

elements.back.addEventListener("click", () => {
  if (state.lesson.stepIndex === 0) return;
  state.lesson = retreatLesson(state.lesson);
  resetProcessing();
  renderStep();
});

renderStep();
loadCapabilities();
