import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@game/shared": resolve(__dirname, "../shared/src/index.ts")
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
