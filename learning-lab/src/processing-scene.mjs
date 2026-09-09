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
    return `<span data-${kind}-job="${id}" data-pixel="${id}" class="${classes}" title="Pixel ${id}${painted.includes(id) ? "; painted" : "; waiting"}"></span>`;
  }).join("");
}

export function buildWorkgroupLayout({ totalPixels, groupSize }) {
  requirePositiveInteger(totalPixels, "totalPixels");
  requirePositiveInteger(groupSize, "groupSize");
  const launchedWorkers = Math.ceil(totalPixels / groupSize) * groupSize;
  const groupCount = launchedWorkers / groupSize;
  const groups = Array.from({ length: groupCount }, (_, groupId) => ({
    id: groupId,
    workerIds: Array.from({ length: groupSize }, (_, laneId) => groupId * groupSize + laneId),
  }));
  const workers = Array.from({ length: launchedWorkers }, (_, id) => {
    const groupId = Math.floor(id / groupSize);
    const laneId = id % groupSize;
    return { id, groupId, laneId };
  });
  return { groups, workers };
}

function renderWorkers({ totalPixels, frame, layout }) {
  return layout.workers.map(({ id, groupId, laneId }) => {
    const active = id < totalPixels;
    const selected = active && id === frame.selectedWorker;
    const classes = `gpu-worker${active ? "" : " is-masked"}${paintedClass(id, frame.gpuPainted)}${selected ? " is-selected" : ""}`;
    const label = active
      ? `Worker ${id}; paints pixel ${id}${selected ? "; selected" : ""}`
      : `Worker ${id}; masked outside the image`;
    return `<button type="button" data-gpu-worker="${id}" role="button" tabindex="${active ? 0 : -1}" aria-label="${label}" title="${label}" class="${classes}" data-group="${groupId}" data-lane="${laneId}"></button>`;
  }).join("");
}

function renderWorkgroups({ layout, totalPixels, frame }) {
  return layout.groups.map((group) => `<section data-workgroup="${group.id}" class="workgroup-tile"><span>Group ${group.id}</span><div class="worker-map">${renderWorkers({ totalPixels, frame, layout: { workers: layout.workers.filter(({ groupId }) => groupId === group.id) } })}</div></section>`).join("");
}

function phaseClass(phase, current) {
  return `process-phase${phase === current ? " is-current" : ""}`;
}

export function renderProcessingScene({ totalPixels, groupSize, selectedWorker = null, frame = sceneFrameState(), presentation = "simulation" }) {
  requirePositiveInteger(totalPixels, "totalPixels");
  requirePositiveInteger(groupSize, "groupSize");
  if (selectedWorker !== null && (!Number.isInteger(selectedWorker) || selectedWorker < 0 || selectedWorker >= totalPixels)) {
    throw new RangeError("selectedWorker must identify an active pixel");
  }

  const viewFrame = sceneFrameState({ ...frame, selectedWorker });
  const layout = buildWorkgroupLayout({ totalPixels, groupSize });
  const dispatchReplay = presentation === "dispatch-replay";
  const phaseLabels = {
    prepare: "Prepare commands",
    submit: "Submit · CPU is free",
    work: "GPU workgroups",
    readback: "Read back result",
  };

  return `<div class="processing-scene" data-scene-phase="${viewFrame.phase}">
    <div class="scene-legend"><span>${dispatchReplay ? "Real WebGPU dispatch" : "Processing view"}</span><strong>${dispatchReplay ? "Worker timing is illustrative" : "Slowed visual · not timing"}</strong></div>
    <div class="processing-lanes">
      <section class="processing-lane cpu-lane" aria-labelledby="cpu-lane-title">
        <header><span>CPU</span><strong id="cpu-lane-title">CPU · sequential</strong><small>one job at a time</small></header>
        <div class="cpu-process" role="img" aria-label="CPU worker processing pixels sequentially">
          <span class="cpu-worker" aria-hidden="true">1</span>
          <span class="scene-arrow" aria-hidden="true">↓</span>
          <div class="job-map">${renderJobs({ totalPixels, frame: viewFrame, kind: "cpu" })}</div>
        </div>
      </section>
      <section class="processing-lane gpu-lane" aria-labelledby="gpu-lane-title">
        <header><span>GPU</span><strong id="gpu-lane-title">GPU · asynchronous</strong><small>many workers together</small></header>
        <div class="phase-path" aria-label="GPU processing phases">
          ${Object.entries(phaseLabels).map(([phase, label]) => `<span class="${phaseClass(phase, viewFrame.phase)}" data-phase="${phase}" ${phase === viewFrame.phase ? 'aria-current="step"' : ""}>${label}</span>`).join('<span aria-hidden="true">→</span>')}
        </div>
        <div class="workgroup-map" role="group" aria-label="GPU workers organized into workgroups">${renderWorkgroups({ layout, totalPixels, frame: viewFrame })}</div>
      </section>
    </div>
    ${selectedWorker === null ? "" : `<p class="selected-worker-readout">Worker ${selectedWorker} → Pixel ${selectedWorker}</p>`}
    <div class="pixel-link-map" aria-label="Worker to pixel map">
      ${Array.from({ length: totalPixels }, (_, id) => `<span data-pixel="${id}" class="pixel-link${selectedClass(id, selectedWorker)}" aria-label="Pixel ${id}">${id}</span>`).join("")}
    </div>
    <p class="scene-hint">Focus or select a worker to connect it to its pixel.</p>
    <p data-scene-status class="sr-only" role="status" aria-live="polite">${phaseLabels[viewFrame.phase] ?? "Ready to play the processing view"}</p>
  </div>`;
}
