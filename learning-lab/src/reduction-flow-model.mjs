import { projectThreadActivity } from "./reduction-thread-model.mjs";

const lerp = (start, end, progress) => start + (end - start) * progress;
const pointOnPath = (from, to, progress) => ({ x: lerp(from.x, to.x, progress), y: lerp(from.y, to.y, progress) });

function pointOnPolyline(points, progress) {
  if (points.length < 2) return points[0];
  const scaled = Math.min(0.999999, Math.max(0, progress)) * (points.length - 1);
  const segment = Math.floor(scaled);
  return pointOnPath(points[segment], points[segment + 1], scaled - segment);
}

function movingParticle(points, progress, details) {
  const position = pointOnPolyline(points, progress);
  return { ...details, ...position, from: points[0], to: points.at(-1), points, progress, trail: [0.09, 0.06, 0.03].map((offset) => pointOnPolyline(points, Math.max(0, progress - offset))) };
}

export function flowProgressAt(timestamp, cycleMs = 900) {
  if (!(cycleMs > 0)) throw new RangeError("flow cycle must be positive");
  return ((timestamp % cycleMs) + cycleMs) % cycleMs / cycleMs;
}

export function flowStartForProgress(now, progress, cycleMs = 900) {
  if (!(cycleMs > 0)) throw new RangeError("flow cycle must be positive");
  return now - Math.max(0, Math.min(1, progress)) * cycleMs;
}

export function advanceReductionMachine(machine, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const particles = machine.flow.particles.map((particle) => {
    if (!particle.points) return particle;
    const position = pointOnPolyline(particle.points, t);
    return { ...particle, ...position, progress: t, trail: [0.09, 0.06, 0.03].map((offset) => pointOnPolyline(particle.points, Math.max(0, t - offset))) };
  });
  return { ...machine, flow: { ...machine.flow, particles } };
}

function spacedSlots(values, left, right, y) {
  return values.map((value, index) => ({
    value,
    x: values.length === 1 ? (left + right) / 2 : lerp(left, right, index / (values.length - 1)),
    y,
  }));
}

export function projectReductionMachine(frame, width, height, selectedThread = 0, progress = 0) {
  if (frame.kind !== "gpu") throw new TypeError("data-flow machine requires a GPU frame");
  if (!(width > 0) || !(height > 0)) throw new RangeError("machine dimensions must be positive");
  const t = Math.max(0, Math.min(1, progress));
  const activity = projectThreadActivity(frame, selectedThread);
  const groupCount = frame.phase === "merge" ? 1 : frame.groupCount;
  const outer = width * 0.055;
  const gap = Math.max(10, width * 0.018);
  const columns = Math.min(groupCount, width < 600 ? 2 : 4);
  const rows = Math.ceil(groupCount / columns);
  const groupWidth = (width - outer * 2 - gap * (columns - 1)) / columns;
  const workTop = height * 0.18;
  const workBottom = height * 0.84;
  const rowGap = Math.max(9, height * 0.016);
  const groupHeight = (workBottom - workTop - rowGap * (rows - 1)) / rows;
  const memoryValues = frame.round === 0 ? frame.values : frame.inputs;
  const globalSlots = spacedSlots(memoryValues, outer, width - outer, height * 0.105);
  let inputOffset = 0;
  const workgroups = Array.from({ length: groupCount }, (_, groupId) => {
    const column = groupId % columns;
    const row = Math.floor(groupId / columns);
    const left = outer + column * (groupWidth + gap);
    const right = left + groupWidth;
    const top = workTop + row * (groupHeight + rowGap);
    const bottom = top + groupHeight;
    const threadActivity = activity.threads.filter((thread) => thread.groupId === groupId);
    const threadSlots = spacedSlots(Array.from({ length: frame.groupSize }, (_, lane) => lane), left + 12, right - 12, top + groupHeight * 0.25);
    const threads = threadSlots.map((slot, lane) => ({ ...slot, lane, threadId: groupId * frame.groupSize + lane, status: threadActivity[lane]?.status ?? "idle" }));
    const computeUnits = threads.map((thread) => ({ x: thread.x, y: top + groupHeight * 0.5, threadId: thread.threadId }));
    const groupValues = frame.values.filter((_, index) => (frame.groupIds?.[index] ?? 0) === groupId);
    const inputCount = frame.round === 0 ? groupValues.length : frame.phase === "merge" ? frame.inputs.length : Math.min(frame.inputs.length - inputOffset, Math.max(0, groupValues.length * 2));
    const groupInputs = frame.round === 0 ? groupValues : frame.inputs.slice(inputOffset, inputOffset + inputCount);
    const inputIndices = groupInputs.map((_, localIndex) => inputOffset + localIndex);
    inputOffset += inputCount;
    const sharedY = top + groupHeight * 0.76;
    const inputSlots = spacedSlots(groupInputs, left + 12, right - 12, sharedY).map((slot, index) => ({ ...slot, inputIndex: inputIndices[index] }));
    const outputSlots = spacedSlots(groupValues, left + 16, right - 16, sharedY);
    return {
      groupId, left, right, top, bottom,
      threads, computeUnits,
      sharedMemory: { label: "SHARED MEMORY", slots: ["write", "barrier"].includes(frame.microPhase) ? outputSlots : inputSlots, inputSlots, outputSlots, y: sharedY },
      barrier: { active: frame.microPhase === "barrier", y: top + groupHeight * 0.91 },
    };
  });
  const partialValues = frame.phase === "merge"
    ? (["write", "barrier"].includes(frame.microPhase) ? frame.values : frame.inputs)
    : (frame.phase === "local" && frame.values.length === frame.groupCount && ["write", "barrier"].includes(frame.microPhase) ? frame.values : []);
  const partialSlots = spacedSlots(partialValues, outer, width - outer, height * 0.93);
  const selectedInputs = new Set(activity.selected?.operation ? [activity.selected.operation.leftIndex, activity.selected.operation.rightIndex] : []);
  const particles = [];
  if (frame.microPhase === "ready") {
    workgroups.flatMap((group) => group.sharedMemory.inputSlots.map((targetPoint, lane) => ({ group, targetPoint, lane }))).forEach(({ group, targetPoint, lane }, index) => {
      const sourcePoint = globalSlots[index];
      const threadPoint = group.threads[lane];
      const computePoint = group.computeUnits[lane];
      if (sourcePoint && threadPoint && computePoint) particles.push(movingParticle([sourcePoint, threadPoint, computePoint, targetPoint], t, { value: sourcePoint.value, source: "global", target: "shared", selected: index === activity.selected?.threadId }));
    });
  } else if (frame.microPhase === "read") {
    activity.threads.forEach((thread) => {
      if (!thread.operation?.useful) return;
      const target = workgroups[thread.groupId]?.computeUnits.find(({ threadId }) => threadId === thread.threadId);
      for (const inputIndex of [thread.operation.leftIndex, thread.operation.rightIndex]) {
        const sharedSource = workgroups[thread.groupId]?.sharedMemory.inputSlots.find((slot) => slot.inputIndex === inputIndex);
        const sourcePoint = frame.phase === "merge" ? partialSlots[inputIndex] : sharedSource;
        if (!sourcePoint || !target) continue;
        const source = frame.phase === "merge" ? "partial" : "shared";
        const threadPoint = workgroups[thread.groupId]?.threads.find(({ threadId }) => threadId === thread.threadId);
        particles.push(movingParticle(threadPoint ? [sourcePoint, threadPoint, target] : [sourcePoint, target], t, { value: sourcePoint.value, source, target: "compute", selected: selectedInputs.has(inputIndex) }));
      }
    });
  } else if (frame.microPhase === "add") {
    activity.threads.forEach((thread) => {
      if (!thread.operation?.useful) return;
      const unit = workgroups[thread.groupId]?.computeUnits.find(({ threadId }) => threadId === thread.threadId);
      if (unit) {
        const points = [{ x: unit.x - 6, y: unit.y }, { x: unit.x + 6, y: unit.y }, { x: unit.x - 6, y: unit.y }];
        particles.push(movingParticle(points, t, { value: thread.operation.result, source: "compute", target: "compute", selected: thread.threadId === activity.selected.threadId }));
      }
    });
  } else if (frame.microPhase === "write") {
    activity.threads.forEach((thread) => {
      if (!thread.operation?.useful) return;
      const group = workgroups[thread.groupId];
      const sourcePoint = group?.computeUnits.find(({ threadId }) => threadId === thread.threadId);
      const localIndex = thread.threadId % frame.groupSize;
      const targetPoint = group?.sharedMemory.outputSlots[localIndex];
      if (sourcePoint && targetPoint) {
        const partialTarget = frame.phase === "merge" ? partialSlots[localIndex] : frame.values.length === frame.groupCount ? partialSlots[thread.groupId] : null;
        const points = partialTarget ? [sourcePoint, targetPoint, partialTarget] : [sourcePoint, targetPoint];
        particles.push(movingParticle(points, t, { value: thread.operation.result, source: "compute", target: partialTarget ? "partial" : "shared", selected: thread.threadId === activity.selected.threadId }));
      }
    });
  }
  return {
    globalMemory: { label: "GLOBAL MEMORY", slots: globalSlots, y: height * 0.105 },
    workgroups,
    partialSums: { label: "PARTIAL SUMS", slots: partialSlots, y: height * 0.93 },
    flow: { phase: frame.microPhase, particles },
    selectedThread: activity.selected?.threadId ?? 0,
  };
}
