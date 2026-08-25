function measurement(result) {
  const value = result?.measurements?.[0]?.value;
  if (!Number.isFinite(value) || value < 0) throw new RangeError("measurement must be a non-negative finite value");
  return value;
}

export function buildMeasurementChartModel({ cpu, gpu, summary }) {
  const outputsMatch = Boolean(
    cpu?.correctness?.passed
    && gpu?.correctness?.passed
    && cpu?.output?.checksum === gpu?.output?.checksum,
  );
  if (!outputsMatch) {
    return { outputsMatch: false, rows: [], winner: null, ratio: null, axisMaxMs: 0, timerResolutionMs: 0 };
  }
  const values = { cpu: measurement(cpu), gpu: measurement(gpu) };
  const axisMaxMs = Math.max(values.cpu, values.gpu, summary.timerResolutionMs);
  const unresolved = new Set(summary.unresolved);
  const rows = ["cpu", "gpu"].map((backend) => {
    const resolved = !unresolved.has(backend);
    return {
      backend,
      label: backend === "cpu" ? "CPU · JavaScript" : "GPU · WebGPU",
      valueMs: values[backend],
      resolved,
      widthPercent: resolved ? (values[backend] / axisMaxMs) * 100 : Math.max(3, (summary.timerResolutionMs / axisMaxMs) * 100),
      displayValue: resolved ? `${values[backend].toFixed(4)} ms` : "Below timer resolution",
    };
  });
  return {
    outputsMatch,
    rows,
    winner: summary.winner,
    ratio: summary.ratio,
    axisMaxMs,
    timerResolutionMs: summary.timerResolutionMs,
  };
}

export function renderMeasurementChart(model) {
  if (!model.outputsMatch) {
    return `<section class="measurement-chart validation-failed" aria-label="Output validation failed"><strong>Outputs differ</strong><span>Comparison is unavailable until both paths produce the same result.</span></section>`;
  }
  const verdict = model.winner
    ? `${model.winner.toUpperCase()} observed first · ${model.ratio.toFixed(2)}×`
    : "No reliable ratio";
  return `<section class="measurement-chart" aria-label="CPU and GPU measurement comparison">
    <div class="chart-validation"><span aria-hidden="true">✓</span><strong>Outputs match</strong></div>
    <div class="chart-axis" aria-hidden="true"><span>0 ms</span><span>${(model.axisMaxMs / 2).toFixed(2)} ms</span><span>${model.axisMaxMs.toFixed(2)} ms</span></div>
    <div class="chart-rows">${model.rows.map((row) => `<div class="chart-row" aria-label="${row.label}: ${row.displayValue}"><div><strong>${row.label}</strong><span>${row.displayValue}</span></div><div class="chart-track"><span class="chart-bar ${row.backend}${row.resolved ? "" : " is-unresolved"}" style="width:${row.widthPercent}%"></span></div></div>`).join("")}</div>
    <p class="chart-verdict">${verdict}</p>
    <details class="measurement-method"><summary>How measured</summary><p>CPU covers the JavaScript paint loop. GPU covers browser submission through result readback. A hatched band means the duration is at or below this browser's timer resolution.</p></details>
  </section>`;
}
