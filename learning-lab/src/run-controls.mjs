function statusFor({ backend, run, running, available = true }) {
  if (!available) return "WebGPU unavailable in this browser";
  if (running === backend) return `Running on ${backend === "cpu" ? "CPU" : "GPU"}…`;
  if (run) return `${backend === "cpu" ? "CPU" : "GPU"} measured ✓`;
  return "Ready to run";
}

export function renderExecutionCards({ cpuRun, gpuRun, running, gpuAvailable, codeMode }) {
  const cpuSelected = codeMode === "cpu";
  const gpuSelected = codeMode !== "cpu";
  return `<div class="run-target-grid">
    <section class="run-target-card${cpuSelected ? " is-selected" : ""} cpu-target">
      <div class="run-target-heading"><span>Sequential</span><h2>CPU</h2></div>
      <p>One loop paints one pixel after another.</p>
      <div class="run-target-actions">
        <button class="button button-quiet" type="button" data-run="cpu" ${running ? "disabled" : ""}>Run CPU</button>
        <button class="code-link" type="button" data-view-code="cpu" aria-pressed="${cpuSelected}">View code</button>
      </div>
      <strong class="target-status">${statusFor({ backend: "cpu", run: cpuRun, running })}</strong>
    </section>
    <section class="run-target-card gpu-target${gpuSelected ? " is-selected" : ""}">
      <div class="run-target-heading"><span>Parallel</span><h2>GPU</h2></div>
      <p>Many workers paint independent pixels together.</p>
      <div class="run-target-actions">
        <button class="button button-primary" type="button" data-run="webgpu" ${gpuAvailable && !running ? "" : "disabled"}>Run GPU</button>
        <button class="code-link" type="button" data-view-code="webgpu" aria-pressed="${gpuSelected}">View code</button>
      </div>
      <strong class="target-status">${statusFor({ backend: "webgpu", run: gpuRun, running, available: gpuAvailable })}</strong>
    </section>
  </div>`;
}
