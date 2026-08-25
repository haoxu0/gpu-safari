import test from "node:test";
import assert from "node:assert/strict";

import {
  canCompare,
  createExperimentSession,
  recordCpuRun,
  recordGpuRun,
  setExperimentConfig,
  setExperimentStage,
} from "../src/experiment-session.mjs";

function result(provider, pixels = 64, checksum = 32, groupSize = 8) {
  return {
    provider,
    workload: { pixels, group_size: groupSize },
    correctness: { passed: true },
    output: { checksum },
  };
}

test("a session starts at configure with independent empty run slots", () => {
  assert.deepEqual(createExperimentSession({}), {
    stage: "configure",
    config: { pixels: 64, groupSize: 8 },
    prediction: null,
    cpu: null,
    gpu: null,
  });
});

test("CPU and GPU results can arrive independently before comparison", () => {
  const initial = createExperimentSession({});
  const withCpu = recordCpuRun(initial, result("browser-cpu"));

  assert.equal(withCpu.cpu.result.provider, "browser-cpu");
  assert.equal(withCpu.gpu, null);
  assert.equal(canCompare(withCpu), false);

  const complete = recordGpuRun(withCpu, result("browser-webgpu"));
  assert.equal(canCompare(complete), true);
});

test("comparison rejects incorrect, mismatched, or stale results", () => {
  const initial = createExperimentSession({});
  const badGpu = { ...result("browser-webgpu"), correctness: { passed: false } };
  const incorrect = recordGpuRun(recordCpuRun(initial, result("browser-cpu")), badGpu);
  assert.equal(canCompare(incorrect), false);

  const mismatch = recordGpuRun(recordCpuRun(initial, result("browser-cpu")), result("browser-webgpu", 64, 31));
  assert.equal(canCompare(mismatch), false);

  const wrongGroup = recordGpuRun(recordCpuRun(initial, result("browser-cpu")), result("browser-webgpu", 64, 32, 16));
  assert.equal(canCompare(wrongGroup), false);

  const changed = setExperimentConfig(recordCpuRun(initial, result("browser-cpu")), { pixels: 65_536, groupSize: 16 });
  assert.equal(changed.cpu, null);
  assert.equal(changed.gpu, null);
  assert.equal(changed.stage, "configure");
});

test("stage and configuration transitions validate lesson choices", () => {
  const session = createExperimentSession({});
  assert.equal(setExperimentStage(session, "run").stage, "run");
  assert.throws(() => setExperimentStage(session, "code"), RangeError);
  assert.throws(() => setExperimentConfig(session, { pixels: 10, groupSize: 8 }), RangeError);
  assert.throws(() => setExperimentConfig(session, { pixels: 64, groupSize: 10 }), RangeError);
});
