import { buildGpuReductionFrames } from "./reduction-model.mjs";

export const THREAD_PHASES = Object.freeze(["read", "add", "write", "barrier"]);

export function buildGpuThreadTimeline(values, groupSize) {
  const rounds = buildGpuReductionFrames(values, groupSize);
  const ready = { ...rounds[0], microPhase: "ready", done: false };
  const work = rounds.slice(1).flatMap((frame) => THREAD_PHASES.map((microPhase) => ({
    ...frame,
    microPhase,
    done: frame.done && microPhase === "barrier",
  })));
  return [ready, ...work];
}

function operationsFor(frame) {
  const localCounts = new Map();
  const inputActive = frame.inputActive ?? frame.inputs.map(() => true);
  return frame.pairs.map(([leftIndex, rightIndex], resultIndex) => {
    const groupId = frame.phase === "local" ? frame.groupIds[resultIndex] : 0;
    const localIndex = localCounts.get(groupId) ?? 0;
    localCounts.set(groupId, localIndex + 1);
    const threadId = groupId * frame.groupSize + localIndex;
    const leftActive = inputActive[leftIndex] !== false;
    const rightActive = inputActive[rightIndex] !== false;
    return {
      threadId, groupId, leftIndex, rightIndex,
      left: frame.inputs[leftIndex], right: frame.inputs[rightIndex], result: frame.values[resultIndex],
      leftActive, rightActive, useful: leftActive || rightActive,
    };
  });
}

function threadDetail(thread, frame) {
  const operation = thread.operation;
  if (frame.microPhase === "ready") return thread.status === "masked" ? `T${thread.threadId} is a padding lane.` : `T${thread.threadId} is ready with one value.`;
  if (frame.microPhase === "barrier") return `T${thread.threadId} waits for the other threads in WG ${thread.groupId}.`;
  if (!operation) return `T${thread.threadId} has no addition this round.`;
  if (!operation.useful) return `T${thread.threadId}'s inputs are padding, so it is masked.`;
  const left = operation.leftActive ? operation.left : "padding 0";
  const right = operation.rightActive ? operation.right : "padding 0";
  if (frame.microPhase === "read") return `T${thread.threadId} reads ${left} and ${right} from shared memory.`;
  if (frame.microPhase === "add") return `T${thread.threadId} adds ${left} + ${right} = ${operation.result}.`;
  return `T${thread.threadId} writes ${operation.result} back to shared memory.`;
}

export function projectThreadActivity(frame, selectedThread = 0) {
  if (frame.kind !== "gpu") return { phase: "cpu", threads: [], selected: null };
  const groupCount = frame.groupCount ?? 1;
  const threadCount = frame.phase === "merge" ? frame.groupSize : groupCount * frame.groupSize;
  const operations = frame.microPhase === "ready" ? [] : operationsFor(frame);
  const operationByThread = new Map(operations.map((operation) => [operation.threadId, operation]));
  const threads = Array.from({ length: threadCount }, (_, threadId) => {
    const groupId = Math.floor(threadId / frame.groupSize);
    const operation = operationByThread.get(threadId) ?? null;
    let status = "idle";
    if (frame.microPhase === "ready") status = frame.active[threadId] ? "active" : "masked";
    else if (frame.microPhase === "barrier") status = "waiting";
    else if (operation) status = operation.useful ? "active" : "masked";
    return { threadId, groupId, status, operation };
  });
  const safeIndex = Math.max(0, Math.min(selectedThread, threads.length - 1));
  const selected = { ...threads[safeIndex] };
  selected.detail = threadDetail(selected, frame);
  return { phase: frame.microPhase, threads, selected };
}
