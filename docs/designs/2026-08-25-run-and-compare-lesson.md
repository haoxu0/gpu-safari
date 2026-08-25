# Run and Compare Lesson

## Goal

Teach a beginner how CPU and GPU execution differ through one direct experiment. The learner configures a workload, watches each path run, and compares truthful measured results. Visual behavior leads; prose explains only what the visuals cannot.

## Lesson flow

The lesson becomes three stages:

1. **Question and configure**
   - Ask how a CPU and GPU will process the same pixels.
   - Let the learner choose pixel count and GPU workgroup size.
   - Offer an optional prediction without blocking progress.
2. **Run CPU and GPU**
   - Provide separate `Run on CPU` and `Run on GPU` controls.
   - CPU animation paints pixels sequentially and measures the real JavaScript loop.
   - GPU performs a real local WebGPU dispatch, validates its output, then replays the observed dispatch structure as Prepare → Submit → parallel workgroups → Readback.
   - Label worker timing as illustrative because browsers do not expose physical-core scheduling.
3. **Compare results**
   - Confirm whether the outputs match.
   - Replace explanatory result paragraphs with a shared-axis measurement chart.
   - Put methodology and caveats inside a collapsed `How measured` disclosure.

## Run workspace

On desktop, the processing view and code appear side by side. The visualization is primary; code can be hidden to give it more space.

- Selecting `Run on CPU` selects the CPU code tab and highlights the loop as pixels advance.
- Selecting `Run on GPU` selects the WebGPU tab and highlights prepare, submit, shader work, and readback as those replay phases advance.
- Selecting a visible GPU worker highlights the corresponding invocation in the shader.
- Metal, CUDA, and Triton examples live under `Other platforms` rather than competing with the two runnable paths.
- On narrow screens, code becomes a collapsible panel below the visualization.

The code view is optional. A learner can complete the experiment without opening or reading code.

## Measurement chart

CPU and GPU use one horizontal millisecond scale.

- A reliable measurement appears as a solid bar with its observed duration.
- A value at or below browser timer resolution appears as a short hatched uncertainty band labeled `Below timer resolution`.
- A winner marker and ratio appear only when both measurements are resolved.
- If either value is unresolved, the chart says `No reliable ratio` without naming a winner.
- Output validation is a compact badge above the chart: `Outputs match` or a prominent error state.

The chart is accessible as structured text with programmatic labels; color is not the only signal.

## Data and state

CPU and GPU runs are independent states. Each stores status, measured result, correctness, and visualization progress. Compare becomes available only after both paths complete successfully for the same configuration.

Changing pixel count or workgroup size invalidates prior results and returns the experiment to the configuration stage. A failed path keeps the other successful result but blocks comparison until retried.

For large GPU workloads, the visualization renders a representative 64-worker window while retaining and displaying the full dispatch facts:

- submitted X × Y grid;
- active workgroups;
- dispatched workgroups;
- fully masked padding groups.

## Truthfulness boundaries

- CPU time measures the JavaScript paint loop.
- GPU time measures browser submission through result readback, not kernel-only latency.
- WebGPU dispatch dimensions and validation are real.
- Replay phase order follows the real operation, but animation duration and worker scheduling are illustrative.
- No cloud provider runs automatically. Modal retains explicit billable-run confirmation.

## Accessibility and responsive behavior

- Every action works by keyboard.
- Run status and output validation use polite live regions.
- Reduced-motion users step through representative phases or receive the completed state without animation.
- Chart values remain readable without color and have a text-equivalent summary.
- Desktop uses a visualization/code split; mobile stacks the panels with code collapsed by default.

## Verification

- Unit tests cover independent CPU/GPU state, configuration invalidation, comparison gating, timer-resolution uncertainty, dispatch metadata, replay phases, and large-workload sampling.
- Component tests cover truthful chart labels, code-phase highlighting, keyboard controls, and reduced motion.
- Browser verification covers real WebGPU execution on the Mac, output equality, synchronized replay, responsive layout, and console errors.
- No cloud GPU run is needed for this feature.
