import { VGPU_DISPATCH_SHADER } from "./vgpu-dispatch-shader.mjs";

const DEFAULT_OBSERVER = (canvas, callback) => {
  const observer = new ResizeObserver(([entry]) => callback(entry.contentRect));
  observer.observe(canvas);
  return () => observer.disconnect();
};

function phaseProgress(phase) {
  return ({ ready: 0, cpu: 0.55, prepare: 0.05, submit: 0.2, work: 0.55, readback: 0.85, complete: 1 })[phase] ?? 0;
}

export function createVgpuDispatchRenderer({ loadVgpu = () => import("vgpu"), observeResize = DEFAULT_OBSERVER, devicePixelRatio = () => window.devicePixelRatio || 1 } = {}) {
  let gpu = null; let surface = null; let visual = null; let canvas = null; let unobserve = null; let currentScene = null; let disposed = false;

  function resize(width, height, dpr = devicePixelRatio()) {
    if (!canvas || !surface) return;
    const scale = Math.min(2, Math.max(1, dpr));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    surface.resize?.([Math.max(1, Math.round(width)), Math.max(1, Math.round(height))]);
    if (currentScene) render(currentScene);
  }

  function render(scene) {
    if (!gpu || !surface || !visual || disposed) return;
    currentScene = scene;
    const complete = scene.groups.filter(({ state }) => state === "complete").length;
    const active = scene.groups.find(({ state }) => state === "active")?.id ?? -1;
    const outputRatio = scene.output.length ? scene.output.filter(({ state }) => state === "complete").length / scene.output.length : 0;
    visual.set({ params: { counts: [scene.groups.length, complete, active, scene.selection?.groupId ?? -1], viewport: [canvas.width, canvas.height], state: [outputRatio, phaseProgress(scene.phase)] } });
    gpu.frame((frame) => frame.pass(surface, visual));
  }

  async function mount(nextCanvas, initialScene) {
    if (gpu) throw new Error("VGPU renderer is already mounted");
    canvas = nextCanvas; disposed = false;
    try {
      const api = await loadVgpu();
      gpu = await api.init();
      surface = gpu.surface(canvas, { dpr: [1, 2], autoResize: false });
      visual = gpu.effect(VGPU_DISPATCH_SHADER, { set: { params: { counts: [0, 0, -1, -1], viewport: [1, 1], state: [0, 0] } } });
      unobserve = observeResize(canvas, ({ width, height }) => resize(width, height));
      currentScene = initialScene;
      render(initialScene);
    } catch (error) {
      dispose();
      throw new Error("VGPU renderer could not initialize", { cause: error });
    }
  }

  function pick(x, y) {
    if (!currentScene?.groups.length || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const nx = (x - rect.left - rect.width * 0.1) / (rect.width * 0.8);
    const ny = (y - rect.top - rect.height * 0.25) / (rect.height * 0.5);
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    const columns = 4;
    const rows = Math.ceil(currentScene.groups.length / columns);
    const id = Math.min(columns - 1, Math.floor(nx * columns)) + Math.min(rows - 1, Math.floor(ny * rows)) * columns;
    return id < currentScene.groups.length ? id : null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true; unobserve?.(); surface?.dispose?.(); gpu?.dispose?.();
    unobserve = null; surface = null; visual = null; gpu = null; canvas = null; currentScene = null;
  }

  return { mount, render, resize, pick, dispose };
}
