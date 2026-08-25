const PIXEL_OPTIONS = new Set([64, 65_536, 1_048_576]);
const GROUP_OPTIONS = new Set([4, 8, 16, 32]);
const STAGES = new Set(["configure", "run", "compare"]);

function validateConfig({ pixels, groupSize }) {
  if (!PIXEL_OPTIONS.has(pixels)) throw new RangeError("pixels must be a lesson workload");
  if (!GROUP_OPTIONS.has(groupSize)) throw new RangeError("groupSize must be a lesson workgroup size");
}

function fingerprint(config) {
  return `${config.pixels}:${config.groupSize}`;
}

export function createExperimentSession({ pixels = 64, groupSize = 8 } = {}) {
  validateConfig({ pixels, groupSize });
  return { stage: "configure", config: { pixels, groupSize }, prediction: null, cpu: null, gpu: null };
}

export function setExperimentConfig(session, config) {
  validateConfig(config);
  if (fingerprint(session.config) === fingerprint(config)) return session;
  return { ...session, stage: "configure", config: { ...config }, cpu: null, gpu: null };
}

export function setExperimentStage(session, stage) {
  if (!STAGES.has(stage)) throw new RangeError("unknown experiment stage");
  return { ...session, stage };
}

function recordRun(session, slot, result) {
  return { ...session, [slot]: { result, fingerprint: fingerprint(session.config) } };
}

export function recordCpuRun(session, result) {
  return recordRun(session, "cpu", result);
}

export function recordGpuRun(session, result) {
  return recordRun(session, "gpu", result);
}

export function canCompare(session) {
  const expected = fingerprint(session.config);
  const cpu = session.cpu;
  const gpu = session.gpu;
  return Boolean(
    cpu?.fingerprint === expected
    && gpu?.fingerprint === expected
    && cpu.result?.correctness?.passed
    && gpu.result?.correctness?.passed
    && cpu.result?.workload?.pixels === session.config.pixels
    && gpu.result?.workload?.pixels === session.config.pixels
    && cpu.result?.output?.checksum === gpu.result?.output?.checksum,
  );
}
