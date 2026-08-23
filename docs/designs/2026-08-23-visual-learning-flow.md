# Visual Learning Flow

## Purpose

The first GPU Safari lesson should teach through interaction and motion rather than long explanations. A beginner should be able to see how CPU and GPU processing differ, change the shape of the work, measure a real browser run, and connect the picture to platform code.

This design replaces the current seven-step lesson with one four-step visual journey:

1. **See** — watch the same jobs move through CPU and GPU processing paths.
2. **Experiment** — change the worker-group size and observe the work reorganize.
3. **Race** — run equivalent JavaScript and WebGPU operations and inspect measured results.
4. **Code** — select a worker and trace it into WebGPU, Metal, Triton, or CUDA indexing.

The progression is **watch → manipulate → measure → connect**.

## Learning contract

The lesson must communicate these ideas without requiring a paragraph to carry the main explanation:

- a CPU can process this example sequentially, one item after another;
- GPU work is prepared and submitted before many workers process independent items;
- GPU submission is asynchronous from the CPU's perspective;
- work is organized into groups or blocks rather than launched as an unstructured crowd;
- results may need to be read back before the browser can use them;
- parallel execution does not guarantee a faster end-to-end result for a small workload;
- Metal, WebGPU, Triton, and CUDA use different vocabulary for related indexing problems.

The diagrams teach a portable model, not a literal representation of every GPU scheduler. Labels must distinguish simplified visualization from measured execution.

## Visual language

The lesson uses inline SVG as its primary rendering surface. SVG provides crisp geometry, responsive scaling, keyboard-accessible interactive elements, and deterministic animation without introducing a framework or 3D engine.

The visual system contains:

- blue CPU elements;
- green GPU elements;
- square jobs or pixels;
- arrows for ownership and data movement;
- workgroups rendered as slightly layered, dimensional tiles;
- a command path containing prepare, submit, work, and readback phases;
- glow, depth, and restrained perspective for a 2.5D appearance;
- hover, focus, and selection links between workers, pixels, phases, and code.

True WebGL or Three.js rendering is outside this iteration. It should be introduced only for a future concept that materially benefits from spatial navigation, such as memory hierarchy, tensor layouts, or GPU topology.

## Step 1: See

The first screen presents two processing lanes within one scene.

The CPU lane contains one visible worker and a queue of jobs. Playback advances the worker through one job at a time.

The GPU lane shows four phases:

1. the CPU prepares commands;
2. the CPU submits the command buffer;
3. the CPU becomes available while GPU workgroups process jobs in parallel waves;
4. the result returns through readback.

The two lanes animate at an intentionally slowed educational speed. A persistent **Slowed visual · not timing** label prevents the animation from being interpreted as a benchmark.

The scene carries the explanation. Supporting text is limited to a short title, one sentence of context, inline phase labels, and an optional inspection hint. Selecting or focusing a worker reveals detail on demand.

## Step 2: Experiment

The same GPU scene becomes adjustable rather than being replaced by a new diagram. The learner changes workers per wave and immediately sees:

- the number of workgroups;
- the number of visual waves;
- active workers;
- overflow workers stopped by the boundary mask;
- the mapping from worker index to pixel.

Controls use a small set of valid group sizes. The conceptual visualization may slow or pause for inspection, but it does not display fabricated latency.

## Step 3: Race

The scene condenses into two live execution traces:

- **CPU · JavaScript** for the sequential float32 paint loop;
- **GPU · WebGPU** for command submission through result readback.

The existing workload choices remain available. Both paths independently validate their outputs, and the interface confirms whether their checksums match.

Observed times are shown only after real execution. Comparison bars and winner language appear only when both measurements exceed the observed browser timer resolution. The interface explains results through the execution trace rather than claiming that a GPU always wins.

The measured race and the slowed conceptual animation remain separate data sources even though they share a visual vocabulary.

## Step 4: Code

The learner selects a worker in the scene. The corresponding pixel and indexing expression are highlighted together.

Tabs switch among WebGPU, Metal, Triton, and CUDA while preserving the selected conceptual job. Each tab identifies the platform's actual unit of organization:

- WebGPU workgroups and invocations;
- Metal threadgroups and threads;
- Triton programs and vector lanes;
- CUDA blocks and threads.

Only the smallest relevant code region is shown initially. Additional implementation detail can expand on demand.

## Interaction and state

The lesson has one shared state model containing:

- current step;
- playback state and current processing phase;
- selected worker or pixel;
- group size;
- race workload;
- execution capability and result;
- selected code platform.

A pure timeline builder converts pixel count and group size into CPU sequential frames and GPU phase frames. Rendering and timing consume this model rather than duplicating scheduling logic in DOM callbacks.

Playback supports pause, replay, and reset. Navigating between steps cancels pending animation work. Reduced-motion mode renders meaningful phase snapshots without requiring animated transitions.

## Components

The implementation separates four responsibilities:

- **Processing model** — validates inputs and builds CPU and GPU frames.
- **SVG scene** — renders lanes, jobs, workgroups, arrows, selection, and phase state.
- **Playback controller** — advances frames and handles cancellation and reduced motion.
- **Lesson views** — configure the shared scene for See, Experiment, Race, and Code.

The existing WebGPU runner and CPU/GPU race summary remain independent from the conceptual processing model.

## Accessibility and responsive behavior

Every selectable SVG object has a keyboard-focusable equivalent and an accessible name. Color is reinforced by labels, shape, and position. Phase changes update a concise live status without announcing every animated pixel.

At phone widths, the CPU and GPU lanes stack vertically while preserving their processing order. Code moves below the selected worker map. The scene scales without horizontal page scrolling.

When reduced motion is requested, playback advances through a small number of phase snapshots and avoids glow or travel animations. The learning sequence remains complete without motion or hover.

## Failure behavior

- Unsupported WebGPU affects only the measured race; conceptual See and Experiment steps continue to work.
- A failed browser run preserves the learner's configuration and offers a retry.
- Output mismatch is shown as a correctness failure rather than a timing comparison.
- Animation cancellation leaves the scene in a valid reset state.
- No cloud execution is started by this lesson flow. Existing cloud controls retain their separate confirmation requirement.

## Testing

Automated tests cover:

- CPU frames containing exactly one job in sequential order;
- GPU prepare, submit, workgroup-wave, and readback phases;
- partial final workgroups and masked overflow workers;
- invalid timeline dimensions;
- navigation cancellation and replay behavior;
- reduced-motion snapshots;
- preserved race correctness and timer-resolution behavior;
- platform-specific code mapping for a selected worker;
- accessible names and responsive layout contracts.

Manual browser verification covers all four steps at desktop and phone widths, keyboard-only inspection, reduced motion, WebGPU unavailable behavior, and real WebGPU runs for all supported workloads.

## Success criteria

The redesign succeeds when a first-time learner can complete the four-step lesson and accurately answer:

1. What is visually different about CPU and GPU processing in this example?
2. What happens between the CPU preparing work and receiving the GPU result?
3. Why can a small CPU job beat the measured GPU path?
4. How does a worker identify the pixel it owns?
5. How do workgroups, threadgroups, Triton programs, and CUDA blocks relate without being treated as identical?
