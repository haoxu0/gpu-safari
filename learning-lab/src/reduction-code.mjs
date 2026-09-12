export const REDUCTION_PLATFORMS = Object.freeze(["webgpu", "cuda", "triton", "metal", "hip"]);

const CODE = Object.freeze({
  webgpu: (size) => `// WGSL sum reduction — adjacent pairs, matching the animation
var<workgroup> scratch_a: array<f32, ${size}>;
var<workgroup> scratch_b: array<f32, ${size}>;
var active = ${size}u;
var round = 0u;
while (active > 1u) {
  if (lane < active / 2u) {
    if ((round & 1u) == 0u) {
      scratch_b[lane] = scratch_a[2u * lane] + scratch_a[2u * lane + 1u];
    } else {
      scratch_a[lane] = scratch_b[2u * lane] + scratch_b[2u * lane + 1u];
    }
  }
  workgroupBarrier();
  active /= 2u;
  round += 1u;
}
// Launch the same kernel again if several workgroup partial sums remain.
if (lane == 0u) { output[group] = select(scratch_a[0], scratch_b[0], (round & 1u) == 1u); }`,
  cuda: (size) => `// CUDA — adjacent pairs, matching the animation
__shared__ float scratch[2][${size}];
int round = 0;
for (int active = ${size}; active > 1; active /= 2) {
  float* src = scratch[round & 1];
  float* dst = scratch[(round + 1) & 1];
  if (threadIdx.x < active / 2)
    dst[threadIdx.x] = src[2 * threadIdx.x] + src[2 * threadIdx.x + 1];
  __syncthreads();
  ++round;
}
// Launch again if several block partial sums remain.
if (threadIdx.x == 0) sum[blockIdx.x] = scratch[round & 1][0];`,
  triton: () => `# Triton — equivalent built-in lane reduction
offsets = tl.arange(0, BLOCK_SIZE)
values = tl.load(x + offsets, mask=offsets < n, other=0.0)
sum_value = tl.sum(values, axis=0)
tl.store(output, sum_value)`,
  metal: () => `// Metal — equivalent SIMD-group collective
float value = lane < count ? input[lane] : 0.0;
float sum = simd_sum(value);
if (simd_is_first()) output[0] = sum;`,
  hip: (size) => `// HIP — adjacent pairs, matching the animation
__shared__ float scratch[2][${size}];
int round = 0;
for (int active = ${size}; active > 1; active /= 2) {
  float* src = scratch[round & 1];
  float* dst = scratch[(round + 1) & 1];
  if (threadIdx.x < active / 2)
    dst[threadIdx.x] = src[2 * threadIdx.x] + src[2 * threadIdx.x + 1];
  __syncthreads();
  ++round;
}
// Launch again if several block partial sums remain.
if (threadIdx.x == 0) sum[blockIdx.x] = scratch[round & 1][0];`,
});

export function reductionCode(platform, groupSize = 16) {
  if (!REDUCTION_PLATFORMS.includes(platform)) throw new RangeError(`Unknown reduction platform: ${platform}`);
  if (![4, 8, 16].includes(groupSize)) throw new RangeError(`Unsupported teaching group size: ${groupSize}`);
  return CODE[platform](groupSize);
}

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function renderReductionCodePanel(platform, groupSize = 16) {
  const labels = { webgpu: "WebGPU", cuda: "CUDA", triton: "Triton", metal: "Metal", hip: "HIP" };
  const note = ["webgpu", "cuda", "hip"].includes(platform) ? "Adjacent-pair code · matches this animation" : "Equivalent native reduction · lanes may be mapped differently";
  return `<section class="reduction-code-panel"><header><span>${note}</span></header><div class="syntax-tabs" role="tablist" aria-label="GPU syntax">${REDUCTION_PLATFORMS.map((id) => `<button type="button" role="tab" data-reduction-platform="${id}" aria-selected="${id === platform}" tabindex="${id === platform ? 0 : -1}" aria-controls="reduction-code-body">${labels[id]}</button>`).join("")}</div><pre role="tabpanel" id="reduction-code-body"><code>${escapeHtml(reductionCode(platform, groupSize))}</code></pre></section>`;
}
