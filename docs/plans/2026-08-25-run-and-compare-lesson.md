# Run and Compare Lesson Implementation Plan

**Goal:** Replace the four-step lesson with one three-stage experiment: configure the workload, run CPU and GPU independently with synchronized optional code, then compare validated results in a truthful measurement chart.

**Architecture:** Keep WebGPU execution, CPU measurement, and dispatch replay as independent modules. Add a small immutable experiment state model, a chart model/renderer, and a run-workspace renderer so `app.mjs` coordinates rather than owning every rule. Existing provider safety boundaries remain unchanged.

**Tech stack:** Browser JavaScript modules, SVG/HTML/CSS, WebGPU/WGSL, Node test runner, Python layout contracts.

**Design:** `docs/designs/2026-08-25-run-and-compare-lesson.md`

## Global constraints

- WebGPU execution and output validation are real; animation timing remains explicitly illustrative.
- CPU timing measures the JavaScript loop. GPU timing measures browser submission through readback.
- Comparison is unavailable until CPU and GPU succeed for the same configuration.
- Changing pixels or workgroup size invalidates both prior results.
- Large dispatches render at most 64 representative workers while displaying complete X × Y dispatch facts.
- Code is optional, synchronized with the selected run, and collapsed by default on narrow screens.
- Modal remains opt-in and requires explicit billable-run confirmation.
- No private provider identifiers or run URLs may appear in code, tests, documentation, or UI.

---

## Task 1: Model the three-stage experiment

**Files**

- Create `learning-lab/src/experiment-session.mjs`
- Create `learning-lab/tests/experiment-session.test.mjs`
- Modify `learning-lab/src/lesson-model.mjs`
- Modify `learning-lab/tests/lesson-model.test.mjs`

**Interface**

```js
createExperimentSession({ pixels = 64, groupSize = 8 })
setExperimentConfig(session, { pixels, groupSize })
recordCpuRun(session, cpuResult)
recordGpuRun(session, gpuResult)
setExperimentStage(session, "configure" | "run" | "compare")
canCompare(session)
```

The session contains `config`, `stage`, `prediction`, `cpu`, and `gpu`. A stored run includes the exact configuration fingerprint that produced it.

**Steps**

1. Write failing tests proving a new session starts at `configure`, CPU and GPU can finish independently, comparison requires two correct matching-configuration results, and a configuration change clears both results.
2. Run `node --test learning-lab/tests/experiment-session.test.mjs`; verify failures are caused by the missing module and behavior.
3. Implement immutable session transitions and configuration fingerprints. Reject unknown stages, unsupported pixel counts, and workgroup sizes outside the lesson options.
4. Replace the old four-step constants in `lesson-model.mjs` with `configure`, `run`, and `compare`, preserving immutable forward/back navigation.
5. Run the two focused test files and then `npm --prefix learning-lab test`.
6. Commit the state model and tests.

## Task 2: Build the measurement-range chart

**Files**

- Create `learning-lab/src/measurement-chart.mjs`
- Create `learning-lab/tests/measurement-chart.test.mjs`
- Modify `learning-lab/styles.css`

**Interface**

```js
buildMeasurementChartModel({ cpu, gpu, summary })
renderMeasurementChart(model)
```

The model returns two rows with `label`, `valueMs`, `resolved`, `widthPercent`, and `displayValue`, plus `outputsMatch`, `winner`, `ratio`, `axisMaxMs`, and an accessible summary.

**Steps**

1. Write failing tests for three literal cases:
   - CPU below timer resolution and GPU at `4.1 ms`: CPU is unresolved, no winner/ratio, hatched band, common axis.
   - CPU at `8 ms` and GPU at `2 ms`: both resolved, GPU wins, ratio is `4`, bars share the `8 ms` scale.
   - Mismatched output: render a prominent validation failure and suppress the comparison.
2. Run `node --test learning-lab/tests/measurement-chart.test.mjs` and verify the expected failures.
3. Implement the pure model without recomputing timing validity differently from `buildRaceSummary`; consume its winner, ratio, and timer resolution.
4. Render semantic HTML with an `aria-label` per row, visible numeric labels, a patterned unresolved bar, an output-validation badge, and a collapsed `How measured` disclosure.
5. Add responsive chart styles. Use color plus pattern/text so meaning does not depend on color.
6. Run the focused tests and full JavaScript suite.
7. Commit the chart component.

## Task 3: Synchronize run visualization and optional code

**Files**

- Create `learning-lab/src/run-workspace.mjs`
- Create `learning-lab/tests/run-workspace.test.mjs`
- Modify `learning-lab/src/lesson-content.mjs`
- Modify `learning-lab/tests/lesson-content.test.mjs`
- Modify `learning-lab/src/processing-scene.mjs`
- Modify `learning-lab/tests/processing-scene.test.mjs`
- Modify `learning-lab/styles.css`

**Interface**

```js
buildCodePhaseSelection({ backend: "cpu" | "webgpu", phase, workerId })
renderRunWorkspace({ backend, frame, codeVisible, codeSelection, dispatchFacts })
```

`buildCodePhaseSelection` returns a code sample, highlighted token, and concise caption. CPU phases map to loop initialization/work/completion. WebGPU phases map to command preparation, queue submission, shader invocation, and readback.

**Steps**

1. Write failing tests proving CPU and WebGPU phases highlight different real code tokens, a selected worker highlights the shader invocation, and code can be omitted without removing the visualization.
2. Run the focused tests and verify they fail for missing interfaces.
3. Add a concise CPU sample alongside the existing WebGPU sample and implement phase-to-token mapping.
4. Render the desktop visualization/code split with `Show code` and `Hide code`; render the same code panel below the visualization when narrow-screen CSS applies.
5. Move Metal, CUDA, and Triton examples into an `Other platforms` disclosure without changing their conceptual worker mapping.
6. Add a presentation mode to the processing scene that labels CPU sequential animation and real WebGPU dispatch replay distinctly.
7. Run focused and full JavaScript tests.
8. Commit the synchronized workspace.

## Task 4: Connect independent CPU and GPU runs

**Files**

- Modify `learning-lab/src/app.mjs`
- Modify `learning-lab/src/race-runner.mjs`
- Modify `learning-lab/src/webgpu-runner.mjs`
- Modify `learning-lab/src/dispatch-replay.mjs`
- Modify `learning-lab/tests/race-runner.test.mjs`
- Modify `learning-lab/tests/webgpu-runner.test.mjs`
- Modify `learning-lab/tests/dispatch-replay.test.mjs`
- Modify `tests/test_learning_lab_layout.py`

**Behavior**

- `Run on CPU` calls `runCpuPaint`, stores its measured result, selects CPU code, and plays sequential representative frames.
- `Run on GPU` calls `runWebGpuPaint`, validates output, stores real dispatch metadata, selects WebGPU code, and replays Prepare → Submit → visible workgroup waves → Readback.
- `Compare results` is disabled until both runs are correct and share the current configuration.
- Reduced-motion mode advances representative states without timed animation.

**Steps**

1. Write failing tests for independent run state, compare gating, retry after one failure, and invalidation after configuration changes.
2. Add a failing dispatch-replay test proving the full dispatch metadata survives while only 64 workers are rendered.
3. Refactor `app.mjs` around the experiment session. Remove the old See/Experiment/Race/Code markup and render `configure`, `run`, or `compare` from session state.
4. Bind separate CPU and GPU buttons. Do not run either backend automatically and do not combine them into one hidden action.
5. Keep provider errors generic in the browser. Preserve explicit Modal confirmation and companion-server behavior under `Other hardware`.
6. On successful runs, feed results into the chart model. On mismatch, block comparison and show the validation error.
7. Update layout contracts to assert the three stages, separate run buttons, optional code control, compare gating, truthful replay label, and Modal confirmation.
8. Run all JavaScript and Python tests.
9. Commit the integrated lesson flow.

## Task 5: Simplify presentation and verify in a real browser

**Files**

- Modify `learning-lab/styles.css`
- Modify `learning-lab/learn/paint-pixels/index.html`
- Modify `learning-lab/README.md`
- Modify `README.md`

**Steps**

1. Remove obsolete four-step and paragraph-heavy result styles after confirming no remaining selector uses them.
2. Keep each stage above the fold where practical: configuration card, run workspace, or comparison chart—not all three simultaneously.
3. Update learner-facing documentation to describe Configure → Run → Compare and distinguish visualization from execution.
4. Run `npm --prefix learning-lab test`, `python -m pytest -q`, JavaScript syntax checks, and `git diff --check`.
5. Serve `learning-lab` locally and verify in the browser:
   - configuration changes invalidate results;
   - CPU and GPU run separately;
   - real WebGPU output matches CPU output;
   - code follows the selected backend and phase;
   - the unresolved CPU case produces a hatched band and no ratio;
   - a large workload shows the real X × Y grid and only 64 representative workers;
   - reduced-motion behavior is usable;
   - a 390 px viewport has no horizontal overflow;
   - no console warnings or errors appear.
6. Scan tracked content for private provider identifiers and workflow artifacts.
7. Commit documentation and presentation cleanup.
