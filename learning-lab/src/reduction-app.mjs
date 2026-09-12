import { createPlaybackController } from "./playback-controller.mjs";
import { buildCpuReductionFrames, reductionValues } from "./reduction-model.mjs";
import { buildGpuThreadTimeline } from "./reduction-thread-model.mjs";
import { drawReductionFrame } from "./reduction-canvas.mjs";
import { REDUCTION_PLATFORMS, renderReductionCodePanel } from "./reduction-code.mjs";
import { renderReductionStep, reductionSceneSummary, renderThreadPanel } from "./reduction-view.mjs";

const STEPS = ["question", "run", "compare"];
const LABELS = ["Question", "Run", "Compare"];
const state = {
  stepIndex: 0, count: 16, groupSize: 8, prediction: null, selectedPath: "gpu",
  frame: buildGpuThreadTimeline(reductionValues(16), 8)[0], selectedThread: 0,
  timeline: { index: 0, count: 5, running: false }, timelineFrames: [],
  codeVisible: false, codePlatform: "webgpu", viewed: { cpu: false, gpu: false }, complete: false,
};
const elements = {
  content: document.querySelector("#step-content"), progress: document.querySelector("#progress-list"),
  count: document.querySelector("#step-count"), mode: document.querySelector("#execution-mode"),
  back: document.querySelector("#back-button"), next: document.querySelector("#next-button"),
};

function updateRunPresentation() {
  if (state.frame.done) state.viewed[state.frame.kind] = true;
  const canvas = document.querySelector("[data-reduction-canvas]");
  if (canvas) drawReductionFrame(canvas, state.frame, state.selectedThread);
  const status = document.querySelector("[data-reduction-status]");
  if (status) status.textContent = reductionSceneSummary(state.frame);
  const threadPanel = document.querySelector("[data-reduction-thread-panel]");
  if (threadPanel) {
    const focusedThread = document.activeElement?.dataset?.reductionThread;
    threadPanel.innerHTML = renderThreadPanel(state.frame, state.selectedThread);
    threadPanel.querySelectorAll("[data-reduction-thread]").forEach((button) => button.addEventListener("click", () => { state.selectedThread = Number(button.dataset.reductionThread); updateRunPresentation(); }));
    if (focusedThread !== undefined) {
      const focusTarget = threadPanel.querySelector(`[data-reduction-thread="${focusedThread}"]`) ?? threadPanel.querySelector('[data-reduction-thread][aria-pressed="true"]');
      if (focusTarget) { state.selectedThread = Number(focusTarget.dataset.reductionThread); focusTarget.focus(); }
    }
  }
  const seek = document.querySelector("[data-reduction-seek]");
  if (seek) { seek.max = String(Math.max(0, state.timeline.count - 1)); seek.value = String(state.timeline.index); }
  const play = document.querySelector('[data-reduction-play="play"], [data-reduction-play="pause"]');
  if (play) { play.dataset.reductionPlay = state.timeline.running ? "pause" : "play"; play.textContent = state.timeline.running ? "Pause" : "Play"; }
  for (const path of ["cpu", "gpu"]) {
    const pathStatus = document.querySelector(`[data-reduction-path-status="${path}"]`);
    if (pathStatus) pathStatus.textContent = `${path.toUpperCase()} ${state.viewed[path] ? "viewed" : "ready"}`;
  }
  if (STEPS[state.stepIndex] === "run") elements.next.disabled = !(state.viewed.cpu && state.viewed.gpu);
}

const playback = createPlaybackController({
  schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (id) => window.clearTimeout(id),
  onFrame: (frame) => { state.frame = frame; updateRunPresentation(); },
  onStateChange: (timeline) => { state.timeline = timeline; updateRunPresentation(); },
});

function framesFor(path) {
  const values = reductionValues(state.count);
  return path === "cpu" ? buildCpuReductionFrames(values) : buildGpuThreadTimeline(values, state.groupSize);
}

function loadPath(path, autoplay = true) {
  playback.reset(); state.selectedPath = path; state.timelineFrames = framesFor(path); state.frame = state.timelineFrames[0];
  playback.load(state.timelineFrames); render();
  if (autoplay) playback.play(state.timelineFrames, path === "cpu" ? 150 : 220);
}

function renderProgress() {
  elements.progress.innerHTML = LABELS.map((label, index) => {
    const status = index < state.stepIndex ? "complete" : index === state.stepIndex ? "current" : "upcoming";
    return `<li class="progress-item progress-${status}" ${status === "current" ? 'aria-current="step"' : ""}><span class="progress-marker">${status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span><span>${label}</span></li>`;
  }).join("");
}

function bindQuestion() {
  const resetRuns = () => { state.viewed = { cpu: false, gpu: false }; state.timelineFrames = []; state.selectedThread = 0; };
  document.querySelector("[data-reduction-count]")?.addEventListener("change", (event) => { state.count = Number(event.target.value); resetRuns(); render(); });
  document.querySelector("[data-reduction-group]")?.addEventListener("change", (event) => { state.groupSize = Number(event.target.value); resetRuns(); render(); });
  document.querySelectorAll("[data-reduction-prediction]").forEach((button) => button.addEventListener("click", () => { state.prediction = button.dataset.reductionPrediction; render(); }));
}

function bindRun() {
  document.querySelectorAll("[data-reduction-run]").forEach((button) => button.addEventListener("click", () => loadPath(button.dataset.reductionRun)));
  document.querySelector("[data-reduction-code]")?.addEventListener("click", () => { state.codeVisible = !state.codeVisible; render(); });
  const codePanel = document.querySelector("[data-reduction-code-panel]");
  if (codePanel) codePanel.innerHTML = renderReductionCodePanel(state.codePlatform, state.groupSize);
  const selectPlatform = (platform) => { state.codePlatform = platform; render(); document.querySelector(`[data-reduction-platform="${platform}"]`)?.focus(); };
  document.querySelectorAll("[data-reduction-platform]").forEach((button) => {
    button.addEventListener("click", () => selectPlatform(button.dataset.reductionPlatform));
    button.addEventListener("keydown", (event) => {
      const index = REDUCTION_PLATFORMS.indexOf(button.dataset.reductionPlatform);
      const target = event.key === "Home" ? 0 : event.key === "End" ? REDUCTION_PLATFORMS.length - 1 : event.key === "ArrowRight" ? (index + 1) % REDUCTION_PLATFORMS.length : event.key === "ArrowLeft" ? (index - 1 + REDUCTION_PLATFORMS.length) % REDUCTION_PLATFORMS.length : null;
      if (target === null) return;
      event.preventDefault(); selectPlatform(REDUCTION_PLATFORMS[target]);
    });
  });
  document.querySelectorAll("[data-reduction-play]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.reductionPlay === "pause") { playback.pause(); return; }
    if (button.dataset.reductionPlay === "restart") { playback.load(state.timelineFrames); playback.seek(0); return; }
    playback.play(state.timelineFrames, state.selectedPath === "cpu" ? 150 : 220);
  }));
  document.querySelector("[data-reduction-seek]")?.addEventListener("input", (event) => playback.seek(Number(event.target.value)));
  updateRunPresentation();
}

function render() {
  playback.pause(); renderProgress();
  if (state.complete) {
    elements.content.innerHTML = `<div class="completion"><span class="completion-mark">✓</span><h1>Reduction complete.</h1><p>You turned many independent values into one answer by coordinating GPU workers.</p><a class="button button-primary" href="../../trails/">Choose the next trail →</a></div>`;
    elements.count.textContent = "Expedition complete"; elements.mode.textContent = "Parallel reduction"; elements.back.hidden = true; elements.next.hidden = true; return;
  }
  const step = STEPS[state.stepIndex];
  if (step === "run" && !state.timelineFrames.length) { state.timelineFrames = framesFor(state.selectedPath); state.frame = state.timelineFrames[0]; playback.load(state.timelineFrames); }
  elements.content.innerHTML = renderReductionStep({ ...state, step });
  elements.count.textContent = `Step ${state.stepIndex + 1} of 3`;
  elements.mode.textContent = ["Question + configuration", "Visual CPU + GPU model", "Compare operation depth"][state.stepIndex];
  elements.back.disabled = state.stepIndex === 0; elements.back.hidden = false; elements.next.hidden = false;
  elements.next.disabled = step === "run" && !(state.viewed.cpu && state.viewed.gpu);
  elements.next.textContent = state.stepIndex === 2 ? "Finish lesson →" : "Continue →";
  if (step === "question") bindQuestion();
  if (step === "run") bindRun();
}

elements.back.addEventListener("click", () => { if (state.stepIndex > 0) { state.stepIndex -= 1; render(); } });
elements.next.addEventListener("click", () => { if (elements.next.disabled) return; if (state.stepIndex === 2) state.complete = true; else state.stepIndex += 1; render(); });
window.addEventListener("resize", () => { if (STEPS[state.stepIndex] === "run") updateRunPresentation(); });
render();
