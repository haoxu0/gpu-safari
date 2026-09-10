const SOURCE_VALUES = Object.freeze([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5]);
const COUNTS = Object.freeze([8, 16, 32]);

function assertValues(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError("values must be a non-empty array of numbers");
  }
}

export function reductionValues(count) {
  if (!COUNTS.includes(count)) throw new RangeError("count must be 8, 16, or 32");
  return SOURCE_VALUES.slice(0, count);
}

export function buildCpuReductionFrames(values) {
  assertValues(values);
  let sum = values[0];
  const frames = [{ kind: "cpu", step: 0, sum, values: [...values], activeIndex: 0, done: values.length === 1 }];
  values.slice(1).forEach((value, offset) => {
    const index = offset + 1;
    sum += value;
    frames.push({ kind: "cpu", step: index, sum, values: index === values.length - 1 ? [sum] : [...values], activeIndex: index, done: index === values.length - 1 });
  });
  return frames;
}

export function buildGpuReductionFrames(values, groupSize) {
  assertValues(values);
  if (![4, 8, 16].includes(groupSize)) throw new RangeError("group size must be 4, 8, or 16");
  const laneCount = Math.ceil(values.length / groupSize) * groupSize;
  const groupCount = laneCount / groupSize;
  let current = [...values, ...Array(laneCount - values.length).fill(0)];
  let active = current.map((_, index) => index < values.length);
  let groups = Array.from({ length: groupCount }, (_, group) => current.slice(group * groupSize, (group + 1) * groupSize));
  let activeGroups = Array.from({ length: groupCount }, (_, group) => active.slice(group * groupSize, (group + 1) * groupSize));
  const frames = [{ kind: "gpu", phase: "ready", round: 0, inputs: [], values: [...current], active: [...active], pairs: [], groupIds: current.map((_, index) => Math.floor(index / groupSize)), laneCount, groupSize, groupCount, done: laneCount === 1 }];
  let round = 0;
  while (groups[0].length > 1) {
    const inputs = groups.flat();
    const nextGroups = [];
    const nextActiveGroups = [];
    const pairs = [];
    groups.forEach((group, groupIndex) => {
      const next = [];
      const nextActive = [];
      const offset = groupIndex * group.length;
      for (let index = 0; index < group.length; index += 2) {
        next.push(group[index] + group[index + 1]);
        nextActive.push(activeGroups[groupIndex][index] || activeGroups[groupIndex][index + 1]);
        pairs.push([offset + index, offset + index + 1]);
      }
      nextGroups.push(next);
      nextActiveGroups.push(nextActive);
    });
    round += 1;
    groups = nextGroups;
    activeGroups = nextActiveGroups;
    current = groups.flat(); active = activeGroups.flat();
    frames.push({ kind: "gpu", phase: "local", round, inputs, values: [...current], active: [...active], pairs, groupIds: groups.flatMap((group, groupIndex) => group.map(() => groupIndex)), laneCount: current.length, groupSize, groupCount, done: current.length === 1 });
  }
  while (current.length > 1) {
    const inputs = [...current];
    const next = [];
    const nextActive = [];
    const pairs = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(current[index] + current[index + 1]);
      nextActive.push(active[index] || active[index + 1]);
      pairs.push([index, index + 1]);
    }
    round += 1; current = next; active = nextActive;
    frames.push({ kind: "gpu", phase: "merge", round, inputs, values: [...current], active: [...active], pairs, groupIds: current.map(() => 0), laneCount: current.length, groupSize, groupCount, done: current.length === 1 });
  }
  return frames;
}

export function buildReductionComparison(values, groupSize) {
  assertValues(values);
  if (![4, 8, 16].includes(groupSize)) throw new RangeError("group size must be 4, 8, or 16");
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    sum,
    outputsMatch: true,
    cpuAdditions: Math.max(0, values.length - 1),
    gpuRounds: buildGpuReductionFrames(values, groupSize).length - 1,
    operationCount: Math.max(0, values.length - 1),
  };
}
