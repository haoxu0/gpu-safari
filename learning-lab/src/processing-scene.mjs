const PHASES = Object.freeze(["ready", "cpu", "prepare", "submit", "work", "readback", "complete"]);

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function normalizeIds(ids, name) {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id) || id < 0)) {
    throw new RangeError(`${name} must contain non-negative integer IDs`);
  }
  return [...ids];
}

export function sceneFrameState({
  cpuPainted = [],
  gpuPainted = [],
  phase = "ready",
  selectedWorker = null,
} = {}) {
  if (!PHASES.includes(phase)) throw new RangeError(`Unknown processing phase: ${phase}`);
  if (selectedWorker !== null && (!Number.isInteger(selectedWorker) || selectedWorker < 0)) {
    throw new RangeError("selectedWorker must be null or a non-negative integer");
  }
  return {
    cpuPainted: normalizeIds(cpuPainted, "cpuPainted"),
    gpuPainted: normalizeIds(gpuPainted, "gpuPainted"),
    phase,
    selectedWorker,
  };
}

function selectedClass(id, selectedWorker) {
  return id === selectedWorker ? " is-selected" : "";
}

function paintedClass(id, painted) {
  return painted.includes(id) ? " is-painted" : "";
}

function renderJobs({ totalPixels, frame, kind }) {
  const painted = kind === "cpu" ? frame.cpuPainted : frame.gpuPainted;
  return Array.from({ length: totalPixels }, (_, id) => {
    const classes = `scene-job${paintedClass(id, painted)}${selectedClass(id, frame.selectedWorker)}`;
    return `<rect data-${kind}-job="${id}" data-pixel="${id}" class="${classes}" x="${18 + (id % 8) * 29}" y="${18 + Math.floor(id / 8) * 29}" width="22" height="22" rx="4"><title>Pixel ${id}${painted.includes(id) ? "; painted" : "; waiting"}</title></rect>`;
  }).join("");
}

function renderWorkers({ totalPixels, groupSize, frame }) {
  const launchedWorkers = Math.ceil(totalPixels / groupSize) * groupSize;
  return Array.from({ length: launchedWorkers }, (_, id) => {
    const active = id < totalPixels;
    const selected = active && id === frame.selectedWorker;
    const classes = `gpu-worker${active ? "" : " is-masked"}${paintedClass(id, frame.gpuPainted)}${selected ? " is-selected" : ""}`;
    const label = active
      ? `Worker ${id}; paints pixel ${id}${selected ? "; selected" : ""}`
      : `Worker ${id}; masked outside the image`;
    const groupId = Math.floor(id / groupSize);
    const laneId = id % groupSize;
    return `<g data-gpu-worker="${id}" role="button" tabindex="${active ? 0 : -1}" aria-label="${label}" class="${classes}" data-group="${groupId}" data-lane="${laneId}"><rect x="${18 + (laneId % 8) * 25}" y="${22 + groupId * 34 + Math.floor(laneId / 8) * 23}" width="18" height="18" rx="4"></rect><text x="${27 + (laneId % 8) * 25}" y="${35 + groupId * 34 + Math.floor(laneId / 8) * 23}" text-anchor="middle">${id}</text></g>`;
  }).join("");
}

function phaseClass(phase, current) {
  return `process-phase${phase === current ? " is-current" : ""}`;
}

export function renderProcessingScene({ totalPixels, groupSize, selectedWorker = null, frame = sceneFrameState() }) {
  requirePositiveInteger(totalPixels, "totalPixels");
  requirePositiveInteger(groupSize, "groupSize");
  if (selectedWorker !== null && (!Number.isInteger(selectedWorker) || selectedWorker < 0 || selectedWorker >= totalPixels)) {
    throw new RangeError("selectedWorker must identify an active pixel");
  }

  const viewFrame = sceneFrameState({ ...frame, selectedWorker });
  const phaseLabels = {
    prepare: "Prepare commands",
    submit: "Submit · CPU is free",
    work: "GPU workgroups",
    readback: "Read back result",
  };

  return `<div class="processing-scene" data-scene-phase="${viewFrame.phase}">
    <div class="scene-legend"><span>Processing view</span><strong>Slowed visual · not timing</strong></div>
    <div class="processing-lanes">
      <section class="processing-lane cpu-lane" aria-labelledby="cpu-lane-title">
        <header><span>CPU</span><strong id="cpu-lane-title">CPU · sequential</strong><small>one job at a time</small></header>
        <svg viewBox="0 0 270 270" role="img" aria-label="CPU worker processing pixels sequentially">
          <g class="cpu-worker"><circle cx="135" cy="26" r="12"></circle><text x="135" y="30" text-anchor="middle">1</text></g>
          <path class="scene-arrow" d="M135 44 V65"></path>
          <g class="job-map">${renderJobs({ totalPixels, frame: viewFrame, kind: "cpu" })}</g>
        </svg>
      </section>
      <section class="processing-lane gpu-lane" aria-labelledby="gpu-lane-title">
        <header><span>GPU</span><strong id="gpu-lane-title">GPU · asynchronous</strong><small>many workers together</small></header>
        <div class="phase-path" aria-label="GPU processing phases">
          ${Object.entries(phaseLabels).map(([phase, label]) => `<button type="button" class="${phaseClass(phase, viewFrame.phase)}" data-phase="${phase}" aria-pressed="${phase === viewFrame.phase}">${label}</button>`).join('<span aria-hidden="true">→</span>')}
        </div>
        <svg viewBox="0 0 270 270" role="group" aria-label="GPU workers organized into workgroups">
          <path class="workgroup-top" d="M13 28 L42 12 H252 L223 28 Z"></path>
          <rect class="workgroup-face" x="13" y="28" width="210" height="220" rx="8"></rect>
          <g class="worker-map">${renderWorkers({ totalPixels, groupSize, frame: viewFrame })}</g>
        </svg>
      </section>
    </div>
    <div class="pixel-link-map" aria-label="Worker to pixel map">
      ${Array.from({ length: totalPixels }, (_, id) => `<span data-pixel="${id}" class="pixel-link${selectedClass(id, selectedWorker)}" aria-label="Pixel ${id}">${id}</span>`).join("")}
    </div>
    <p class="scene-hint">Focus or select a worker to connect it to its pixel.</p>
    <p data-scene-status class="sr-only">${phaseLabels[viewFrame.phase] ?? "Ready to play the processing view"}</p>
  </div>`;
}
