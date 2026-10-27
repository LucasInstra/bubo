import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "chrome110",
    minify: "oxc",
    sourcemap: false,
    rolldownOptions: {
      output: {
        // The markdown renderer and React are the heavy half of the bundle and
        // change far less often than the app; splitting them keeps the entry
        // chunk small without a network round trip (Tauri serves from disk).
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: "markdown",
              test: /node_modules[\\/](react-markdown|remark-.*|rehype-.*|micromark.*|mdast-.*|hast-.*|unified|unist-.*|vfile.*|bail|trough|devlop|is-plain-obj|zwitch|longest-streak|ccount|escape-string-regexp|markdown-table|html-url-attributes|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities.*|trim-lines|estree-util-.*|style-to-object|inline-style-parser|@ungap)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
