export function createPlaybackController({ schedule, cancel, onFrame, onStateChange = () => {} }) {
  if (typeof schedule !== "function" || typeof cancel !== "function" || typeof onFrame !== "function") {
    throw new TypeError("schedule, cancel, and onFrame must be functions");
  }

  let scheduledId = null;
  let running = false;
  let generation = 0;
  let frames = [];
  let index = -1;

  function notify() { onStateChange({ running, index, count: frames.length }); }

  function cancelPending(shouldNotify = true) {
    if (scheduledId !== null) cancel(scheduledId);
    scheduledId = null;
    generation += 1;
    running = false;
    if (shouldNotify) notify();
  }

  function load(nextFrames) {
    if (!Array.isArray(nextFrames) || nextFrames.length === 0) throw new RangeError("frames must be a non-empty array");
    cancelPending(false); frames = [...nextFrames]; index = -1; notify();
  }

  function seek(nextIndex) {
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= frames.length) throw new RangeError("frame index is outside the loaded timeline");
    cancelPending(); index = nextIndex; onFrame(frames[index]); notify();
  }
  function reset() { cancelPending(); frames = []; index = -1; notify(); }

  function play(frames, delayMs) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new RangeError("frames must be a non-empty array");
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError("delayMs must be a non-negative number");
    }

    load(frames);
    const activeGeneration = generation;
    index = -1;
    running = true;
    notify();

    const advance = () => {
      if (activeGeneration !== generation) return;
      scheduledId = null;
      index += 1;
      onFrame(frames[index]);
      notify();
      if (index >= frames.length - 1) {
        running = false;
        notify();
        return;
      }
      scheduledId = schedule(advance, delayMs);
    };

    scheduledId = schedule(advance, delayMs === 0 ? 0 : delayMs);
  }

  return {
    play,
    load,
    seek,
    pause: cancelPending,
    reset,
    isRunning: () => running,
    currentIndex: () => index,
    frameCount: () => frames.length,
  };
}
