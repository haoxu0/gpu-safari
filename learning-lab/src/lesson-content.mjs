const LESSON_COPY = Object.freeze({
  see: {
    eyebrow: "See the processing",
    title: "One worker or many?",
  },
  experiment: {
    eyebrow: "Change the shape",
    title: "How many workers launch together?",
  },
  race: {
    eyebrow: "Measure the browser",
    title: "Run the same jobs for real",
  },
  code: {
    eyebrow: "Connect the model",
    title: "Touch a worker. See its code.",
  },
});

export function getLessonCopy(step) {
  const copy = LESSON_COPY[step];
  if (!copy) {
    throw new Error(`Unknown lesson step: ${step}`);
  }
  return copy;
}

export const CODE_SAMPLES = Object.freeze({
  python: `for y in range(height):\n    for x in range(width):\n        image[y, x] = color`,
  pytorch: `image = torch.empty((height, width, 3), device="cuda")\nimage[:] = color`,
  webgpu: `@group(0) @binding(0)\nvar<storage, read_write> output: array<f32>;\n\n@compute @workgroup_size(8)\nfn paint(@builtin(global_invocation_id) id: vec3<u32>) {\n    let pixel = id.x;\n    let n_pixels = 64u;\n    if (pixel < n_pixels) {\n        output[pixel] = 0.5;\n    }\n}`,
  metal: `kernel void paint(\n    device float* output [[buffer(0)]],\n    uint pixel [[thread_position_in_grid]]\n) {\n    if (pixel < 64) {\n        output[pixel] = 0.5f;\n    }\n}`,
  triton: `@triton.jit\ndef paint(image, color, n_pixels: tl.constexpr, BLOCK_SIZE: tl.constexpr):\n    program = tl.program_id(0)\n    offsets = program * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)\n    mask = offsets < n_pixels\n    tl.store(image + offsets, color, mask=mask)`,
  cuda: `int pixel = blockIdx.x * blockDim.x + threadIdx.x;\nif (pixel < n_pixels) {\n    image[pixel] = color;\n}`,
});

const CODE_SELECTIONS = Object.freeze({
  webgpu: {
    highlightedToken: "@builtin(global_invocation_id)",
    caption: (workerId) => `WebGPU invocation worker ${workerId} reads a global ID and maps it to pixel ${workerId}.`,
  },
  metal: {
    highlightedToken: "thread_position_in_grid",
    caption: (workerId) => `Metal thread worker ${workerId} receives its grid position and maps it to pixel ${workerId}.`,
  },
  triton: {
    highlightedToken: "program = tl.program_id(0)\n    offsets = program * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)",
    caption: (workerId) => `Worker ${workerId} sits inside a Triton program that handles vector lanes together.`,
  },
  cuda: {
    highlightedToken: "blockIdx.x * blockDim.x + threadIdx.x",
    caption: (workerId) => `CUDA thread worker ${workerId} combines block and thread IDs to map to pixel ${workerId}.`,
  },
});

export function getCodeSelection(platform, workerId) {
  const selection = CODE_SELECTIONS[platform];
  if (!selection) throw new Error(`Unknown code platform: ${platform}`);
  if (!Number.isInteger(workerId) || workerId < 0) {
    throw new RangeError("workerId must be a non-negative integer");
  }
  return {
    source: CODE_SAMPLES[platform],
    highlightedToken: selection.highlightedToken,
    caption: selection.caption(workerId),
  };
}
