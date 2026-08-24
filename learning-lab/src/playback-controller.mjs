export function createPlaybackController({ schedule, cancel, onFrame }) {
  if (typeof schedule !== "function" || typeof cancel !== "function" || typeof onFrame !== "function") {
    throw new TypeError("schedule, cancel, and onFrame must be functions");
  }

  let scheduledId = null;
  let running = false;
  let generation = 0;

  function cancelPending() {
    if (scheduledId !== null) cancel(scheduledId);
    scheduledId = null;
    generation += 1;
    running = false;
  }

  function play(frames, delayMs) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new RangeError("frames must be a non-empty array");
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("delayMs must be a non-negative number");
    }

    cancelPending();
    const activeGeneration = generation;
    let index = 0;
    running = true;

    const advance = () => {
      if (activeGeneration !== generation) return;
      scheduledId = null;
      onFrame(frames[index]);
      index += 1;
      if (index >= frames.length) {
        running = false;
        return;
      }
      scheduledId = schedule(advance, delayMs);
    };

    scheduledId = schedule(advance, delayMs === 0 ? 0 : delayMs);
  }

  return {
    play,
    pause: cancelPending,
    reset: cancelPending,
    isRunning: () => running,
  };
}
