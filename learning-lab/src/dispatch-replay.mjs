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
  if (!Number.isInteger(dispatch?.total_workgroups) || dispatch.total_workgroups <= 0) {
    throw new RangeError("dispatch must include total_workgroups");
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
    totalWorkgroups: dispatch.total_workgroups,
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
    <div><span>Real dispatch</span><strong>${formatCount(replay.totalWorkgroups)} workgroups</strong></div>
    <p>${scope}</p>
    <p>Real dispatch and validated result. Worker timing is illustrative because browsers do not expose physical GPU scheduling.</p>
  </div>`;
}
