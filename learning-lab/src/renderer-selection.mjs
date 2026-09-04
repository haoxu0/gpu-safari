export function requestedRenderer(search) {
  return new URLSearchParams(search).get("renderer") === "vgpu" ? "vgpu" : "legacy";
}

export async function mountPreferredRenderer({ search, canvas, scene, createVgpu, reportError = console.warn }) {
  if (requestedRenderer(search) !== "vgpu") return { kind: "legacy", renderer: null, fallbackReason: null };
  const renderer = createVgpu();
  try {
    await renderer.mount(canvas, scene);
    return { kind: "vgpu", renderer, fallbackReason: null };
  } catch (error) {
    reportError("VGPU visualization initialization failed; using legacy view.", error);
    renderer.dispose?.();
    return { kind: "legacy", renderer: null, fallbackReason: "The 2.5D view is unavailable, so the accessible processing view is active." };
  }
}
