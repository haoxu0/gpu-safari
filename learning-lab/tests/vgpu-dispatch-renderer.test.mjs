import test from "node:test";
import assert from "node:assert/strict";
import { createVgpuDispatchRenderer } from "../src/vgpu-dispatch-renderer.mjs";

function scene(overrides = {}) {
  return { phase: "work", commandState: "work", groups: Array.from({ length: 8 }, (_, id) => ({ id, state: id < 2 ? "complete" : id === 2 ? "active" : "waiting" })), output: Array.from({ length: 64 }, (_, id) => ({ id, state: id < 16 ? "complete" : "waiting" })), selection: { groupId: 2 }, camera: "angled", ...overrides };
}

function fixture() {
  const calls = [];
  const effect = { set: (value) => calls.push(["set", value]) };
  const surface = { resize: (value) => calls.push(["resize", value]), dispose: () => calls.push(["surface.dispose"]) };
  const gpu = { surface: (_canvas, opts) => (calls.push(["surface", opts]), surface), effect: (_shader, opts) => (calls.push(["effect", opts]), effect), frame: (cb) => cb({ pass: (target, drawable) => calls.push(["pass", target, drawable]) }), dispose: () => calls.push(["gpu.dispose"]) };
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) };
  const renderer = createVgpuDispatchRenderer({ loadVgpu: async () => ({ init: async () => gpu }), observeResize: (_canvas, callback) => (callback({ width: 400, height: 300 }), () => calls.push(["unobserve"])), devicePixelRatio: () => 3 });
  return { calls, canvas, renderer };
}

test("mount creates one VGPU surface and renders the initial scene", async () => {
  const { calls, canvas, renderer } = fixture();
  await renderer.mount(canvas, scene());
  assert.deepEqual(calls.find(([name]) => name === "surface")[1], { dpr: [1, 2], autoResize: false });
  assert.deepEqual([canvas.width, canvas.height], [800, 600]);
  assert.equal(calls.filter(([name]) => name === "pass").length, 1);
});

test("render translates scene state into compact shader uniforms", async () => {
  const { calls, canvas, renderer } = fixture();
  await renderer.mount(canvas, scene());
  renderer.render(scene({ selection: { groupId: 4 } }));
  const params = calls.filter(([name]) => name === "set").at(-1)[1].params;
  assert.deepEqual(params.counts, [8, 2, 2, 4]);
  assert.deepEqual(params.viewport, [800, 600]);
});

test("picking maps canvas coordinates into the logical group grid", async () => {
  const { canvas, renderer } = fixture();
  await renderer.mount(canvas, scene());
  assert.equal(renderer.pick(60, 90), 0);
  assert.equal(renderer.pick(340, 210), 7);
});

test("dispose releases observers, surface, and GPU exactly once", async () => {
  const { calls, canvas, renderer } = fixture();
  await renderer.mount(canvas, scene());
  renderer.dispose(); renderer.dispose();
  assert.equal(calls.filter(([name]) => name === "unobserve").length, 1);
  assert.equal(calls.filter(([name]) => name === "surface.dispose").length, 1);
  assert.equal(calls.filter(([name]) => name === "gpu.dispose").length, 1);
});
