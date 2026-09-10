import { buildReductionComparison, reductionValues } from "./reduction-model.mjs";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function reductionSceneSummary(frame) {
  if (frame.kind === "cpu") {
    if (frame.done) return `CPU finished with a sum of ${frame.sum}.`;
    return frame.step === 0 ? "CPU is ready to add one number at a time." : `CPU step ${frame.step} has accumulated ${frame.sum}.`;
  }
  if (frame.done) return `GPU reduction finished with a sum of ${frame.values[0]}.`;
  if (frame.round === 0) return `GPU is ready with ${frame.active.filter(Boolean).length} active values.`;
  return `GPU round ${frame.round} combines ${frame.pairs.length} pairs at the same time.`;
}

function question(state) {
  const depth = buildReductionComparison(reductionValues(state.count), state.groupSize).gpuRounds;
  const guesses = [1, depth, state.count - 1];
  const countOptions = [8, 16, 32].map((value) => `<option ${value === state.count ? "selected" : ""}>${value}</option>`).join("");
  const groupOptions = [4, 8, 16].map((value) => `<option ${value === state.groupSize ? "selected" : ""}>${value}</option>`).join("");
  const predictionButtons = guesses.map((value) => `<button class="button button-quiet ${state.prediction === String(value) ? "is-selected" : ""}" type="button" data-reduction-prediction="${value}" aria-pressed="${state.prediction === String(value)}">${value} round${value === 1 ? "" : "s"}</button>`).join("");
  const numbers = reductionValues(state.count).map((value) => `<span>${value}</span>`).join("");
  return `<section class="reduction-question">
    <p class="eyebrow">THE PUZZLE</p><h1>How many rounds does a GPU need?</h1>
    <p class="lede">Add ${state.count} numbers. One CPU accumulator walks across them; GPU workers combine pairs together.</p>
    <div class="reduction-config"><label>Numbers<select data-reduction-count>${countOptions}</select></label><label>Workers per group<select data-reduction-group>${groupOptions}</select></label></div>
    <fieldset class="prediction"><legend>Make a guess</legend>${predictionButtons}</fieldset>
    <div class="number-strip" aria-label="${state.count} input numbers">${numbers}</div>
  </section>`;
}

function run(state) {
  const cpuSelected = state.selectedPath === "cpu";
  const gpuSelected = state.selectedPath === "gpu";
  return `<section class="reduction-run">
    <p class="reduction-config-badge">${state.count} values · ${state.groupSize} workers/group</p>
    <div class="reduction-run-cards">
      <article class="reduction-run-card cpu ${cpuSelected ? "is-selected" : ""}"><span>SEQUENTIAL</span><h2>CPU</h2><p>One accumulator, one addition per step.</p><button class="button button-quiet" type="button" data-reduction-run="cpu">Run CPU</button><small data-reduction-path-status="cpu">CPU ${state.viewed.cpu ? "viewed" : "ready"}</small></article>
      <article class="reduction-run-card gpu ${gpuSelected ? "is-selected" : ""}"><span>PARALLEL</span><h2>GPU</h2><p>Every active pair combines in the same round.</p><button class="button button-primary" type="button" data-reduction-run="gpu">Run GPU</button><small data-reduction-path-status="gpu">GPU ${state.viewed.gpu ? "viewed" : "ready"}</small></article>
    </div>
    <div class="reduction-stage"><canvas data-reduction-canvas role="img" aria-label="Animated parallel reduction tree">Animated parallel reduction tree.</canvas><p class="reduction-model-label">This is a visual teaching model · not a hardware benchmark</p><div class="reduction-playback"><button class="button button-quiet" type="button" data-reduction-play="play">${state.timeline.running ? "Pause" : "Play"}</button><button class="button button-quiet" type="button" data-reduction-play="restart">Restart</button><input type="range" min="0" max="${Math.max(0, state.timeline.count - 1)}" value="${state.timeline.index}" data-reduction-seek aria-label="Reduction timeline"></div><p class="sr-only" data-reduction-status aria-live="polite">${escapeHtml(reductionSceneSummary(state.frame))}</p></div>
    <button class="code-link" type="button" data-reduction-code aria-expanded="${state.codeVisible}">${state.codeVisible ? "Hide code" : "View code"}</button>${state.codeVisible ? `<div data-reduction-code-panel></div>` : ""}
  </section>`;
}

function compare(state) {
  const facts = buildReductionComparison(reductionValues(state.count), state.groupSize);
  return `<section class="reduction-compare"><div class="match-pill">✓ Outputs match · sum ${facts.sum}</div><h1>Same work. Different depth.</h1><div class="depth-chart" role="img" aria-label="CPU uses ${facts.cpuAdditions} sequential additions while GPU uses ${facts.gpuRounds} parallel rounds"><div><strong>CPU</strong><span class="depth-track cpu" style="--depth:${facts.cpuAdditions}"></span><b>${facts.cpuAdditions} sequential additions</b></div><div><strong>GPU</strong><span class="depth-track gpu" style="--depth:${facts.gpuRounds}"></span><b>${facts.gpuRounds} parallel rounds</b></div></div><p class="lede">Both perform ${facts.operationCount} additions. Parallel reduction shortens the chain by letting independent pairs work together.</p></section>`;
}

export function renderReductionStep(state) {
  if (state.step === "question") return question(state);
  if (state.step === "run") return run(state);
  if (state.step === "compare") return compare(state);
  throw new RangeError(`Unknown reduction step: ${state.step}`);
}
