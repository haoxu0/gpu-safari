# GPU Safari Website and Learning Lab

The website is a platform-neutral, browser-based entrance to GPU Safari. Its guided homepage leads into **Paint Pixels in Parallel**, which introduces thread-to-data mapping before asking learners to configure a GPU provider. The trail map previews where the curriculum goes next without presenting unfinished lessons as available.

The lesson follows four visual steps: watch processing, reshape the workers, measure the browser, and connect one worker to real GPU code. The first two steps are slowed SVG explanations, not hardware benchmarks; they never invent GPU timing data.

## Run the static website

From the repository root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/learning-lab/>. The homepage, trail map, and complete first lesson work as static files.

No JavaScript packages or GPU are required. Run the lesson-model tests with:

```bash
cd learning-lab
npm test
```

Run the full repository test suite with:

```bash
python -m pytest -q
```

## Run a real GPU shader in the browser

Open the published site in a current browser, choose a workload, then run **CPU** and **GPU** separately. The lesson animates each processing model beside its code, runs the same paint operation in a JavaScript CPU loop and a real WGSL compute shader, verifies matching output, and charts 64, 65,536, or 1,048,576 pixels. No Python environment, companion server, account, or cloud charge is required. On macOS, the browser maps WebGPU work to Apple's Metal stack.

The CPU time covers the JavaScript loop, while the GPU time covers browser submission through result readback. The comparison is deliberately not presented as pure kernel latency or a hardware benchmark. A CPU win is expected for very cheap work because dispatch and readback can cost more than the operation itself. Use the native companion below when you want Metal-specific execution and profiling.

## Run a real Metal kernel on Apple silicon

On an Apple silicon Mac with macOS 14 or newer, create an isolated environment and start the companion server:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r learning-lab/requirements-mac.txt
python learning-lab/server.py
```

Open <http://127.0.0.1:8000>, choose **Start the 10-minute lesson**, reach **Run**, expand **Other hardware**, and select **Run on your Apple GPU**. The custom MLX Metal kernel returns measured latency, device information, correctness, and an output checksum. Tiny teaching kernels are dominated by dispatch overhead, so treat the timing as an observation rather than a performance score.

## Compare with NVIDIA through Modal

Install and authenticate Modal as described in [`platforms/modal/README.md`](../platforms/modal/README.md), then start the same companion server. The Modal option is cost-gated in the interface: it launches billable NVIDIA L4 compute only after the learner checks the confirmation box and clicks **Run once on Modal**.

The Apple and NVIDIA paths share one result contract while keeping their execution models distinct: Metal grids and threadgroups, Triton programs and vector lanes, and CUDA blocks and threads are related concepts—not interchangeable names.

## Current scope

- Guided expedition homepage and shared lesson catalog
- Available/upcoming trail map
- Three visual stages: Configure, Run, and Compare
- Synchronized CPU and GPU processing animations with optional code
- Shared-scale timing chart with honest below-resolution states
- Accessible 8×8 thread-to-pixel work map
- WebGPU, Metal, Triton, and CUDA worker-to-code comparison
- Zero-install WebGPU compute execution in supported browsers
- Real Apple GPU execution through an MLX custom Metal kernel
- Explicitly confirmed Modal Triton execution on NVIDIA L4
- Provider-neutral correctness and timing results
- Adjustable block size
- Responsive layout and reduced-motion support

The browser simulation remains available when neither real backend is configured.

## Publish with GitHub Pages

The Pages workflow tests the repository and publishes `learning-lab/` as a static artifact after changes merge to `main`. In the repository settings, choose **Settings → Pages → Source → GitHub Actions** once. The site itself has no GitHub-specific runtime dependency and can also be hosted by any static file server.
