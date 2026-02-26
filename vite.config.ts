import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/agents": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  // SPA fallback: serve index.html for all non-file routes
  appType: "spa",
});
