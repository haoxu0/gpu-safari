const PHASE_COMMAND = Object.freeze({ ready: "ready", cpu: "work", prepare: "encode", submit: "submit", work: "work", readback: "readback", complete: "result" });

function requirePositive(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
}

export function moveGroupSelection({ selectedGroup, direction, columns, groupCount }) {
  requirePositive(columns, "columns");
  requirePositive(groupCount, "groupCount");
  if (!Number.isInteger(selectedGroup) || selectedGroup < 0 || selectedGroup >= groupCount) throw new RangeError("selectedGroup is outside the dispatch grid");
  const offsets = { left: -1, right: 1, up: -columns, down: columns };
  if (!(direction in offsets)) throw new RangeError("direction must be left, right, up, or down");
  const candidate = selectedGroup + offsets[direction];
  if (candidate < 0 || candidate >= groupCount) return selectedGroup;
  if (direction === "left" && selectedGroup % columns === 0) return selectedGroup;
  if (direction === "right" && selectedGroup % columns === columns - 1) return selectedGroup;
  return candidate;
}

export function projectDispatchWorld({ frame, pixels, workloadPixels = pixels, groupSize, dispatch, selectedGroup = 0, executionKind, reducedMotion = false }) {
  requirePositive(pixels, "pixels");
  requirePositive(groupSize, "groupSize");
  if (!frame || !(frame.phase in PHASE_COMMAND)) throw new RangeError("frame has an unknown phase");
  if (!new Set(["cpu", "gpu"]).has(executionKind)) throw new RangeError("executionKind must be cpu or gpu");
  const painted = executionKind === "cpu" ? frame.cpuPainted : frame.gpuPainted;
  const output = Array.from({ length: pixels }, (_, id) => ({ id, state: painted.includes(id) ? "complete" : "waiting" }));
  const groupCount = executionKind === "gpu" ? Math.ceil(pixels / groupSize) : 0;
  if (executionKind === "gpu" && (!dispatch || dispatch.active_workgroups < groupCount)) throw new RangeError("dispatch must describe the active workload");
  if (groupCount && (!Number.isInteger(selectedGroup) || selectedGroup < 0 || selectedGroup >= groupCount)) throw new RangeError("selectedGroup is outside the active workload");
  const completeGroups = Math.floor(painted.length / groupSize);
  const groups = Array.from({ length: groupCount }, (_, id) => ({
    id,
    workerStart: id * groupSize,
    workerEnd: Math.min(pixels - 1, (id + 1) * groupSize - 1),
    state: frame.phase === "complete" || id < completeGroups ? "complete" : frame.phase === "work" && id === completeGroups ? "active" : "waiting",
  }));
  const start = selectedGroup * groupSize;
  const end = Math.min(pixels - 1, start + groupSize - 1);
  return {
    phase: frame.phase,
    commandState: PHASE_COMMAND[frame.phase],
    groups,
    output,
    selection: executionKind === "gpu" ? { groupId: selectedGroup, workerStart: start, workerEnd: end, pixelStart: start, pixelEnd: end } : null,
    camera: reducedMotion ? "still" : "angled",
    truth: {
      observed: executionKind === "gpu" ? `${workloadPixels} pixels · ${dispatch.active_workgroups} active workgroups` : `${painted.length} of ${workloadPixels} pixels painted`,
      illustrated: executionKind === "gpu" ? "Workgroup waves are illustrated" : "CPU progress follows the JavaScript loop",
    },
  };
}
