# Visual Learning Flow Implementation Plan

**Goal:** Replace the seven-screen Paint Pixels lesson with a four-step, SVG-first experience that lets beginners watch, manipulate, measure, and connect CPU/GPU processing.

**Architecture:** A pure processing model produces CPU frames and GPU phases. A focused SVG scene renders that model, while a playback controller owns animation and cancellation. The four lesson views configure the shared scene; measured CPU/WebGPU execution remains independent from the educational timeline.

**Tech stack:** Static HTML, CSS, JavaScript ES modules, inline SVG, WebGPU/WGSL, Node's test runner, and pytest layout checks.

**Design:** `docs/designs/2026-08-23-visual-learning-flow.md`

## Constraints

- The required lesson must work without an account, installation, local server, or cloud GPU.
- Concept animation is always labeled **Slowed visual · not timing**.
- Only real CPU/WebGPU execution may produce latency values.
- WebGPU timing covers browser submission through result readback.
- Cloud execution remains separate and requires its existing explicit confirmation.
- No new UI framework, SVG library, Three.js, or build system is added.
- The four steps are `see`, `experiment`, `race`, and `code`.
- Reduced-motion and keyboard users receive the complete lesson.
- No brainstorming, provider run, account, or private URL artifacts are committed.

## File structure

- Create `learning-lab/src/simulation-timeline.mjs`: validate inputs and build CPU/GPU educational frames.
- Create `learning-lab/src/processing-scene.mjs`: render the inline SVG and update visible scene state.
- Create `learning-lab/src/playback-controller.mjs`: schedule, pause, cancel, replay, and reduce animation.
- Create `learning-lab/tests/simulation-timeline.test.mjs`: cover the processing model.
- Create `learning-lab/tests/processing-scene.test.mjs`: cover semantic SVG output and scene updates.
- Create `learning-lab/tests/playback-controller.test.mjs`: cover timing-independent playback behavior.
- Modify `learning-lab/src/lesson-model.mjs`: adopt the four-step state and selected-worker state.
- Modify `learning-lab/src/lesson-content.mjs`: provide concise copy and platform code metadata.
- Modify `learning-lab/src/app.mjs`: compose the four views, scene, race, and code interaction.
- Modify `learning-lab/learn/paint-pixels/index.html`: replace the old fixed work-map panel with the shared scene host.
- Modify `learning-lab/styles.css`: style the SVG scene, four-step navigation, responsive stacking, and reduced motion.
- Modify existing JavaScript and Python tests to assert the new lesson contract.
- Modify `learning-lab/README.md` and root `README.md` only where they describe the old journey.

---

## Task 1: Processing timeline and four-step state

**Files**

- Create `learning-lab/src/simulation-timeline.mjs`
- Create `learning-lab/tests/simulation-timeline.test.mjs`
- Modify `learning-lab/src/lesson-model.mjs`
- Modify `learning-lab/tests/lesson-model.test.mjs`

**Interfaces**

- `buildProcessingTimeline({ totalPixels, groupSize }) -> { cpu, gpu }`
- CPU frame: `{ phase: "work", pixelIds: number[] }`, containing exactly one ID.
- GPU frame: `{ phase: "prepare" | "submit" | "work" | "readback", pixelIds: number[] }`.
- `createLessonState() -> { stepIndex, completed, selectedWorker }`
- `selectWorker(state, workerId, totalPixels) -> newState`

### 1. Write the failing timeline tests

Add literal expectations:

```js
test("CPU processing visits exactly one pixel per sequential frame", () => {
  const timeline = buildProcessingTimeline({ totalPixels: 8, groupSize: 4 });
  assert.deepEqual(timeline.cpu.map((frame) => frame.pixelIds), [
    [0], [1], [2], [3], [4], [5], [6], [7],
  ]);
});

test("GPU processing exposes async phases and workgroup waves", () => {
  const timeline = buildProcessingTimeline({ totalPixels: 10, groupSize: 4 });
  assert.deepEqual(timeline.gpu, [
    { phase: "prepare", pixelIds: [] },
    { phase: "submit", pixelIds: [] },
    { phase: "work", pixelIds: [0, 1, 2, 3] },
    { phase: "work", pixelIds: [4, 5, 6, 7] },
    { phase: "work", pixelIds: [8, 9] },
    { phase: "readback", pixelIds: [] },
  ]);
});
```

Add invalid-input cases for zero, negative, fractional, and non-numeric values.

Run:

```bash
node --test learning-lab/tests/simulation-timeline.test.mjs
```

Expected: failure because `simulation-timeline.mjs` or its exported function is absent.

### 2. Implement the pure timeline

Validate both arguments as positive integers. Build CPU frames with `Array.from`. Build GPU work frames by slicing literal pixel ID ranges in `groupSize` increments between prepare/submit and readback.

Run the focused test again and expect all cases to pass.

### 3. Replace the seven-step lesson state

First update `lesson-model.test.mjs` to expect:

```js
assert.deepEqual(LESSON_STEPS, ["see", "experiment", "race", "code"]);
assert.deepEqual(createLessonState(), {
  stepIndex: 0,
  completed: [],
  selectedWorker: null,
});
```

Add tests that `selectWorker(state, 7, 64)` returns a new state with worker `7`, and that `-1`, `64`, or a fractional ID throws `RangeError`.

Remove prediction gating and prediction state. Preserve immutable advance/retreat behavior with the new four-step list.

Run:

```bash
node --test learning-lab/tests/lesson-model.test.mjs learning-lab/tests/simulation-timeline.test.mjs
```

Expected: pass.

### 4. Commit the model

```bash
git add learning-lab/src/simulation-timeline.mjs learning-lab/src/lesson-model.mjs learning-lab/tests/simulation-timeline.test.mjs learning-lab/tests/lesson-model.test.mjs
git commit -S -m "Build the visual processing model"
```

---

## Task 2: Semantic SVG processing scene

**Files**

- Create `learning-lab/src/processing-scene.mjs`
- Create `learning-lab/tests/processing-scene.test.mjs`
- Modify `learning-lab/learn/paint-pixels/index.html`
- Modify `learning-lab/styles.css`

**Interfaces**

- `renderProcessingScene({ totalPixels, groupSize, selectedWorker, phase }) -> string`
- `sceneFrameState({ cpuPainted, gpuPainted, phase, selectedWorker }) -> object`
- Required scene hooks: `[data-cpu-job]`, `[data-gpu-worker]`, `[data-phase]`, and `[data-scene-status]`.

### 1. Write failing semantic-render tests

Test real HTML returned by the renderer rather than private helper calls:

```js
test("the scene distinguishes sequential and asynchronous processing", () => {
  const html = renderProcessingScene({
    totalPixels: 8,
    groupSize: 4,
    selectedWorker: null,
    phase: "ready",
  });
  assert.match(html, /CPU · sequential/);
  assert.match(html, /GPU · asynchronous/);
  assert.match(html, /Slowed visual · not timing/);
  assert.equal((html.match(/data-cpu-job=/g) ?? []).length, 8);
  assert.equal((html.match(/data-gpu-worker=/g) ?? []).length, 8);
});
```

Add tests that the scene contains prepare, submit, work, and readback phase controls; exposes accessible labels for worker 3 and pixel 3; and marks overflow workers when `totalPixels: 10, groupSize: 4` launches 12 workers.

Run:

```bash
node --test learning-lab/tests/processing-scene.test.mjs
```

Expected: module-not-found failure.

### 2. Implement the scene renderer

Render one responsive inline `<svg>` with:

- a CPU worker and sequential job queue;
- a GPU prepare → submit → workgroups → readback path;
- layered workgroup geometry using SVG paths and rectangles;
- focusable worker groups with `role="button"`, `tabindex="0"`, and descriptive `aria-label` values;
- selected, painted, active, and masked classes derived solely from arguments;
- a concise status node outside the SVG for screen-reader phase announcements.

Do not embed animation timers, measured values, provider details, or platform-specific scheduler claims in this module.

Run the focused tests and expect them to pass.

### 3. Replace the old fixed simulation panel host

Update the lesson HTML so it contains:

```html
<section id="processing-panel" class="processing-panel" aria-labelledby="processing-heading">
  <div id="processing-scene"></div>
  <p id="processing-status" class="sr-only" aria-live="polite"></p>
</section>
```

Remove the old permanently coupled `pixel-grid`, `simulation-status`, and `thread-inspector` structure after its behavior has moved into the scene.

Add scene styling without fixed pixel widths. At `max-width: 760px`, stack processing lanes vertically. Preserve visible focus, forced scaling inside the card, and no page-level horizontal scrolling.

Update `tests/test_learning_lab_layout.py` first to require the new host and semantic scene hooks, then run:

```bash
python -m pytest tests/test_learning_lab_layout.py -q
node --test learning-lab/tests/processing-scene.test.mjs
```

Expected: pass.

### 4. Commit the SVG scene

```bash
git add learning-lab/src/processing-scene.mjs learning-lab/tests/processing-scene.test.mjs learning-lab/learn/paint-pixels/index.html learning-lab/styles.css tests/test_learning_lab_layout.py
git commit -S -m "Add the interactive processing scene"
```

---

## Task 3: Playback plus See and Experiment

**Files**

- Create `learning-lab/src/playback-controller.mjs`
- Create `learning-lab/tests/playback-controller.test.mjs`
- Modify `learning-lab/src/app.mjs`
- Modify `learning-lab/src/lesson-content.mjs`
- Modify `learning-lab/tests/lesson-content.test.mjs`
- Modify `learning-lab/styles.css`

**Interfaces**

- `createPlaybackController({ schedule, cancel, onFrame })`
- Controller methods: `play(frames, delayMs)`, `pause()`, `reset()`, and `isRunning()`.
- `getLessonCopy(step)` supports exactly `see`, `experiment`, `race`, and `code`.

### 1. Write failing playback tests with a deterministic scheduler

Use a small test scheduler that stores callbacks and IDs. Assert consumer-visible frame order and cancellation:

```js
test("reset cancels pending frames and returns playback to idle", () => {
  const seen = [];
  const scheduler = createTestScheduler();
  const controller = createPlaybackController({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onFrame: (frame) => seen.push(frame.phase),
  });
  controller.play([{ phase: "prepare" }, { phase: "submit" }], 100);
  controller.reset();
  scheduler.flush();
  assert.deepEqual(seen, []);
  assert.equal(controller.isRunning(), false);
});
```

Add tests for frame order, pause preserving the current frame, replay starting from frame zero, and zero-delay reduced-motion playback.

Run the focused test and expect module-not-found failure.

### 2. Implement the playback controller

The controller owns scheduled IDs and an integer generation token. Each `play` cancels old IDs before scheduling new ones. Callbacks ignore stale generations. `pause` cancels future frames without clearing the last rendered frame; `reset` cancels and returns to idle.

Run the playback tests and expect pass.

### 3. Rebuild the first two lesson views

Update content tests first so only the four new steps require concise titles. Use:

```js
const LESSON_COPY = {
  see: { eyebrow: "See the processing", title: "One worker or many?" },
  experiment: { eyebrow: "Change the shape", title: "How many workers launch together?" },
  race: { eyebrow: "Measure the browser", title: "Run the same jobs for real" },
  code: { eyebrow: "Connect the model", title: "Touch a worker. See its code." },
};
```

In `app.mjs`, configure the shared scene as follows:

- See: play CPU sequential frames, then GPU prepare/submit/work/readback frames.
- Experiment: expose group sizes `4`, `8`, `16`, and `32`; rebuild the timeline and scene immediately after selection.
- Preserve the selected worker across replay and group-size changes when it remains active.
- Cancel playback before rendering another step.
- When reduced motion is active, show phase snapshots and allow Next Phase rather than scheduling travel animation.

Delete the separate Story, Predict, Simulate, Explain, and Challenge markup and their event bindings. Move useful concepts into the scene labels or on-demand worker inspection.

### 4. Verify See and Experiment

Run:

```bash
npm --prefix learning-lab test
python -m pytest tests/test_learning_lab_layout.py -q
```

Expected: pass with no old seven-step assertions.

Manually verify that replay cannot leave old timers painting a later step and that group size 32 still shows all 64 active jobs.

### 5. Commit playback and the first two steps

```bash
git add learning-lab/src/playback-controller.mjs learning-lab/tests/playback-controller.test.mjs learning-lab/src/app.mjs learning-lab/src/lesson-content.mjs learning-lab/tests/lesson-content.test.mjs learning-lab/styles.css tests/test_learning_lab_layout.py
git commit -S -m "Build the See and Experiment steps"
```

---

## Task 4: Measured race in the shared visual language

**Files**

- Modify `learning-lab/src/app.mjs`
- Modify `learning-lab/src/race-runner.mjs`
- Modify `learning-lab/tests/race-runner.test.mjs`
- Modify `learning-lab/styles.css`
- Modify `tests/test_learning_lab_layout.py`

**Interfaces**

- Preserve `runCpuPaint({ pixels, now })`.
- Preserve `buildRaceSummary({ cpu, gpu, timerResolutionMs })`.
- Add `buildExecutionTrace({ kind, pixels, observedMs, comparable }) -> trace segment data` only if rendering cannot remain local to `app.mjs`.

### 1. Write failing race-view contract tests

Extend the existing race tests to ensure the summary still returns null winner/ratio when either path is at or below timer resolution and rejects mismatched or invalid outputs before comparison.

Update the layout test to require visible labels for:

- `CPU · JavaScript`;
- `GPU · WebGPU`;
- `Outputs match`;
- `submission through result readback`;
- no claim that animation duration is measured execution.

Run the focused JavaScript and Python tests and confirm the new view assertions fail before changing production markup.

### 2. Integrate real execution traces

The Race view reuses the visual colors and job geometry but does not replay the educational timeline as if it were telemetry. While running, display neutral busy traces. After both paths finish:

- show exact observed times;
- show checksum validation;
- render comparison lengths only when `buildRaceSummary` marks the values comparable;
- use neutral equal-length traces and **At or below timer resolution** otherwise;
- display one concise insight from the existing summary.

Keep workload choices `64`, `65_536`, and `1_048_576`. Keep browser WebGPU capability detection and the optional Apple/Modal cards below the primary local race. Do not launch Modal during verification.

### 3. Verify the measured path

Run:

```bash
node --test learning-lab/tests/race-runner.test.mjs learning-lab/tests/webgpu-runner.test.mjs
python -m pytest tests/test_learning_lab_layout.py -q
```

Expected: pass.

In a WebGPU-capable browser, run all three workloads and confirm output validation, generic errors, and truthful timer-resolution behavior. Record no provider run URL or account identifier.

### 4. Commit the Race step

```bash
git add learning-lab/src/app.mjs learning-lab/src/race-runner.mjs learning-lab/tests/race-runner.test.mjs learning-lab/styles.css tests/test_learning_lab_layout.py
git commit -S -m "Integrate the measured CPU GPU race"
```

---

## Task 5: Worker-to-code connection, accessibility, and documentation

**Files**

- Modify `learning-lab/src/lesson-content.mjs`
- Modify `learning-lab/src/app.mjs`
- Modify `learning-lab/src/processing-scene.mjs`
- Modify `learning-lab/styles.css`
- Modify JavaScript and Python learning-lab tests
- Modify `learning-lab/README.md`
- Modify `README.md`

**Interfaces**

- `getCodeSelection(platform, workerId) -> { source, highlightedToken, caption }`
- Supported platform IDs: `webgpu`, `metal`, `triton`, and `cuda`.
- The selected worker ID remains the same when switching platforms.

### 1. Write failing code-selection tests

Add hand-derived expectations for worker 10:

```js
test("platform code keeps one conceptual worker selected", () => {
  const webgpu = getCodeSelection("webgpu", 10);
  const cuda = getCodeSelection("cuda", 10);
  assert.match(webgpu.highlightedToken, /global_invocation_id/);
  assert.match(cuda.highlightedToken, /blockIdx\.x.*threadIdx\.x/);
  assert.match(webgpu.caption, /worker 10/i);
  assert.match(cuda.caption, /worker 10/i);
});
```

Add Metal and Triton cases. Test unknown platforms and invalid worker IDs. Ensure Triton copy says one program handles vector lanes rather than equating a program with one CUDA thread.

Run the focused content test and confirm failure because `getCodeSelection` does not exist.

### 2. Implement linked worker and code selection

Add a platform metadata table to `lesson-content.mjs`. Return the complete sample plus the token or line to highlight and a platform-accurate caption.

In the Code view:

- selecting or keyboard-activating a GPU worker updates `selectedWorker`;
- the same worker remains highlighted when tabs change;
- the relevant code expression receives `<mark>` styling;
- the selected worker and pixel receive matching visual emphasis;
- one short caption explains the platform's grouping unit.

Avoid a fifth Python or PyTorch tab in this step because the purpose is explicit GPU indexing. Higher-level APIs remain available elsewhere in the repository.

### 3. Complete accessibility and responsive verification

Update tests before production changes to require:

- four progress markers;
- focusable SVG worker controls;
- a concise live phase announcement;
- keyboard activation with Enter and Space;
- reduced-motion snapshot controls;
- vertical lane stacking at `max-width: 760px`;
- no hover-only instruction or meaning.

Implement missing CSS and event behavior, then run:

```bash
npm --prefix learning-lab test
python -m pytest -q
node --check learning-lab/src/app.mjs
node --check learning-lab/src/processing-scene.mjs
node --check learning-lab/src/playback-controller.mjs
```

Expected: every command exits zero.

Manually verify desktop and 390 × 844 layouts, keyboard-only navigation, reduced motion, WebGPU unavailable behavior, and a successful real WebGPU race. Confirm no horizontal page overflow and no console warnings or errors.

### 4. Update learner-facing documentation

Replace references to the seven-stage journey with:

> Watch processing, reshape the workers, measure the browser, and connect one worker to real GPU code.

Document that the first two steps are slowed SVG explanations and the Race step performs real browser CPU/WebGPU work. Keep local Apple and explicitly confirmed cloud options as advanced paths.

### 5. Final privacy and repository checks

Run:

```bash
git diff --check
git status --short
rg -n "modal\.run|ap-[A-Za-z0-9]|workspace.*id" README.md learning-lab docs/designs docs/plans
```

Expected: clean diff check and no private provider identifiers.

### 6. Commit the completed lesson redesign

```bash
git add README.md learning-lab docs/designs/2026-08-23-visual-learning-flow.md docs/plans/2026-08-23-visual-learning-flow.md tests
git commit -S -m "Complete the visual-first GPU lesson"
```

Do not push or open a pull request until the user explicitly requests those actions.
