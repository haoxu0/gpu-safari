import test from "node:test";
import assert from "node:assert/strict";
import { mountPreferredRenderer, requestedRenderer } from "../src/renderer-selection.mjs";

test("VGPU is the default lesson renderer", () => {
  assert.equal(requestedRenderer(""), "vgpu");
  assert.equal(requestedRenderer("?renderer=vgpu"), "vgpu");
  assert.equal(requestedRenderer("?renderer=css"), "css");
  assert.equal(requestedRenderer("?renderer=unknown"), "vgpu");
});

test("the preferred renderer mounts without changing scene facts", async () => {
  const scene = Object.freeze({ phase: "work" });
  let mounted = null;
  const renderer = { mount: async (_canvas, value) => { mounted = value; } };
  const result = await mountPreferredRenderer({ search: "?renderer=vgpu", canvas: {}, scene, createVgpu: () => renderer });
  assert.equal(result.kind, "vgpu");
  assert.equal(mounted, scene);
  assert.equal(result.fallbackReason, null);
});

test("VGPU initialization failure returns a generic CSS fallback", async () => {
  const diagnostics = [];
  const result = await mountPreferredRenderer({ search: "?renderer=vgpu", canvas: {}, scene: {}, createVgpu: () => ({ mount: async () => { throw new Error("private adapter details"); } }), reportError: (...values) => diagnostics.push(values) });
  assert.equal(result.kind, "css");
  assert.equal(result.renderer, null);
  assert.equal(result.fallbackReason, "The 2.5D view is unavailable, so the accessible processing view is active.");
  assert.doesNotMatch(result.fallbackReason, /private adapter/);
  assert.equal(diagnostics.length, 1);
});
