import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the learning lab exposes a reproducible production build", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(packageJson.dependencies.vgpu, "0.1.6");
  assert.equal(packageJson.devDependencies.vite, "7.3.6");
});

test("GitHub Pages deploys the built website", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /npm --prefix learning-lab ci/);
  assert.match(workflow, /npm --prefix learning-lab run build/);
  assert.match(workflow, /path: learning-lab\/dist/);
});
