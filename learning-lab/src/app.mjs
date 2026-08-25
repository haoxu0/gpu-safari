import { LESSON_STEPS, advanceLesson, createLessonState, retreatLesson, selectWorker } from "./lesson-model.mjs";
import { getLessonCopy } from "./lesson-content.mjs";
import { createPlaybackController } from "./playback-controller.mjs";
import { renderProcessingScene, sceneFrameState } from "./processing-scene.mjs";
import { buildProcessingTimeline } from "./simulation-timeline.mjs";
import { runCpuPaint, buildRaceSummary, RACE_WORKLOADS } from "./race-runner.mjs";
import { runWebGpuPaint, withWebGpuCapability } from "./webgpu-runner.mjs";
import { buildDispatchReplay, renderDispatchFacts } from "./dispatch-replay.mjs";
import { buildMeasurementChartModel, renderMeasurementChart } from "./measurement-chart.mjs";
import { buildCodePhaseSelection, renderRunWorkspace } from "./run-workspace.mjs";
import { canCompare, createExperimentSession, recordCpuRun, recordGpuRun, setExperimentConfig } from "./experiment-session.mjs";

const GROUP_SIZES = [4, 8, 16, 32];
const STEP_LABELS = ["Question", "Run", "Compare"];
const state = { lesson: createLessonState(), session: createExperimentSession({}), selectedBackend: "cpu", selectedWorker: null, frame: sceneFrameState(), dispatchReplay: null, codeVisible: !window.matchMedia("(max-width: 760px)").matches, running: null, error: null, otherStatus: null, capabilities: null };
const elements = { back: document.querySelector("#back-button"), next: document.querySelector("#next-button"), content: document.querySelector("#step-content"), count: document.querySelector("#step-count"), mode: document.querySelector("#execution-mode"), progress: document.querySelector("#progress-list"), panel: document.querySelector("#processing-panel") };
const playback = createPlaybackController({ schedule: (callback, delayMs) => window.setTimeout(callback, delayMs), cancel: (id) => window.clearTimeout(id), onFrame: (frame) => { state.frame = frame; renderStep(); } });

function currentStep() { return LESSON_STEPS[state.lesson.stepIndex]; }
function formatCount(value) { return new Intl.NumberFormat("en-US").format(value); }
function visiblePixels() { return Math.min(state.session.config.pixels, 64); }
function webgpuCapability() { return state.capabilities?.providers?.find(({ id }) => id === "browser-webgpu"); }
function providerCapability(id) { return state.capabilities?.providers?.find((provider) => provider.id === id); }

function renderProgress() {
  elements.progress.innerHTML = STEP_LABELS.map((label, index) => {
    const status = index < state.lesson.stepIndex ? "complete" : index === state.lesson.stepIndex ? "current" : "upcoming";
    return `<li class="progress-item progress-${status}" ${status === "current" ? 'aria-current="step"' : ""}><span class="progress-marker">${status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span><span>${label}</span></li>`;
  }).join("");
}

function configureMarkup() {
  const { pixels, groupSize } = state.session.config;
  return `<div class="experiment-question"><p class="lede">Will one CPU loop or many GPU workers paint the same pixels differently?</p><div class="config-grid"><label><span>Pixels</span><select id="experiment-pixels">${RACE_WORKLOADS.map((value) => `<option value="${value}" ${pixels === value ? "selected" : ""}>${formatCount(value)}</option>`).join("")}</select></label><label><span>GPU workgroup</span><select id="experiment-group">${GROUP_SIZES.map((value) => `<option value="${value}" ${groupSize === value ? "selected" : ""}>${value} workers</option>`).join("")}</select></label></div><fieldset class="prediction"><legend>Optional prediction</legend>${["cpu", "gpu", "unsure"].map((value) => `<button type="button" class="button button-quiet ${state.session.prediction === value ? "is-selected" : ""}" data-prediction="${value}" aria-pressed="${state.session.prediction === value}">${value === "unsure" ? "Not sure" : value.toUpperCase()}</button>`).join("")}</fieldset><div class="question-preview"><span>CPU</span><strong>one pixel at a time</strong><span>GPU</span><strong>${formatCount(Math.ceil(pixels / groupSize))} active workgroups</strong></div></div>`;
}

function cpuFrames() {
  const total = visiblePixels();
  const painted = [];
  return buildProcessingTimeline({ totalPixels: total, groupSize: state.session.config.groupSize }).cpu.map(({ pixelIds }) => { painted.push(...pixelIds); return sceneFrameState({ phase: "cpu", cpuPainted: painted }); });
}

function runStatus() {
  if (state.running) return `<div class="run-status is-running">Running on ${state.running === "cpu" ? "CPU" : "GPU"}…</div>`;
  if (state.error) return `<div class="run-status is-error">${state.error}</div>`;
  return `<div class="run-status"><span>${state.session.cpu ? "✓ CPU measured" : "CPU not run"}</span><span>${state.session.gpu ? "✓ GPU measured" : "GPU not run"}</span></div>`;
}

function runMarkup() {
  const total = visiblePixels();
  const scene = renderProcessingScene({ totalPixels: total, groupSize: state.session.config.groupSize, selectedWorker: state.selectedWorker !== null && state.selectedWorker < total ? state.selectedWorker : null, frame: state.frame, presentation: state.selectedBackend === "webgpu" ? "dispatch-replay" : "simulation" });
  const codeSelection = buildCodePhaseSelection({ backend: state.selectedBackend, phase: state.frame.phase, workerId: state.selectedWorker });
  const dispatchFacts = state.dispatchReplay && state.session.gpu ? renderDispatchFacts({ replay: state.dispatchReplay, device: state.session.gpu.result.device, pixels: state.session.config.pixels, groupSize: state.session.config.groupSize }) : "";
  const workspace = renderRunWorkspace({ backend: state.selectedBackend, sceneHtml: scene, codeVisible: state.codeVisible, codeSelection, dispatchFacts });
  const appleReady = providerCapability("apple-mlx")?.available === true;
  const modalReady = providerCapability("modal-triton")?.available === true;
  return `<div class="run-stage"><p class="lede">Run each path separately. Animation follows the operation; measured time comes from the browser.</p><div class="run-actions"><button class="button button-quiet" type="button" data-run="cpu" ${state.running ? "disabled" : ""}>Run on CPU</button><button class="button button-primary" type="button" data-run="webgpu" ${webgpuCapability()?.available && !state.running ? "" : "disabled"}>Run on my GPU</button></div>${runStatus()}${workspace}<details class="advanced-runs"><summary>Other hardware</summary><div class="advanced-provider-grid"><button class="button button-quiet" type="button" data-run-provider="apple-mlx" ${appleReady && !state.running ? "" : "disabled"}>Run on your Apple GPU</button><label class="cost-confirm"><input id="modal-confirm" type="checkbox"> I understand a Modal NVIDIA run is billable.</label><button class="button button-quiet" type="button" data-run-provider="modal-triton" ${modalReady && !state.running ? "" : "disabled"}>Run once on Modal</button><p class="provider-status">${state.otherStatus ?? "Optional hardware runs do not change the browser comparison."}</p></div></details></div>`;
}

function compareMarkup() {
  if (!canCompare(state.session)) return `<div class="comparison-wait"><p class="lede">Run both paths with the current configuration before comparing them.</p></div>`;
  const cpu = state.session.cpu.result;
  const gpu = state.session.gpu.result;
  const summary = buildRaceSummary({ cpu, gpu, pixels: state.session.config.pixels });
  return `<div class="compare-stage"><p class="lede">The bars share one scale. Patterned values are below the browser's measurement floor.</p>${renderMeasurementChart(buildMeasurementChartModel({ cpu, gpu, summary }))}</div>`;
}

function bindWorkerEvents() {
  document.querySelectorAll("[data-gpu-worker]").forEach((worker) => {
    const activate = () => { const id = Number(worker.dataset.gpuWorker); if (id >= visiblePixels()) return; state.selectedWorker = id; state.lesson = selectWorker(state.lesson, id, visiblePixels()); state.frame = sceneFrameState({ ...state.frame, selectedWorker: id }); renderStep(); document.querySelector(`[data-gpu-worker="${id}"]`)?.focus(); };
    worker.addEventListener("click", activate);
    worker.addEventListener("keydown", (event) => { if (!new Set(["Enter", " "]).has(event.key)) return; event.preventDefault(); activate(); });
  });
}

function bindStepEvents() {
  document.querySelectorAll("#experiment-pixels, #experiment-group").forEach((control) => control.addEventListener("change", () => { state.session = setExperimentConfig(state.session, { pixels: Number(document.querySelector("#experiment-pixels").value), groupSize: Number(document.querySelector("#experiment-group").value) }); state.dispatchReplay = null; state.frame = sceneFrameState(); renderStep(); }));
  document.querySelectorAll("[data-prediction]").forEach((button) => button.addEventListener("click", () => { state.session = { ...state.session, prediction: button.dataset.prediction }; renderStep(); }));
  document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", () => runBackend(button.dataset.run)));
  document.querySelectorAll("[data-run-provider]").forEach((button) => button.addEventListener("click", () => runOtherProvider(button.dataset.runProvider)));
  document.querySelector("[data-toggle-code]")?.addEventListener("click", () => { state.codeVisible = !state.codeVisible; renderStep(); });
  bindWorkerEvents();
}

function playFrames(frames) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { state.frame = frames.at(-1); renderStep(); return; }
  playback.play(frames, state.selectedBackend === "cpu" ? 24 : 180);
}

async function runBackend(backend) {
  const launchConfig = { ...state.session.config };
  playback.reset(); state.running = backend; state.error = null; state.selectedBackend = backend; state.selectedWorker = null; state.frame = sceneFrameState(); renderStep();
  try {
    if (backend === "cpu") {
      state.session = recordCpuRun(state.session, runCpuPaint({ pixels: state.session.config.pixels }));
      state.running = null; renderStep(); playFrames(cpuFrames());
    } else {
      const result = await runWebGpuPaint({ pixels: launchConfig.pixels, groupSize: launchConfig.groupSize });
      if (state.session.config.pixels !== launchConfig.pixels || state.session.config.groupSize !== launchConfig.groupSize) throw new Error("stale run");
      state.session = recordGpuRun(state.session, result);
      state.dispatchReplay = buildDispatchReplay({ pixels: launchConfig.pixels, groupSize: launchConfig.groupSize, dispatch: result.workload.dispatch });
      state.running = null; state.frame = state.dispatchReplay.frames[0]; renderStep(); playFrames(state.dispatchReplay.frames);
    }
  } catch (_error) { state.running = null; state.error = "This run could not complete. Try again or check browser GPU support."; renderStep(); }
}

async function runOtherProvider(provider) {
  const confirmed = provider === "modal-triton" && document.querySelector("#modal-confirm")?.checked === true;
  if (provider === "modal-triton" && !confirmed) { state.otherStatus = "Confirm the billable Modal run first."; renderStep(); return; }
  state.running = provider; state.otherStatus = "Running optional hardware path…"; renderStep();
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, group_size: state.session.config.groupSize, confirmed: provider === "modal-triton" }) });
    const payload = await response.json();
    if (!response.ok || !payload.correctness?.passed) throw new Error("hardware run failed");
    state.otherStatus = "Optional hardware run completed with correct output.";
  } catch (_error) { state.otherStatus = "Optional hardware run could not complete. Check the local terminal."; }
  finally { state.running = null; renderStep(); }
}

function renderStep() {
  const focusedWorker = document.activeElement?.dataset?.gpuWorker;
  const step = currentStep();
  const copy = getLessonCopy(step);
  elements.count.textContent = `Step ${state.lesson.stepIndex + 1} of ${LESSON_STEPS.length}`;
  elements.mode.textContent = step === "configure" ? "Question + configuration" : step === "run" ? "Real CPU + GPU runs" : "Measured comparison";
  elements.content.innerHTML = `<div class="step-heading"><span class="eyebrow">${copy.eyebrow}</span><h1 id="step-title">${copy.title}</h1></div>${({ configure: configureMarkup, run: runMarkup, compare: compareMarkup })[step]()}`;
  elements.panel.hidden = true; elements.back.disabled = state.lesson.stepIndex === 0 || Boolean(state.running); elements.next.disabled = Boolean(state.running) || (step === "run" && !canCompare(state.session)); elements.next.textContent = step === "compare" ? "Finish lesson ✓" : step === "run" ? "Compare results →" : "Start experiment →";
  renderProgress(); bindStepEvents();
  if (focusedWorker !== undefined) document.querySelector(`[data-gpu-worker="${focusedWorker}"]`)?.focus();
}

async function loadCapabilities() {
  try { const response = await fetch("/api/capabilities"); if (!response.ok) throw new Error("unavailable"); state.capabilities = withWebGpuCapability(await response.json()); }
  catch (_error) { state.capabilities = withWebGpuCapability({ providers: [] }); }
  renderStep();
}

elements.next.addEventListener("click", () => {
  if (currentStep() === "compare") { elements.content.innerHTML = `<div class="completion"><span class="completion-mark">✓</span><h1 id="step-title">Experiment complete</h1><p>You configured one workload, ran it on CPU and GPU, and compared only what the browser could measure reliably.</p><button class="button button-primary" type="button" id="restart-lesson">Run it again</button></div>`; elements.next.hidden = true; elements.back.hidden = true; document.querySelector("#restart-lesson").addEventListener("click", () => window.location.reload()); return; }
  state.lesson = advanceLesson(state.lesson); playback.reset(); state.frame = sceneFrameState(); renderStep();
});
elements.back.addEventListener("click", () => { if (state.lesson.stepIndex === 0) return; state.lesson = retreatLesson(state.lesson); playback.reset(); renderStep(); });

renderStep();
loadCapabilities();
