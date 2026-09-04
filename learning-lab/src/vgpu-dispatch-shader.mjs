export const VGPU_DISPATCH_SHADER = `
struct Params {
  counts: vec4f,
  viewport: vec2f,
  state: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;

fn box2(p: vec2f, center: vec2f, halfSize: vec2f) -> f32 {
  let d = abs(p - center) - halfSize;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn shadeGroup(uv: vec2f, index: f32) -> vec4f {
  let columns = 4.0;
  let column = index % columns;
  let row = floor(index / columns);
  let completeCount = params.counts.y;
  let activeGroup = params.counts.z;
  let selectedGroup = params.counts.w;
  var height = 0.0;
  var color = vec3f(0.10, 0.20, 0.17);
  if (index < completeCount) { height = 0.018; color = vec3f(0.26, 0.78, 0.52); }
  if (index == activeGroup) { height = 0.045; color = vec3f(0.94, 0.67, 0.25); }
  if (index == selectedGroup) { color = mix(color, vec3f(0.78, 0.95, 0.87), 0.42); height += 0.012; }
  let center = vec2f(0.20 + column * 0.145 + row * 0.045, 0.31 + row * 0.17 - column * 0.045 - height);
  let top = box2(uv, center, vec2f(0.052, 0.038));
  let side = box2(uv, center + vec2f(0.0, 0.024 + height * 0.5), vec2f(0.052, 0.018 + height * 0.5));
  if (top < 0.0) { return vec4f(color, 1.0); }
  if (side < 0.0) { return vec4f(color * 0.55, 1.0); }
  return vec4f(0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var color = vec3f(0.025, 0.06, 0.05);
  let glow = max(0.0, 1.0 - distance(uv, vec2f(0.48, 0.48)) * 1.5);
  color += vec3f(0.025, 0.09, 0.065) * glow;
  let plane = box2(uv, vec2f(0.43, 0.48), vec2f(0.35, 0.28));
  if (plane < 0.0) { color = vec3f(0.04, 0.12, 0.095); }
  for (var i = 0u; i < 32u; i += 1u) {
    if (f32(i) >= params.counts.x) { break; }
    let group = shadeGroup(uv, f32(i));
    if (group.a > 0.0) { color = group.rgb; }
  }
  let outputPlane = box2(uv, vec2f(0.78, 0.72), vec2f(0.16, 0.11));
  if (outputPlane < 0.0) { color = mix(vec3f(0.08, 0.18, 0.15), vec3f(0.26, 0.78, 0.52), params.state.x); }
  let packetCenter = mix(vec2f(0.07, 0.75), vec2f(0.72, 0.65), params.state.y);
  if (box2(uv, packetCenter, vec2f(0.045, 0.022)) < 0.0) { color = vec3f(0.57, 0.96, 0.74); }
  return vec4f(color, 1.0);
}`;
