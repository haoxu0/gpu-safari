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

export function buildWorkgroupLayout({ totalPixels, groupSize }) {
  requirePositiveInteger(totalPixels, "totalPixels");
  requirePositiveInteger(groupSize, "groupSize");
  const width = 270;
  const padding = 10;
  const gap = 8;
  const launchedWorkers = Math.ceil(totalPixels / groupSize) * groupSize;
  const groupCount = launchedWorkers / groupSize;
  const columns = groupCount >= 8 ? 4 : 2;
  const groupWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const laneColumns = Math.min(groupSize, groupSize <= 8 ? 4 : 8);
  const cellGap = 3;
  const workerSize = Math.min(18, Math.floor((groupWidth - 12 - cellGap * (laneColumns - 1)) / laneColumns));
  const workerRows = Math.ceil(groupSize / laneColumns);
  const groupHeight = 28 + workerRows * (workerSize + cellGap) + 5;
  const rowCount = Math.ceil(groupCount / columns);
  const height = padding * 2 + rowCount * groupHeight + (rowCount - 1) * gap;
  const groups = Array.from({ length: groupCount }, (_, groupId) => ({
    id: groupId,
    x: padding + (groupId % columns) * (groupWidth + gap),
    y: padding + Math.floor(groupId / columns) * (groupHeight + gap),
    width: groupWidth,
    height: groupHeight,
  }));
  const workers = Array.from({ length: launchedWorkers }, (_, id) => {
    const groupId = Math.floor(id / groupSize);
    const laneId = id % groupSize;
    const group = groups[groupId];
    return {
      id,
      groupId,
      laneId,
      size: workerSize,
      x: group.x + 6 + (laneId % laneColumns) * (workerSize + cellGap),
      y: group.y + 22 + Math.floor(laneId / laneColumns) * (workerSize + cellGap),
    };
  });
  return { width, height, groups, workers };
}

function renderWorkers({ totalPixels, frame, layout }) {
  return layout.workers.map(({ id, groupId, laneId, x, y, size }) => {
    const active = id < totalPixels;
    const selected = active && id === frame.selectedWorker;
    const classes = `gpu-worker${active ? "" : " is-masked"}${paintedClass(id, frame.gpuPainted)}${selected ? " is-selected" : ""}`;
    const label = active
      ? `Worker ${id}; paints pixel ${id}${selected ? "; selected" : ""}`
      : `Worker ${id}; masked outside the image`;
    return `<g data-gpu-worker="${id}" role="button" tabindex="${active ? 0 : -1}" aria-label="${label}" class="${classes}" data-group="${groupId}" data-lane="${laneId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4"></rect><text x="${x + size / 2}" y="${y + size * .7}" text-anchor="middle">${id}</text></g>`;
  }).join("");
}

function renderWorkgroups(layout) {
  return layout.groups.map((group) => `<g data-workgroup="${group.id}" class="workgroup-tile"><rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="7"></rect><text x="${group.x + 7}" y="${group.y + 14}">GROUP ${group.id}</text></g>`).join("");
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
        <svg viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-label="GPU workers organized into workgroups">
          <g class="workgroup-map">${renderWorkgroups(layout)}</g>
          <g class="worker-map">${renderWorkers({ totalPixels, frame: viewFrame, layout })}</g>
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
