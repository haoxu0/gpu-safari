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

test("the lesson asks for a learner guess without internal optional-field wording", async () => {
  const app = await readFile(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(app, /Make a guess/);
  assert.match(app, /CPU wins/);
  assert.match(app, /GPU wins/);
  assert.doesNotMatch(app, /Optional prediction/);
});

test("lesson navigation labels do not wrap on phone layouts", async () => {
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.lesson-controls \.button[^}]*white-space:\s*nowrap/);
});
