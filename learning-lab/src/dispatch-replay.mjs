import { sceneFrameState } from "./processing-scene.mjs";

const MAX_VISIBLE_PIXELS = 64;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function buildDispatchReplay({ pixels, groupSize, dispatch }) {
  if (!Number.isInteger(pixels) || pixels <= 0) throw new RangeError("pixels must be a positive integer");
  if (!Number.isInteger(groupSize) || groupSize <= 0) throw new RangeError("groupSize must be a positive integer");
  const validDispatch = [
    dispatch?.workgroups_x,
    dispatch?.workgroups_y,
    dispatch?.active_workgroups,
    dispatch?.dispatched_workgroups,
  ].every((value) => Number.isInteger(value) && value > 0);
  if (!validDispatch || dispatch.dispatched_workgroups !== dispatch.workgroups_x * dispatch.workgroups_y) {
    throw new RangeError("dispatch must include consistent workgroup dimensions and counts");
  }
  if (dispatch.active_workgroups > dispatch.dispatched_workgroups) {
    throw new RangeError("active workgroups cannot exceed dispatched workgroups");
  }

  const visiblePixels = Math.min(pixels, MAX_VISIBLE_PIXELS);
  const visibleWorkgroups = Math.ceil(visiblePixels / groupSize);
  const allVisiblePixels = Array.from({ length: visiblePixels }, (_, id) => id);
  const frames = [
    sceneFrameState({ phase: "prepare", cpuPainted: allVisiblePixels }),
    sceneFrameState({ phase: "submit", cpuPainted: allVisiblePixels }),
  ];
  const gpuPainted = [];
  for (let first = 0; first < visiblePixels; first += groupSize) {
    gpuPainted.push(...allVisiblePixels.slice(first, first + groupSize));
    frames.push(sceneFrameState({ phase: "work", cpuPainted: allVisiblePixels, gpuPainted }));
  }
  frames.push(sceneFrameState({ phase: "readback", cpuPainted: allVisiblePixels, gpuPainted: allVisiblePixels }));
  frames.push(sceneFrameState({ phase: "complete", cpuPainted: allVisiblePixels, gpuPainted: allVisiblePixels }));

  return {
    frames,
    visiblePixels,
    visibleWorkgroups,
    workgroupsX: dispatch.workgroups_x,
    workgroupsY: dispatch.workgroups_y,
    activeWorkgroups: dispatch.active_workgroups,
    dispatchedWorkgroups: dispatch.dispatched_workgroups,
    fullyMaskedWorkgroups: dispatch.dispatched_workgroups - dispatch.active_workgroups,
    isRepresentative: pixels > visiblePixels,
  };
}

export function renderDispatchFacts({ replay, device, pixels, groupSize }) {
  const scope = replay.isRepresentative
    ? `Representative view · ${formatCount(replay.visiblePixels)} of ${formatCount(pixels)} workers`
    : `Complete view · all ${formatCount(pixels)} workers`;
  return `<div class="dispatch-facts" aria-label="Real WebGPU dispatch facts">
    <div><span>Device</span><strong>${escapeHtml(device)}</strong></div>
    <div><span>Real workload</span><strong>${formatCount(pixels)} pixels</strong></div>
    <div><span>Workgroup size</span><strong>${formatCount(groupSize)} workers</strong></div>
    <div><span>Active workgroups</span><strong>${formatCount(replay.activeWorkgroups)}</strong></div>
    <div><span>Submitted grid</span><strong>${formatCount(replay.workgroupsX)} × ${formatCount(replay.workgroupsY)}</strong></div>
    <div><span>Dispatched groups</span><strong>${formatCount(replay.dispatchedWorkgroups)}</strong></div>
    <div><span>Grid padding</span><strong>${formatCount(replay.fullyMaskedWorkgroups)} fully masked</strong></div>
    <p>${scope}</p>
    <p>Real dispatch and validated result. Worker timing is illustrative because browsers do not expose physical GPU scheduling.</p>
  </div>`;
}
