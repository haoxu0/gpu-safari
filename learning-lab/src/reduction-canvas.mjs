import { projectThreadActivity } from "./reduction-thread-model.mjs";
import { advanceReductionMachine, projectReductionMachine } from "./reduction-flow-model.mjs";

const COLORS = Object.freeze({ background: "#07110e", grid: "#193127", ink: "#eff8f3", muted: "#88a096", green: "#55d895", greenSoft: "#173b2a", blue: "#69a9ea", blueSoft: "#17324b", amber: "#f2b84b" });
const machineCache = new WeakMap();

export function projectReductionLayout(frame, width, height, selectedThread = 0) {
  if (!(width > 0) || !(height > 0)) throw new RangeError("canvas dimensions must be positive");
  if (frame.kind === "cpu") {
    return {
      mode: "cpu",
      caption: frame.done ? "COMPLETE · ONE SUM" : frame.step === 0 ? "START · FIRST VALUE" : `STEP ${frame.step} · ONE ADDITION`,
      accumulator: { x: width * 0.5, y: height * 0.34, value: frame.sum },
      values: frame.values.map((value, index) => ({ value, x: width * 0.1 + index * (width * 0.8 / Math.max(1, frame.values.length - 1)), y: height * 0.72 })),
      activeIndex: frame.activeIndex,
    };
  }
  const count = frame.values.length;
  const rowX = (index, total) => total === 1 ? width / 2 : width * 0.1 + index * (width * 0.8 / (total - 1));
  const nodes = frame.values.map((value, index) => ({ value, active: frame.active[index], x: rowX(index, count), y: height * 0.62 }));
  const inputNodes = (frame.inputs ?? []).map((value, index, inputs) => ({ value, x: rowX(index, inputs.length), y: height * 0.3 }));
  const spacing = count > 1 ? width * 0.8 / (count - 1) : width;
  const caption = frame.done ? "COMPLETE · ONE SUM" : frame.round === 0 ? `READY · ${frame.active.filter(Boolean).length} VALUES` : frame.phase === "merge" ? `ROUND ${frame.round} · MERGE PARTIAL SUMS` : `ROUND ${frame.round} · ${frame.pairs.length} PAIRS · GROUPS OF ${frame.groupSize}`;
  const groupIds = frame.groupIds ?? nodes.map(() => 0);
  const groupBoundaries = [];
  for (let index = 1; index < groupIds.length; index += 1) {
    if (groupIds[index] !== groupIds[index - 1]) groupBoundaries.push((nodes[index - 1].x + nodes[index].x) / 2);
  }
  const activity = projectThreadActivity(frame, selectedThread);
  const selectedInputIndices = activity.selected?.operation ? [activity.selected.operation.leftIndex, activity.selected.operation.rightIndex] : [];
  return {
    mode: "gpu",
    caption,
    nodes,
    nodeRadius: Math.min(25, Math.max(5, spacing * 0.36)),
    groupBoundaries,
    inputNodes,
    connections: frame.pairs.flatMap((pair, resultIndex) => pair.map((inputIndex) => ({ fromX: inputNodes[inputIndex]?.x, fromY: inputNodes[inputIndex]?.y, toX: nodes[resultIndex]?.x, toY: nodes[resultIndex]?.y }))),
    round: frame.round,
    microPhase: frame.microPhase ?? "write",
    selectedInputIndices,
    selectedOperation: activity.selected?.operation ?? null,
    barrierVisible: frame.microPhase === "barrier",
    barriers: (() => {
      if (frame.phase === "merge") return [{ groupId: 0, fromX: width * 0.06, toX: width * 0.94 }];
      const resultsPerGroup = new Map();
      (frame.groupIds ?? [0]).forEach((groupId) => resultsPerGroup.set(groupId, (resultsPerGroup.get(groupId) ?? 0) + 1));
      let inputOffset = 0;
      return [...resultsPerGroup].map(([groupId, resultCount]) => {
        const groupInputs = inputNodes.slice(inputOffset, inputOffset + resultCount * 2);
        inputOffset += resultCount * 2;
        return { groupId, fromX: groupInputs[0]?.x ?? width * 0.1, toX: groupInputs.at(-1)?.x ?? width * 0.9 };
      });
    })(),
  };
}

function circle(context, x, y, radius, fill, stroke, value) {
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = fill; context.fill();
  context.strokeStyle = stroke; context.lineWidth = 2; context.stroke();
  context.fillStyle = COLORS.ink; context.font = `700 ${Math.max(7, Math.min(14, radius * 0.78))}px ui-monospace, monospace`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(value), x, y);
}

function label(context, text, x, y, color = COLORS.muted, align = "left", size = 9) {
  context.fillStyle = color; context.font = `800 ${size}px ui-monospace, monospace`; context.textAlign = align; context.textBaseline = "middle"; context.fillText(text, x, y);
}

function path(context, from, to, color, width = 1) {
  context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.strokeStyle = color; context.lineWidth = width; context.stroke();
}

function polyline(context, points, color, width = 1) {
  if (!points.length) return;
  context.beginPath(); context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.strokeStyle = color; context.lineWidth = width; context.stroke();
}

function drawMachine(context, machine, frame, width, height) {
  label(context, machine.globalMemory.label, 18, 22, COLORS.blue, "left", 10);
  context.fillStyle = "#0d1d27"; context.strokeStyle = "#31536a"; context.lineWidth = 1;
  context.beginPath(); context.roundRect(14, 34, width - 28, Math.max(38, height * 0.105), 8); context.fill(); context.stroke();
  const memoryRadius = Math.max(3, Math.min(11, width * 0.32 / Math.max(1, machine.globalMemory.slots.length)));
  machine.globalMemory.slots.forEach((slot) => circle(context, slot.x, slot.y, memoryRadius, "#142c39", COLORS.blue, slot.value));

  machine.workgroups.forEach((group) => {
    context.fillStyle = "rgba(13, 31, 23, .88)"; context.strokeStyle = group.barrier.active ? COLORS.amber : "#2b6548"; context.lineWidth = group.barrier.active ? 2 : 1;
    context.beginPath(); context.roundRect(group.left, group.top, group.right - group.left, group.bottom - group.top, 10); context.fill(); context.stroke();
    label(context, `WORKGROUP ${group.groupId}`, group.left + 9, group.top + 12, COLORS.green, "left", 8);
    label(context, "THREADS", group.left + 9, group.top + (group.bottom - group.top) * 0.16, COLORS.muted, "left", 7);
    const laneRadius = Math.max(3, Math.min(10, (group.right - group.left) / Math.max(10, group.threads.length * 2.7)));
    group.threads.forEach((thread) => {
      const selected = thread.threadId === machine.selectedThread;
      const stroke = selected ? COLORS.amber : thread.status === "active" ? COLORS.green : thread.status === "waiting" ? COLORS.amber : "#53635b";
      circle(context, thread.x, thread.y, laneRadius, selected ? "#493714" : COLORS.greenSoft, stroke, `T${thread.threadId}`);
    });
    label(context, "COMPUTE", group.left + 9, group.top + (group.bottom - group.top) * 0.41, COLORS.muted, "left", 7);
    group.computeUnits.forEach((unit) => {
      const selected = unit.threadId === machine.selectedThread;
      context.fillStyle = selected ? "#493714" : "#112a1e"; context.strokeStyle = selected ? COLORS.amber : "#367554"; context.lineWidth = selected ? 2 : 1;
      context.beginPath(); context.roundRect(unit.x - laneRadius, unit.y - laneRadius, laneRadius * 2, laneRadius * 2, 3); context.fill(); context.stroke();
      label(context, "+", unit.x, unit.y, selected ? COLORS.amber : COLORS.green, "center", Math.max(7, laneRadius));
    });
    label(context, group.sharedMemory.label, group.left + 9, group.top + (group.bottom - group.top) * 0.65, COLORS.muted, "left", 7);
    path(context, { x: group.left + 9, y: group.sharedMemory.y }, { x: group.right - 9, y: group.sharedMemory.y }, "#315841", 5);
    group.sharedMemory.slots.forEach((slot) => circle(context, slot.x, slot.y, Math.max(3, laneRadius * 0.75), "#183b29", COLORS.green, slot.value));
    if (group.barrier.active) {
      path(context, { x: group.left + 9, y: group.barrier.y }, { x: group.right - 9, y: group.barrier.y }, COLORS.amber, 3);
      label(context, "BARRIER", (group.left + group.right) / 2, group.barrier.y - 7, COLORS.amber, "center", 7);
    }
  });

  machine.flow.particles.forEach((particle) => {
    const color = particle.selected ? COLORS.amber : COLORS.green;
    polyline(context, particle.points ?? [particle.from, particle.to], particle.selected ? "rgba(242,184,75,.55)" : "rgba(85,216,149,.24)", particle.selected ? 2 : 1);
    [...(particle.trail ?? []), particle].forEach((point, index, points) => {
      context.globalAlpha = (index + 1) / points.length; context.beginPath(); context.arc(point.x, point.y, particle.selected ? 4 : 3, 0, Math.PI * 2); context.fillStyle = color; context.fill();
    });
    context.globalAlpha = 1;
  });

  label(context, machine.partialSums.label, 18, height * 0.875, COLORS.amber, "left", 9);
  path(context, { x: 14, y: height * 0.9 }, { x: width - 14, y: height * 0.9 }, "#5b4620", 5);
  machine.partialSums.slots.forEach((slot) => circle(context, slot.x, slot.y, Math.max(4, memoryRadius), "#3b2d13", COLORS.amber, slot.value));
  const phase = frame.microPhase === "ready" ? "LOAD" : frame.microPhase?.toUpperCase();
  label(context, `${phase} · DATA MOVES THROUGH THE GPU`, width - 18, 22, frame.microPhase === "barrier" ? COLORS.amber : COLORS.green, "right", 9);
}

export function drawReductionFrame(canvas, frame, selectedThread = 0, flowProgress = 0) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, canvas.clientWidth || 640);
  const visibleGroups = frame.kind === "gpu" ? (frame.phase === "merge" ? 1 : frame.groupCount) : 1;
  const columns = width < 600 ? 2 : 4;
  const desiredHeight = frame.kind === "gpu" ? Math.max(520, 245 + Math.ceil(visibleGroups / columns) * 175) : 360;
  if (canvas.style.height !== `${desiredHeight}px`) canvas.style.height = `${desiredHeight}px`;
  const height = desiredHeight;
  const pixelWidth = Math.round(width * ratio); const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height); context.fillStyle = COLORS.background; context.fillRect(0, 0, width, height);
  context.strokeStyle = COLORS.grid; context.lineWidth = 1;
  for (let x = 24; x < width; x += 36) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  const layout = projectReductionLayout(frame, width, height, selectedThread);
  if (frame.kind === "cpu") {
    context.fillStyle = COLORS.blue; context.font = "800 11px ui-monospace, monospace"; context.textAlign = "left"; context.fillText(layout.caption, 24, 28);
    circle(context, layout.accumulator.x, layout.accumulator.y, 34, COLORS.blueSoft, COLORS.blue, layout.accumulator.value);
    context.fillStyle = COLORS.muted; context.textAlign = "center"; context.fillText("ACCUMULATOR", layout.accumulator.x, layout.accumulator.y + 54);
    layout.values.forEach((node, index) => circle(context, node.x, node.y, 15, index === layout.activeIndex ? COLORS.blueSoft : COLORS.background, index === layout.activeIndex ? COLORS.blue : COLORS.grid, node.value));
  } else {
    const cached = machineCache.get(canvas);
    const baseMachine = cached?.frame === frame && cached.selectedThread === selectedThread && cached.width === width && cached.height === height
      ? cached.machine
      : projectReductionMachine(frame, width, height, selectedThread, 0);
    if (baseMachine !== cached?.machine) machineCache.set(canvas, { frame, selectedThread, width, height, machine: baseMachine });
    drawMachine(context, advanceReductionMachine(baseMachine, flowProgress), frame, width, height);
  }
}
