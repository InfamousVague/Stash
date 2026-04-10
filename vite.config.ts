/// <reference types="vitest" />
import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@base": resolve(__dirname, "node_modules/@mattmattmattmatt/base"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    fs: {
      allow: [
        resolve(__dirname),
        resolve(__dirname, "../../Libs/base"),
      ],
    },
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/.env", "**/.env.*", "**/.env*"],
    },
    // Prevent Vite from watching/reloading on .env file changes (profile switching writes to .env)
    envDir: resolve(__dirname, 'src-tauri'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    mockReset: true,
  },
}));
