export const LESSON_STEPS = Object.freeze([
  "see",
  "experiment",
  "race",
  "code",
]);

export function createLessonState() {
  return {
    stepIndex: 0,
    completed: [],
    selectedWorker: null,
  };
}

export function selectWorker(state, workerId, totalPixels) {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId >= totalPixels) {
    throw new RangeError("workerId must identify an active pixel");
  }

  return { ...state, selectedWorker: workerId };
}

export function advanceLesson(state) {
  if (state.stepIndex >= LESSON_STEPS.length - 1) {
    return state;
  }

  return {
    ...state,
    stepIndex: state.stepIndex + 1,
    completed: [...state.completed, LESSON_STEPS[state.stepIndex]],
  };
}

export function retreatLesson(state) {
  if (state.stepIndex === 0) {
    return state;
  }

  const stepIndex = state.stepIndex - 1;
  return {
    ...state,
    stepIndex,
    completed: LESSON_STEPS.slice(0, stepIndex),
  };
}

function requirePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function buildPixelWork({ width, height, blockSize }) {
  requirePositiveInteger("width", width);
  requirePositiveInteger("height", height);
  requirePositiveInteger("blockSize", blockSize);

  const totalPixels = width * height;
  const blockCount = Math.ceil(totalPixels / blockSize);
  const launchedThreads = blockCount * blockSize;
  const threads = Array.from({ length: launchedThreads }, (_, threadId) => {
    const active = threadId < totalPixels;

    return {
      threadId,
      blockId: Math.floor(threadId / blockSize),
      laneId: threadId % blockSize,
      pixelIndex: active ? threadId : null,
      x: active ? threadId % width : null,
      y: active ? Math.floor(threadId / width) : null,
      active,
    };
  });

  return { totalPixels, launchedThreads, blockCount, threads };
}

export function nextGridIndex({ current, key, columns, total }) {
  const moves = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };

  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  if (!(key in moves)) return current;

  return Math.min(total - 1, Math.max(0, current + moves[key]));
}
