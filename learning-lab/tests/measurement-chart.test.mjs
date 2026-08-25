import test from "node:test";
import assert from "node:assert/strict";

import { buildMeasurementChartModel, renderMeasurementChart } from "../src/measurement-chart.mjs";

function measured(provider, value, checksum = 32, resolution = 0.1) {
  return {
    provider,
    correctness: { passed: true },
    output: { checksum },
    measurements: [{ value, unit: "ms", resolution_ms: resolution }],
  };
}

test("an unresolved CPU value becomes a hatched uncertainty band without a ratio", () => {
  const model = buildMeasurementChartModel({
    cpu: measured("browser-cpu", 0.05),
    gpu: measured("browser-webgpu", 4.1),
    summary: { winner: null, ratio: null, unresolved: ["cpu"], timerResolutionMs: 0.1 },
  });

  assert.equal(model.outputsMatch, true);
  assert.equal(model.axisMaxMs, 4.1);
  assert.deepEqual(model.rows.map(({ backend, resolved, displayValue }) => ({ backend, resolved, displayValue })), [
    { backend: "cpu", resolved: false, displayValue: "Below timer resolution" },
    { backend: "gpu", resolved: true, displayValue: "4.1000 ms" },
  ]);
  assert.equal(model.winner, null);
  assert.equal(model.ratio, null);
  const html = renderMeasurementChart(model);
  assert.match(html, /is-unresolved/);
  assert.match(html, /No reliable ratio/);
  assert.match(html, /How measured/);
});

test("resolved values share one scale and identify the observed winner", () => {
  const model = buildMeasurementChartModel({
    cpu: measured("browser-cpu", 8),
    gpu: measured("browser-webgpu", 2),
    summary: { winner: "gpu", ratio: 4, unresolved: [], timerResolutionMs: 0.1 },
  });

  assert.equal(model.axisMaxMs, 8);
  assert.deepEqual(model.rows.map(({ widthPercent }) => widthPercent), [100, 25]);
  assert.equal(model.winner, "gpu");
  assert.match(renderMeasurementChart(model), /GPU observed first · 4\.00×/);
});

test("mismatched output suppresses timing comparison", () => {
  const model = buildMeasurementChartModel({
    cpu: measured("browser-cpu", 8, 32),
    gpu: measured("browser-webgpu", 2, 31),
    summary: null,
  });

  assert.equal(model.outputsMatch, false);
  assert.deepEqual(model.rows, []);
  assert.match(renderMeasurementChart(model), /Outputs differ/);
  assert.doesNotMatch(renderMeasurementChart(model), /chart-bar/);
});
