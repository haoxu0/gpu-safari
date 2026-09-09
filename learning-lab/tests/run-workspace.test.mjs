import test from "node:test";
import assert from "node:assert/strict";

import { buildCodePhaseSelection, renderRunWorkspace } from "../src/run-workspace.mjs";

test("CPU and WebGPU phases select the code that performs the visible work", () => {
  assert.match(buildCodePhaseSelection({ executionBackend: "cpu", codePlatform: "webgpu", phase: "cpu", workerId: null, pixels:64, groupSize:8 }).highlightedToken, /output\[pixel\]/);
  assert.match(buildCodePhaseSelection({ executionBackend: "webgpu", codePlatform: "webgpu", phase: "prepare", workerId: null, pixels:64, groupSize:8 }).highlightedToken, /createCommandEncoder/);
});

test("CPU code distinguishes an execution target from a completed run",()=>{
 assert.equal(buildCodePhaseSelection({executionBackend:"cpu",codePlatform:"webgpu",phase:"ready",workerId:null,pixels:64,groupSize:8,cpuHasRun:false}).executionLabel,"CPU execution target");
 assert.equal(buildCodePhaseSelection({executionBackend:"cpu",codePlatform:"webgpu",phase:"cpu",workerId:null,pixels:64,groupSize:8,cpuHasRun:true}).executionLabel,"Ran in this browser");
});

test("a selected GPU worker highlights the shader invocation", () => {
  const selection = buildCodePhaseSelection({ executionBackend: "webgpu", codePlatform: "cuda", phase: "work", workerId: 10, pixels:64, groupSize:8 });
  assert.match(selection.highlightedToken, /blockIdx/);
  assert.match(selection.caption, /Worker 10.*pixel 10/);
});

test("GPU syntax tabs distinguish running code from equivalents", () => {
  const selection = buildCodePhaseSelection({ executionBackend:"webgpu", codePlatform:"triton", phase:"work", workerId:0, pixels:65536, groupSize:16, gpuHasRun:true });
  const html = renderRunWorkspace({ backend:"webgpu", codePlatform:"triton", sceneHtml:'<div class="css-scene"></div>', codeVisible:true, codeSelection:selection, platforms:["webgpu","cuda","triton","metal","hip"] });
  assert.match(html, /role="tablist"/); assert.match(html, /aria-selected="true"/);
  assert.match(html, /Equivalent syntax · not executed/); assert.match(html, /role="tabpanel"/);
  assert.match(html, /tabindex="0"/); assert.match(html, /tabindex="-1"/);
  assert.match(html, /aria-controls="gpu-code-panel"/); assert.match(html, /aria-labelledby="gpu-code-tab-triton"/);
  assert.doesNotMatch(html, /data-run="triton"/);
});

test("code can be hidden without removing the processing visualization", () => {
  const hidden = renderRunWorkspace({ backend: "cpu", sceneHtml: '<div class="css-scene">scene</div>', codeVisible: false, codeSelection: null });
  assert.match(hidden, /class="css-scene">scene/);
  assert.doesNotMatch(hidden, /run-code-panel/);
  assert.match(hidden, /Show code/);
});

test("the VGPU workspace exposes timeline controls and accessible scene truth", () => {
  const selection = buildCodePhaseSelection({ executionBackend:"webgpu", codePlatform:"webgpu", phase:"work", workerId:8, pixels:64, groupSize:8, gpuHasRun:true });
  const html = renderRunWorkspace({ backend:"webgpu", codePlatform:"webgpu", sceneHtml:"", codeVisible:true, codeSelection:selection, platforms:["webgpu"], rendererKind:"vgpu", sceneSummary:"Workgroup 1 paints pixels 8 through 15", sceneTruth:{ observed:"64 pixels · 8 active workgroups", illustrated:"Workgroup waves are illustrated" }, timeline:{ index:2, count:6, running:false } });
  assert.match(html, /<canvas[^>]+data-vgpu-dispatch/);
  assert.match(html, /data-vgpu-dispatch[^>]+tabindex="0"/);
  assert.match(html, /data-playback="play"/);
  assert.match(html, /data-playback="restart"/);
  assert.match(html, /type="range"[^>]+value="2"/);
  assert.match(html, /64 pixels · 8 active workgroups/);
  assert.match(html, /Workgroup waves are illustrated/);
  assert.match(html, /role="status"[^>]*>Workgroup 1 paints pixels 8 through 15/);
});
