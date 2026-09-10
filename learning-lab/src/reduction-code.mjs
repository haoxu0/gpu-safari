export const REDUCTION_PLATFORMS = Object.freeze(["webgpu", "cuda", "triton", "metal", "hip"]);

const CODE = Object.freeze({
  webgpu: `// WGSL — one workgroup sum reduction
var<workgroup> scratch: array<f32, 16>;

for (var stride = 8u; stride > 0u; stride >>= 1u) {
  if (lane < stride) { scratch[lane] += scratch[lane + stride]; }
  workgroupBarrier();
}
if (lane == 0u) { output[0] = scratch[0]; }`,
  cuda: `// CUDA — cooperative block reduction
__shared__ float scratch[16];
for (int stride = 8; stride > 0; stride >>= 1) {
  if (threadIdx.x < stride)
    scratch[threadIdx.x] += scratch[threadIdx.x + stride];
  __syncthreads();
}
if (threadIdx.x == 0) sum[0] = scratch[0];`,
  triton: `# Triton — vector lanes reduce one block
offsets = tl.arange(0, BLOCK_SIZE)
values = tl.load(x + offsets, mask=offsets < n, other=0.0)
sum_value = tl.sum(values, axis=0)
tl.store(output, sum_value)`,
  metal: `// Metal — SIMD-group sum reduction
float value = lane < count ? input[lane] : 0.0;
float sum = simd_sum(value);
if (simd_is_first()) output[0] = sum;`,
  hip: `// HIP — cooperative block reduction
__shared__ float scratch[16];
for (int stride = 8; stride > 0; stride >>= 1) {
  if (threadIdx.x < stride)
    scratch[threadIdx.x] += scratch[threadIdx.x + stride];
  __syncthreads();
}
if (threadIdx.x == 0) sum[0] = scratch[0];`,
});

export function reductionCode(platform) {
  if (!REDUCTION_PLATFORMS.includes(platform)) throw new RangeError(`Unknown reduction platform: ${platform}`);
  return CODE[platform];
}

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function renderReductionCodePanel(platform) {
  const labels = { webgpu: "WebGPU", cuda: "CUDA", triton: "Triton", metal: "Metal", hip: "HIP" };
  return `<section class="reduction-code-panel"><header><span>Syntax view · same reduction idea</span></header><div class="syntax-tabs" role="tablist" aria-label="GPU syntax">${REDUCTION_PLATFORMS.map((id) => `<button type="button" role="tab" data-reduction-platform="${id}" aria-selected="${id === platform}" tabindex="${id === platform ? 0 : -1}" aria-controls="reduction-code-body">${labels[id]}</button>`).join("")}</div><pre role="tabpanel" id="reduction-code-body"><code>${escapeHtml(reductionCode(platform))}</code></pre></section>`;
}
