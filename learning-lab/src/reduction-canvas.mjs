import { projectThreadActivity } from "./reduction-thread-model.mjs";

const COLORS = Object.freeze({ background: "#07110e", grid: "#193127", ink: "#eff8f3", muted: "#88a096", green: "#55d895", greenSoft: "#173b2a", blue: "#69a9ea", blueSoft: "#17324b", amber: "#f2b84b" });

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

export function drawReductionFrame(canvas, frame, selectedThread = 0) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, canvas.clientWidth || 640);
  const height = Math.max(300, canvas.clientHeight || 360);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d"); context.scale(ratio, ratio); context.clearRect(0, 0, width, height); context.fillStyle = COLORS.background; context.fillRect(0, 0, width, height);
  context.strokeStyle = COLORS.grid; context.lineWidth = 1;
  for (let x = 24; x < width; x += 36) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
  const layout = projectReductionLayout(frame, width, height, selectedThread);
  context.fillStyle = frame.kind === "cpu" ? COLORS.blue : COLORS.green; context.font = "800 11px ui-monospace, monospace"; context.textAlign = "left"; context.fillText(layout.caption, 24, 28);
  if (frame.kind === "cpu") {
    circle(context, layout.accumulator.x, layout.accumulator.y, 34, COLORS.blueSoft, COLORS.blue, layout.accumulator.value);
    context.fillStyle = COLORS.muted; context.textAlign = "center"; context.fillText("ACCUMULATOR", layout.accumulator.x, layout.accumulator.y + 54);
    layout.values.forEach((node, index) => circle(context, node.x, node.y, 15, index === layout.activeIndex ? COLORS.blueSoft : COLORS.background, index === layout.activeIndex ? COLORS.blue : COLORS.grid, node.value));
  } else {
    context.save(); context.setLineDash([4, 6]); context.strokeStyle = COLORS.amber; context.lineWidth = 1;
    layout.groupBoundaries.forEach((x) => { context.beginPath(); context.moveTo(x, height * 0.48); context.lineTo(x, height * 0.75); context.stroke(); });
    context.restore();
    if (["write", "barrier"].includes(layout.microPhase)) {
      context.strokeStyle = COLORS.green; context.lineWidth = 2;
      layout.connections.forEach((line) => { context.beginPath(); context.moveTo(line.fromX, line.fromY + 13); context.lineTo(line.toX, line.toY - 20); context.stroke(); });
    }
    layout.inputNodes.forEach((node, index) => circle(context, node.x, node.y, 12, layout.selectedInputIndices.includes(index) ? "#4b3915" : COLORS.background, layout.selectedInputIndices.includes(index) ? COLORS.amber : COLORS.muted, node.value));
    if (layout.microPhase !== "read") layout.nodes.forEach((node) => circle(context, node.x, node.y, layout.nodeRadius, node.active ? COLORS.greenSoft : COLORS.background, node.active ? COLORS.green : COLORS.muted, node.active ? node.value : "×"));
    if (layout.microPhase === "add" && layout.selectedOperation) {
      const operation = layout.selectedOperation;
      context.fillStyle = COLORS.amber; context.font = "800 15px ui-monospace, monospace"; context.textAlign = "center";
      context.fillText(`${operation.left} + ${operation.right} = ${operation.result}`, width / 2, height * 0.48);
    }
    if (layout.barrierVisible) {
      context.strokeStyle = COLORS.amber; context.lineWidth = 3;
      layout.barriers.forEach((barrier) => { context.beginPath(); context.moveTo(barrier.fromX, height * 0.82); context.lineTo(barrier.toX, height * 0.82); context.stroke(); });
      context.fillStyle = COLORS.amber; context.textAlign = "center"; context.fillText("EACH WORKGROUP WAITS AT ITS OWN BARRIER", width / 2, height * 0.9);
    } else {
      context.fillStyle = COLORS.muted; context.textAlign = "center"; context.fillText(frame.round === 0 ? "SHARED MEMORY · VALUES READY" : layout.microPhase === "read" ? "READ TWO VALUES" : layout.microPhase === "add" ? "ADD INSIDE EACH ACTIVE THREAD" : "WRITE RESULTS TO SHARED MEMORY", width / 2, height * 0.86);
    }
  }
}
