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
      // Proxy agent requests to the Wrangler dev server
      "/agents": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
