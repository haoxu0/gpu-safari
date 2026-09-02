import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        home: fromRoot("./index.html"),
        trails: fromRoot("./trails/index.html"),
        paintPixels: fromRoot("./learn/paint-pixels/index.html"),
      },
    },
  },
});
