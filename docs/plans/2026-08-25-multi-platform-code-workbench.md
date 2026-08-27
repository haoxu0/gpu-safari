# Multi-platform code workbench implementation plan

## Goal

Extend the Paint Pixels Run stage into a configurable, platform-neutral workbench that executes CPU JavaScript and browser WebGPU while teaching equivalent CUDA, Triton, Metal, and HIP syntax honestly.

## Architecture

Keep experiment state, presentation state, code generation, and HTML rendering separate. A new platform catalog generates configuration-aware source and phase mappings; a pure code-selection model converts the current platform, phase, worker, and configuration into a renderable selection. The Run workbench consumes that model while existing CPU/WebGPU runners remain the only browser execution paths.

## Technology

Vanilla JavaScript ES modules, HTML, CSS, Node's built-in test runner, Python layout/contract tests, and browser WebGPU/WGSL.

## Design reference

`docs/designs/2026-08-25-multi-platform-code-workbench.md`

## Global constraints

- Browser execution remains limited to CPU JavaScript and WebGPU.
- CUDA, Triton, Metal, and HIP must say **Equivalent syntax · not executed**.
- Syntax switching must not run code or modify benchmark results.
- Workload or group-size changes clear stale results; animation-speed changes do not.
- Modal remains explicitly cost-confirmed and is not used for validation.
- Code output must be escaped before insertion into HTML.
- No new runtime dependency is required.

## File map

- Create `learning-lab/src/platform-code-catalog.mjs`: platform metadata and configuration-aware host/kernel source generation.
- Create `learning-lab/tests/platform-code-catalog.test.mjs`: catalog coverage, generated values, phase mappings, and validation.
- Modify `learning-lab/src/run-workspace.mjs`: pure code selection plus syntax-tab and execution-label rendering.
- Modify `learning-lab/tests/run-workspace.test.mjs`: phase, worker, platform, label, and safe-rendering contracts.
- Modify `learning-lab/src/app.mjs`: Run-stage settings, selected syntax, animation speed, invalidation messages, and event binding.
- Modify `learning-lab/src/playback-controller.mjs` only if a runtime delay update cannot be expressed at `play()` call sites.
- Modify `learning-lab/tests/playback-controller.test.mjs` if the controller interface changes.
- Modify `learning-lab/styles.css`: stable workbench layout, settings bar, syntax tabs, execution badge, and responsive collapse.
- Modify `tests/test_learning_lab_layout.py`: semantic and responsive structure contracts.
- Modify `learning-lab/README.md`: describe the multi-platform syntax explorer and execution labels.

## Task 1: Build the platform code catalog

### Interfaces

Create:

```js
export const GPU_CODE_PLATFORMS = Object.freeze(["webgpu", "cuda", "triton", "metal", "hip"]);

export function getPlatformDefinition(platform) {
  // Returns { id, label, ecosystem, executionKind }.
}

export function generatePlatformCode({ platform, layer, pixels, groupSize }) {
  // layer is "host" or "kernel".
  // Returns a source string containing the supplied configuration.
}

export function getPlatformPhaseMapping({ platform, phase, workerId, pixels, groupSize }) {
  // Returns { layer, highlightedToken, caption }.
}
```

Validate platform, phase, layer, workload, group size, and worker ID at this boundary. Use the five GPU languages from the design. Keep templates short enough to teach, syntactically credible, and explicit about boundary masking.

### Test cycle

Add tests that initially fail because the module does not exist. Assert:

- the ordered platform list is WebGPU, CUDA, Triton, Metal, HIP;
- every definition has a stable label and `executionKind` of `browser` or `equivalent`;
- `pixels: 65536` and `groupSize: 16` appear through the idiomatic constants or launch expressions of every generated example;
- prepare, submit, work, readback, and complete return a valid code layer and a token present in generated source;
- worker 10 maps to pixel 10 in each platform caption;
- invalid platforms, phases, group sizes, pixel counts, and worker IDs throw clear range or type errors.

Run:

```bash
node --test learning-lab/tests/platform-code-catalog.test.mjs
```

Commit boundary: `Model equivalent GPU syntax`.

## Task 2: Generalize code selection and rendering

### Interfaces

Replace the WebGPU-only selector with:

```js
export function buildCodePhaseSelection({
  executionBackend,
  codePlatform,
  phase,
  workerId,
  pixels,
  groupSize,
  gpuHasRun,
}) {
  // Returns { source, highlightedToken, caption, layer,
  //           platformLabel, executionLabel, executionKind }.
}
```

CPU execution returns the existing JavaScript selection and does not render GPU syntax tabs. GPU selection delegates source and phase mapping to the catalog. WebGPU returns **Running in this browser** only when a WebGPU result exists; otherwise it says **Browser execution target**. Other GPU platforms always return **Equivalent syntax · not executed**.

Extend `renderRunWorkspace()` with `codePlatform` and `platforms`. Render an accessible `tablist`, one selected `tab`, and one `tabpanel`. Tabs use `data-code-platform` and never use run-action attributes. Preserve code escaping, the show/hide control, dispatch facts, captions, and the visualization when code is hidden.

### Test cycle

Update the run-workspace tests first. Assert:

- CPU phase highlighting remains unchanged;
- all five GPU platforms select source containing the active configuration;
- selecting worker 10 highlights the platform-specific invocation expression;
- execution labels distinguish WebGPU from equivalent syntax;
- rendered tabs expose `role="tablist"`, `role="tab"`, `aria-selected`, and a labeled `role="tabpanel"`;
- code containing `<`, `>`, and `&` is escaped;
- switching syntax has no run-action attribute;
- hidden code still preserves the visualization.

Run:

```bash
node --test learning-lab/tests/run-workspace.test.mjs learning-lab/tests/platform-code-catalog.test.mjs
```

Commit boundary: `Add the multi-platform code explorer`.

## Task 3: Add Run-stage configuration and state transitions

### State

Add presentation-only state:

```js
codePlatform: "webgpu",
animationSpeed: "normal",
configNotice: null,
```

Use exact animation delays:

```js
const ANIMATION_DELAYS = Object.freeze({
  slow: { cpu: 60, gpu: 360 },
  normal: { cpu: 24, gpu: 180 },
  instant: { cpu: 0, gpu: 0 },
});
```

### Behavior

Move or duplicate the workload and workers-per-group controls into a compact Run settings bar while retaining the Question-stage setup. Both surfaces write through `setExperimentConfig()`.

When workload or group size changes:

1. reset playback;
2. clear dispatch replay and the visual frame;
3. rely on `setExperimentConfig()` to clear CPU/GPU results;
4. set `configNotice` to `Results cleared — run CPU and GPU again.`;
5. rerender the Run stage.

When animation speed changes, update presentation state only. Do not call `setExperimentConfig()` and do not clear results.

When CPU starts, select the JavaScript view. When GPU starts, select WebGPU. A later `data-code-platform` interaction changes only `codePlatform` and rerenders without calling either runner.

Disable execution configuration, run actions, and navigation while a real run is in flight. Keep syntax tabs and speed controls usable during illustrative playback after the measurement has completed.

Implement ArrowLeft, ArrowRight, Home, and End behavior for syntax tabs. After a keyboard selection, restore focus to the newly selected tab.

### Test cycle

Add source/contract tests that assert:

- the Run stage contains workload, group-size, and animation-speed controls;
- syntax tabs call only the code-platform state transition;
- animation speed maps to the exact CPU/GPU delays;
- workload/group changes display the rerun notice and clear replay state;
- WebGPU remains the only browser GPU runner;
- Modal still requires the existing confirmation checkbox.

Keep pure invalidation tests in `experiment-session.test.mjs`. If event behavior becomes difficult to test without a DOM, extract pure helpers into `run-workbench-state.mjs` with focused Node tests instead of adding a browser-test dependency.

Run:

```bash
node --test learning-lab/tests/*.test.mjs
python -m pytest -q tests/test_learning_lab_layout.py
```

Commit boundary: `Make the Run stage configurable`.

## Task 4: Polish responsive layout and documentation

### Presentation

Add styles for:

- `.run-settings` as a visible compact bar above run actions;
- `.syntax-tabs` with an internal horizontal scroll boundary;
- `.execution-badge` with text-visible running/equivalent state;
- the existing `.run-workspace.has-code` desktop split;
- a narrow-screen stack with visualization before code;
- a mobile code disclosure that does not remove the syntax state;
- internal code scrolling without document-level horizontal overflow.

At the mobile breakpoint, keep the three-stage progress indicator and make touch targets at least 44 CSS pixels tall. Preserve reduced-motion behavior.

Update the README to say that the lesson executes JavaScript and WebGPU locally while allowing comparison with equivalent CUDA, Triton, Metal, and HIP syntax.

### Test cycle

Update Python layout tests to assert semantic tab roles, execution-label copy, Run configuration labels, five platform names, responsive selectors, reduced-motion support, and the absence of language tabs using execution attributes.

Run:

```bash
python -m pytest -q tests/test_learning_lab_layout.py
npm test --prefix learning-lab
python -m pytest -q
node --check learning-lab/src/app.mjs
git diff --check
```

Commit boundary: `Polish the platform-neutral Run workbench`.

## Task 5: Browser validation

Serve `learning-lab/` locally and verify the following without launching Modal:

1. Configure 64 pixels and 8 workers, enter Run, and confirm the same settings are visible.
2. Run CPU and confirm JavaScript is selected and synchronized with sequential animation.
3. Run GPU and confirm WebGPU is selected, labeled as running, and synchronized with real dispatch replay.
4. Switch through CUDA, Triton, Metal, and HIP; confirm each says it was not executed and preserves phase/worker context.
5. Select a worker and confirm every language maps it to the same pixel.
6. Change only animation speed and confirm completed results remain available.
7. Change workload or group size and confirm results, dispatch facts, and Compare eligibility clear.
8. Rerun both paths and confirm the comparison chart uses the new configuration.
9. Verify keyboard syntax navigation, code show/hide behavior, no console errors, and no horizontal overflow.
10. Repeat the layout checks at the mobile breakpoint with visualization before the collapsed code explorer.

Record only user-facing results. Do not publish browser/device identifiers, cloud run IDs, or private diagnostics.

Commit only if browser validation reveals a necessary fix; use a message describing that fix.

## Completion criteria

- Every automated verification command passes.
- Browser QA passes for desktop and mobile layouts.
- WebGPU is the only zero-install GPU execution path.
- Every equivalent syntax is clearly labeled as not executed.
- Configuration changes cannot produce stale or misleading comparisons.
- The worktree contains no unrelated changes or brainstorming artifacts.
