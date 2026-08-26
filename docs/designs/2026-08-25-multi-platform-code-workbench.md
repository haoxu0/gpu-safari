# Multi-platform code workbench

## Goal

Turn the Paint Pixels Run stage into a platform-neutral GPU learning workbench. Learners should be able to change the experiment, run real CPU and WebGPU paths, and inspect how the same operation is expressed in WebGPU, CUDA, Triton, Metal, and HIP without confusing translated examples with executed code.

## Product principles

- Execution and syntax exploration are separate concerns.
- The interface must always say which code actually ran.
- One workload, phase, and selected worker should remain recognizable across every syntax.
- Configuration stays visible because it explains changes in dispatch shape and visualization.
- Syntax exploration must remain useful even when WebGPU is unavailable.

## Run-stage layout

Use a stable workbench layout:

1. A configuration bar contains workload size, workers per group, and visualization speed.
2. Separate **Run on CPU** and **Run on my GPU** actions sit immediately below it.
3. The main workspace places the processing visualization on the left and synchronized code on the right.
4. On narrow screens, the visualization appears first and the code explorer follows as a collapsible section with horizontally scrollable syntax tabs.

The existing comparison remains a separate third stage. Optional native Metal and confirmed Modal execution remain under **Other hardware** and do not change the browser comparison.

## Configuration behavior

The Run stage supports:

- Workload size: 64, 65,536, or 1,048,576 pixels
- Workers per group: 4, 8, 16, or 32
- Visualization speed: slow, normal, or instant

Workload size and workers per group are execution configuration. Changing either clears previous CPU and GPU results, dispatch facts, and comparison eligibility. The interface reports that both paths must be rerun.

Visualization speed is presentation state. Changing it affects only animation timing and never clears measurements.

The controls are disabled while a real run is in flight. Completed results remain fingerprinted to their launch configuration.

## Execution model

The browser executes two paths:

- CPU: the JavaScript paint loop
- GPU: the WebGPU/WGSL compute path

After a CPU run, the code panel selects JavaScript. After a GPU run, it selects WebGPU and labels it **Running in this browser**.

WebGPU is the only zero-install GPU backend in this lesson. CUDA, Triton, Metal, and HIP examples are code translations, not claims of execution. They remain viewable when WebGPU is unsupported.

## Syntax explorer

The GPU code panel provides tabs for:

- WebGPU
- CUDA
- Triton
- Metal
- HIP

WebGPU displays **Running in this browser** after a real GPU run. Every other platform displays **Equivalent syntax · not executed**. Switching tabs never runs code, changes measurements, or affects comparison eligibility.

The selected language persists while the learner explores workers and phases. Starting another CPU or GPU run may select the corresponding executed-code view, but the learner can switch again afterward.

## Synchronized code

Each platform entry provides:

- A label and ecosystem identifier
- Execution-status rules
- A host/launch source template when the phase has a meaningful host-side equivalent
- A kernel source template for parallel work
- Highlight mappings for prepare, submit, work, readback, and completion
- A selected-worker explanation

The panel shows host/launch code during prepare, submit, and readback when applicable. It shows kernel code during GPU work and when a worker is selected.

Generated examples use the current configuration. Values such as WGSL `@workgroup_size`, CUDA and HIP block width, Triton `BLOCK_SIZE`, Metal threadgroup width, and pixel bounds must agree with the displayed workbench.

Across platforms, examples use consistent conceptual names where idiomatic: `pixel`, `n_pixels`, `group_size`, and `output`. A selected worker maps to the same pixel in every language.

## Component boundaries

### Platform catalog

A data-oriented catalog owns platform metadata, code templates, phase mappings, and execution labels. It does not render HTML or mutate lesson state.

### Code selection model

A pure selector accepts platform, phase, selected worker, and experiment configuration. It returns the generated source, highlighted token, code layer, caption, and execution label.

### Run configuration model

Experiment configuration continues to own workload size and workers per group. Visualization speed belongs to presentation state because it does not affect execution or comparison.

### Workbench renderer

The renderer owns the settings bar, run actions, visualization/code layout, syntax tabs, labels, and mobile collapse behavior. It consumes the selection model and emits no benchmark state changes itself.

## Accessibility

- Syntax tabs use an accessible tablist, tabs, and tab panel with keyboard navigation.
- Execution status is conveyed by text, not color alone.
- Configuration controls have explicit labels and describe which changes clear results.
- Switching syntax preserves focus and does not trigger broad live-region announcements.
- Code remains readable without horizontal page overflow; the code region may scroll internally.
- Reduced-motion users receive the final visualization frame while retaining all code and dispatch facts.

## Failure behavior

- If WebGPU is unavailable, disable only the real GPU run action and explain the browser limitation. Keep every syntax tab available.
- If a run fails, retain the selected syntax and show a generic local error without exposing private diagnostics.
- If configuration changes, clear stale results immediately and show a concise rerun message.
- If a code template cannot produce a valid selection, fail in tests and fall back to unhighlighted escaped source in the interface.

## Testing and validation

Automated tests cover:

- Configuration changes during Run and correct measurement invalidation
- Animation-speed changes without invalidation
- Generated configuration values for all five GPU syntaxes
- Host/kernel selection for each processing phase
- Selected-worker mapping across every syntax
- Correct **Running** versus **Equivalent** labels
- Syntax switching without execution or benchmark mutation
- Keyboard tab behavior and semantic structure
- Safe code escaping and mobile-responsive structure
- Existing CPU/WebGPU correctness, dispatch, timing, and cost-confirmation contracts

Browser validation covers the complete Configure → Run → Compare flow, syntax switching during an animation, desktop side-by-side layout, and the narrow-screen stacked layout. Validation uses local CPU and WebGPU only; it does not launch Modal or another billable GPU provider.

## Initial scope

The first release supports JavaScript, WebGPU, CUDA, Triton, Metal, and HIP examples for Paint Pixels. It does not add real CUDA, Triton, Metal, or HIP execution to the browser lesson. OpenCL, SYCL, MLX, PyTorch, editable code, and arbitrary kernel compilation remain future extensions.
