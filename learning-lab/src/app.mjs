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
import { GPU_CODE_PLATFORMS } from "./platform-code-catalog.mjs";
import { canCompare, createExperimentSession, recordCpuRun, recordGpuRun, setExperimentConfig } from "./experiment-session.mjs";
import { projectDispatchWorld, moveGroupSelection } from "./dispatch-world-model.mjs";
import { createVgpuDispatchRenderer } from "./vgpu-dispatch-renderer.mjs";
import { mountPreferredRenderer, requestedRenderer } from "./renderer-selection.mjs";

const GROUP_SIZES = [4, 8, 16, 32];
const STEP_LABELS = ["Question", "Run", "Compare"];
const ANIMATION_DELAYS = Object.freeze({ slow: { cpu: 60, gpu: 360 }, normal: { cpu: 24, gpu: 180 }, instant: { cpu: 0, gpu: 0 } });
const wantsVgpu = requestedRenderer(window.location.search) === "vgpu";
const state = { lesson: createLessonState(), session: createExperimentSession({}), selectedBackend: "cpu", codeMode: "cpu", codePlatform: "webgpu", animationSpeed: "normal", configNotice: null, selectedWorker: null, selectedGroup: 0, frame: sceneFrameState(), dispatchReplay: null, codeVisible: !window.matchMedia("(max-width: 760px)").matches, running: null, error: null, otherStatus: null, capabilities: null, rendererKind: wantsVgpu ? "vgpu" : "legacy", renderer: null, rendererCanvas: null, rendererFallback: null, timeline: { index: 0, count: 1, running: false }, timelineFrames: [] };
const elements = { back: document.querySelector("#back-button"), next: document.querySelector("#next-button"), content: document.querySelector("#step-content"), count: document.querySelector("#step-count"), mode: document.querySelector("#execution-mode"), progress: document.querySelector("#progress-list"), panel: document.querySelector("#processing-panel") };
const playback = createPlaybackController({ schedule: (callback, delayMs) => window.setTimeout(callback, delayMs), cancel: (id) => window.clearTimeout(id), onFrame: (frame) => { state.frame = frame; if (state.rendererKind === "vgpu") updateVgpuPresentation(); else renderStep(); }, onStateChange: (timeline) => { state.timeline = timeline; if (!timeline.count) state.timelineFrames = []; updateVgpuControls(); } });

function currentStep() { return LESSON_STEPS[state.lesson.stepIndex]; }
function formatCount(value) { return new Intl.NumberFormat("en-US").format(value); }
function visiblePixels() { return Math.min(state.session.config.pixels, 64); }
function webgpuCapability() { return state.capabilities?.providers?.find(({ id }) => id === "browser-webgpu"); }
function providerCapability(id) { return state.capabilities?.providers?.find((provider) => provider.id === id); }

function currentWorldScene() {
  const executionKind = state.selectedBackend === "cpu" ? "cpu" : "gpu";
  const pixels = visiblePixels();
  const plannedGroups = Math.ceil(state.session.config.pixels / state.session.config.groupSize);
  const dispatch = state.session.gpu?.result?.workload?.dispatch ?? { workgroups_x: plannedGroups, workgroups_y: 1, active_workgroups: plannedGroups, dispatched_workgroups: plannedGroups };
  const maxGroup = Math.max(0, Math.ceil(pixels / state.session.config.groupSize) - 1);
  state.selectedGroup = Math.min(state.selectedGroup, maxGroup);
  const scene = projectDispatchWorld({ frame: state.frame, pixels, workloadPixels: state.session.config.pixels, groupSize: state.session.config.groupSize, dispatch: executionKind === "gpu" ? dispatch : null, selectedGroup: state.selectedGroup, executionKind, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  if (executionKind === "gpu" && !state.session.gpu) scene.truth.observed = `Configured preview · ${formatCount(state.session.config.pixels)} pixels`;
  return scene;
}
function sceneSummary(scene) { return scene.selection ? `Workgroup ${scene.selection.groupId} connects workers ${scene.selection.workerStart} through ${scene.selection.workerEnd} to pixels ${scene.selection.pixelStart} through ${scene.selection.pixelEnd}.` : scene.truth.observed; }
function updateVgpuControls() { const seek=document.querySelector("[data-playback-seek]"); if(seek){seek.max=String(Math.max(0,state.timeline.count-1));seek.value=String(Math.max(0,state.timeline.index));} const play=document.querySelector('[data-playback="play"], [data-playback="pause"]'); if(play){play.dataset.playback=state.timeline.running?"pause":"play";play.textContent=state.timeline.running?"Pause":"Play";} }
function updateVgpuPresentation() { if(state.rendererKind!=="vgpu"||!state.renderer)return; const scene=currentWorldScene(); state.renderer.render(scene); const status=document.querySelector(".vgpu-stage [role=status]"); if(status)status.textContent=sceneSummary(scene); const observed=document.querySelector(".scene-truth strong");if(observed)observed.textContent=scene.truth.observed;const illustrated=document.querySelector(".scene-truth span");if(illustrated)illustrated.textContent=scene.truth.illustrated; updateVgpuControls(); }
async function ensureVgpuRenderer() {
  if(currentStep()!=="run"||state.rendererKind!=="vgpu")return; const canvas=document.querySelector("[data-vgpu-dispatch]"); if(!canvas)return;
  if(state.renderer&&state.rendererCanvas===canvas){updateVgpuPresentation();return;} state.renderer?.dispose(); state.renderer=null; state.rendererCanvas=canvas;
  const result=await mountPreferredRenderer({search:"?renderer=vgpu",canvas,scene:currentWorldScene(),createVgpu:()=>createVgpuDispatchRenderer()});
  if(result.kind==="legacy"){state.rendererKind="legacy";state.rendererFallback=result.fallbackReason;state.rendererCanvas=null;renderStep();return;} state.renderer=result.renderer;
  canvas.addEventListener("click",(event)=>{const group=state.renderer?.pick(event.clientX,event.clientY);if(group===null||group===undefined)return;state.selectedGroup=group;state.selectedWorker=group*state.session.config.groupSize;renderStep();});
  canvas.addEventListener("keydown",(event)=>{const direction=({ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"})[event.key];if(!direction)return;event.preventDefault();const count=Math.ceil(visiblePixels()/state.session.config.groupSize);state.selectedGroup=moveGroupSelection({selectedGroup:state.selectedGroup,direction,columns:4,groupCount:count});state.selectedWorker=state.selectedGroup*state.session.config.groupSize;renderStep();});
}

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
  const codeSelection = buildCodePhaseSelection({ executionBackend: state.codeMode, codePlatform: state.codePlatform, phase: state.frame.phase, workerId: state.selectedWorker, pixels: state.session.config.pixels, groupSize: state.session.config.groupSize, gpuHasRun: Boolean(state.session.gpu), cpuHasRun: Boolean(state.session.cpu) });
  const dispatchFacts = state.dispatchReplay && state.session.gpu ? renderDispatchFacts({ replay: state.dispatchReplay, device: state.session.gpu.result.device, pixels: state.session.config.pixels, groupSize: state.session.config.groupSize }) : "";
  const world = state.rendererKind === "vgpu" ? currentWorldScene() : null;
  const workspace = renderRunWorkspace({ backend: state.codeMode, codePlatform: state.codePlatform, platforms: GPU_CODE_PLATFORMS, sceneHtml: scene, codeVisible: state.codeVisible, codeSelection, dispatchFacts, rendererKind: state.rendererKind, sceneSummary: world ? sceneSummary(world) : "", sceneTruth: world?.truth, timeline: state.timeline });
  const appleReady = providerCapability("apple-mlx")?.available === true;
  const modalReady = providerCapability("modal-triton")?.available === true;
  const { pixels, groupSize } = state.session.config;
  const settings = `<div class="run-settings"><label>Pixels<select id="run-pixels" ${state.running ? "disabled" : ""}>${RACE_WORKLOADS.map((v) => `<option value="${v}" ${v === pixels ? "selected" : ""}>${formatCount(v)}</option>`).join("")}</select></label><label>Workers per group<select id="run-group" ${state.running ? "disabled" : ""}>${GROUP_SIZES.map((v) => `<option value="${v}" ${v === groupSize ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Visualization speed<select id="run-speed">${Object.keys(ANIMATION_DELAYS).map((v) => `<option value="${v}" ${v === state.animationSpeed ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>`;
  const gpuCapability = webgpuCapability();
  const explore = `<button class="button button-quiet" type="button" data-explore-gpu>Explore GPU syntax</button>${gpuCapability?.available ? "" : '<p class="provider-status">WebGPU is unavailable here, but equivalent syntax remains explorable.</p>'}`;
  return `<div class="run-stage"><p class="lede">Run each path separately. Animation follows the operation; measured time comes from the browser.</p>${settings}${state.configNotice ? `<p class="config-notice">${state.configNotice}</p>` : ""}<div class="run-actions"><button class="button button-quiet" type="button" data-run="cpu" ${state.running ? "disabled" : ""}>Run on CPU</button><button class="button button-primary" type="button" data-run="webgpu" ${gpuCapability?.available && !state.running ? "" : "disabled"}>Run on my GPU</button>${explore}</div>${runStatus()}${workspace}<details class="advanced-runs"><summary>Other hardware</summary><div class="advanced-provider-grid"><button class="button button-quiet" type="button" data-run-provider="apple-mlx" ${appleReady && !state.running ? "" : "disabled"}>Run on your Apple GPU</button><label class="cost-confirm"><input id="modal-confirm" type="checkbox"> I understand a Modal NVIDIA run is billable.</label><button class="button button-quiet" type="button" data-run-provider="modal-triton" ${modalReady && !state.running ? "" : "disabled"}>Run once on Modal</button><p class="provider-status">${state.otherStatus ?? "Optional hardware runs do not change the browser comparison."}</p></div></details></div>`;
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
  document.querySelector("[data-explore-gpu]")?.addEventListener("click", () => { state.codeMode = "webgpu"; state.codePlatform = "webgpu"; renderStep(); });
  document.querySelectorAll("[data-run-provider]").forEach((button) => button.addEventListener("click", () => runOtherProvider(button.dataset.runProvider)));
  document.querySelector("[data-toggle-code]")?.addEventListener("click", () => { state.codeVisible = !state.codeVisible; renderStep(); });
  document.querySelectorAll("[data-code-platform]").forEach((tab) => {
    const selectPlatform = (platform) => { state.codePlatform = platform; renderStep(); document.querySelector(`[data-code-platform="${platform}"]`)?.focus(); };
    tab.addEventListener("click", () => selectPlatform(tab.dataset.codePlatform));
    tab.addEventListener("keydown", (event) => { const index = GPU_CODE_PLATFORMS.indexOf(tab.dataset.codePlatform); const target = event.key === "Home" ? 0 : event.key === "End" ? GPU_CODE_PLATFORMS.length - 1 : event.key === "ArrowRight" ? (index + 1) % GPU_CODE_PLATFORMS.length : event.key === "ArrowLeft" ? (index - 1 + GPU_CODE_PLATFORMS.length) % GPU_CODE_PLATFORMS.length : null; if (target === null) return; event.preventDefault(); selectPlatform(GPU_CODE_PLATFORMS[target]); });
  });
  document.querySelector("#run-speed")?.addEventListener("change", (event) => { state.animationSpeed = event.target.value; renderStep(); });
  document.querySelectorAll("#run-pixels, #run-group").forEach((control) => control.addEventListener("change", () => { playback.reset(); state.session = setExperimentConfig(state.session, { pixels: Number(document.querySelector("#run-pixels").value), groupSize: Number(document.querySelector("#run-group").value) }); state.dispatchReplay = null; state.frame = sceneFrameState(); state.configNotice = "Results cleared — run CPU and GPU again."; renderStep(); }));
  document.querySelectorAll("[data-playback]").forEach((button)=>button.addEventListener("click",()=>{if(button.dataset.playback==="pause"){playback.pause();return;}if(!state.timelineFrames.length)return;if(button.dataset.playback==="restart"){playback.load(state.timelineFrames);playback.seek(0);return;}playback.play(state.timelineFrames,ANIMATION_DELAYS[state.animationSpeed][state.selectedBackend==="cpu"?"cpu":"gpu"]);}));
  document.querySelector("[data-playback-seek]")?.addEventListener("input",(event)=>{if(!state.timelineFrames.length)return;playback.seek(Number(event.target.value));});
  bindWorkerEvents();
}

function playFrames(frames) {
  state.timelineFrames = [...frames];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { state.frame = frames.at(-1); renderStep(); return; }
  playback.play(frames, ANIMATION_DELAYS[state.animationSpeed][state.selectedBackend === "cpu" ? "cpu" : "gpu"]);
}

async function runBackend(backend) {
  const launchConfig = { ...state.session.config };
  playback.reset(); state.running = backend; state.error = null; state.configNotice = null; state.selectedBackend = backend; state.codeMode = backend; state.codePlatform = "webgpu"; state.selectedWorker = null; state.frame = sceneFrameState(); renderStep();
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
  const focusedPlatform = document.activeElement?.dataset?.codePlatform;
  const step = currentStep();
  if (step !== "run" && state.renderer) { state.renderer.dispose(); state.renderer = null; state.rendererCanvas = null; }
  const copy = getLessonCopy(step);
  elements.count.textContent = `Step ${state.lesson.stepIndex + 1} of ${LESSON_STEPS.length}`;
  elements.mode.textContent = step === "configure" ? "Question + configuration" : step === "run" ? "Real CPU + GPU runs" : "Measured comparison";
  elements.content.innerHTML = `<div class="step-heading"><span class="eyebrow">${copy.eyebrow}</span><h1 id="step-title">${copy.title}</h1></div>${({ configure: configureMarkup, run: runMarkup, compare: compareMarkup })[step]()}`;
  elements.panel.hidden = true; elements.back.disabled = state.lesson.stepIndex === 0 || Boolean(state.running); elements.next.disabled = Boolean(state.running) || (step === "run" && !canCompare(state.session)); elements.next.textContent = step === "compare" ? "Finish lesson ✓" : step === "run" ? "Compare results →" : "Start experiment →";
  renderProgress(); bindStepEvents();
  void ensureVgpuRenderer();
  if (focusedWorker !== undefined) document.querySelector(`[data-gpu-worker="${focusedWorker}"]`)?.focus();
  if (focusedPlatform !== undefined) document.querySelector(`[data-code-platform="${focusedPlatform}"]`)?.focus();
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
