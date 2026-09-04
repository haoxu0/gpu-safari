# VGPU Run Visualization

## Purpose

GPU Safari should make parallel execution understandable through direct manipulation and spatial animation. The Paint Pixels lesson will introduce a 2.5D dispatch world that connects a real browser GPU run to an explicitly illustrative view of GPU work.

The visualization must help a beginner answer four questions without relying on explanatory prose:

1. What work did the CPU or GPU receive?
2. How was that work divided?
3. Which worker produced which output?
4. Which parts of the display are observed and which are illustrative?

## Scope

The first release changes the Run stage of Paint Pixels. It adds:

- a 2.5D command, dispatch, workgroup, worker, and output scene;
- CPU and GPU playback on the same conceptual timeline;
- play, pause, restart, and timeline scrubbing;
- selectable workgroups with worker and pixel ranges;
- source highlighting connected to the selected work;
- responsive and reduced-motion presentations;
- a feature-flagged VGPU renderer with the current renderer as a temporary fallback.

The release does not add a new lesson, change measurement methodology, simulate hardware timing, execute CUDA/Triton/Metal code in the browser, or require a cloud GPU.

## Experience

### Run layout

The Run stage has three functional areas:

1. A compact configuration row for pixel count and workers per group, followed by separate CPU and GPU run actions.
2. A dominant dispatch world showing the selected execution path.
3. A code surface beside the scene on desktop and below it on narrow screens.

The existing lesson progression remains Question, Run, Compare. Syntax selection remains independent from execution configuration. CUDA, Triton, Metal, HIP, and WebGPU tabs show equivalent implementations; only supported local execution paths can run.

### Dispatch world

The scene uses depth to express hierarchy:

- a command packet represents encoding and submission;
- a dispatch plane contains raised workgroup tiles;
- an active tile reveals or emphasizes its workers;
- an output plane shows the pixels produced by those workers;
- selection visually connects one workgroup to its worker range, output range, and relevant source line.

The CPU presentation uses one moving work token and advances one pixel at a time. The GPU presentation advances workgroups in illustrative waves. Both presentations end at the same validated output.

The default camera is a shallow 2.5D angle. Mobile uses a less oblique angle to preserve readable hit targets. Paint Pixels does not use free camera controls because camera movement does not contribute to its learning goal.

### Timeline

The timeline exposes the phases Encode, Submit, Workgroups, Readback, and Result. A learner can play, pause, restart, or scrub to any phase. Scrubbing updates the command packet, active workgroups, completed output, selection detail, and source highlight from one deterministic scene state.

Measured elapsed time is not mapped to animation duration. Playback speed is pedagogical and stable. The interface labels the workgroup wave as illustrated.

## Truthfulness

The real WebGPU runner remains the source for:

- workload dimensions;
- workgroup size;
- submitted dispatch dimensions;
- active and padded workgroup counts;
- output validation;
- browser-observed elapsed time;
- device label when exposed by the browser.

The browser does not expose physical GPU scheduling. Wave order, tile elevation, command motion, and camera transitions are illustrative. The UI must distinguish these from observed facts through concise labels and accessible text, not long disclaimers.

Changing configuration invalidates previous run facts and replay state. A replay always uses the immutable configuration captured when its corresponding run began.

## Architecture

The feature is divided into four layers:

### Execution facts

The existing CPU and WebGPU runners produce validated result contracts. They do not know about VGPU or presentation state.

### Teaching timeline

A pure timeline builder transforms immutable execution facts and lesson configuration into deterministic phase frames. CPU and GPU frames share a common contract while preserving their different work progression.

### Scene model

A renderer-neutral scene projector transforms one timeline frame into a scene description containing command state, workgroup states, worker ranges, output states, selection, camera preset, and truth labels. The model contains no DOM, VGPU, or animation APIs.

### Renderers

The VGPU renderer owns GPU resources, drawing, resize behavior, picking, and disposal. An HTML accessibility layer mirrors the selected item and exposes keyboard navigation. The existing renderer remains available only as a temporary fallback while the VGPU path is validated.

The renderer is selected with `?renderer=vgpu` during rollout. Initialization or device failures fall back to the current renderer without blocking CPU or real WebGPU execution. After cross-browser and accessibility acceptance, VGPU becomes the default and the legacy renderer is removed.

## VGPU boundary

VGPU is a rendering dependency, not the lesson's execution abstraction. GPU Safari will use it to create and draw the teaching scene, while the raw WebGPU runner continues demonstrating command encoding, dispatch, and readback.

All VGPU-specific objects remain behind a small renderer interface:

```text
mount(container, initialScene)
render(scene)
resize(width, height, devicePixelRatio)
pick(x, y)
dispose()
```

The lesson controller communicates only through the scene contract. This keeps lesson logic testable without a GPU and makes the rendering dependency replaceable.

## Interaction and accessibility

- Workgroups can be selected by pointer or keyboard.
- Arrow keys move selection through the logical dispatch grid.
- Selection is mirrored in a concise HTML status region.
- Code highlighting is supplemental; the selected worker and output relationship is also available as text.
- Reduced-motion mode removes continuous movement and camera transitions while retaining stepped phase changes.
- Canvas color is never the only state cue; elevation, opacity, labels, and accessible state accompany it.
- If WebGPU or VGPU is unavailable, the lesson explains the limitation and preserves the existing non-VGPU learning path.

## Responsive behavior

Desktop places the scene and code side by side, with the scene receiving most of the width. Narrow screens stack code below the scene, reduce the camera angle, enlarge selection targets, and keep primary run actions visible without horizontal scrolling.

The scene scales its backing buffer for device pixel ratio but caps resolution to avoid excessive mobile GPU memory use. Resize preserves phase and selection.

## Error handling

- VGPU initialization failure activates the fallback renderer.
- A lost rendering device displays a compact recovery action and preserves the last scene model.
- A failed real WebGPU run does not create a replay or measured result.
- Stale results are rejected when configuration changes during execution.
- Rendering errors never trigger cloud execution or expose provider diagnostics.

## Verification

Automated tests will cover:

- deterministic CPU and GPU timeline frames;
- scene projection for every phase;
- workgroup, worker, pixel, and code selection mapping;
- observed-versus-illustrative labels;
- feature selection and initialization fallback;
- resize, reduced-motion, and cleanup behavior;
- keyboard navigation and accessible selection summaries;
- compatibility with existing execution and comparison contracts.

Browser verification will cover desktop and mobile widths, light input methods, keyboard navigation, reduced motion, VGPU failure fallback, and a real local WebGPU run. The existing JavaScript and Python suites must remain green. No billable cloud run is required.

## Rollout and completion

The initial pull request ships VGPU behind `?renderer=vgpu`. It is ready to become the default after the scene is usable on current Chromium and Safari WebGPU implementations, mobile layout is accepted, reduced-motion and keyboard paths work, and the fallback is verified.

The legacy renderer is then removed in a follow-up change. Keeping two permanent visualization implementations is explicitly out of scope.
