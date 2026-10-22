import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "docs/demo",
    emptyOutDir: true,
    rollupOptions: {
      input: "demo/main.tsx",
      output: {
        entryFileNames: "bubo-demo.js",
        assetFileNames: "bubo-demo.[ext]",
      },
    },
  },
});
