import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const RELAYER_PROXY_TIMEOUT_MS = 20 * 60 * 1000;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/relayer": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/relayer/, ""),
        timeout: RELAYER_PROXY_TIMEOUT_MS,
        proxyTimeout: RELAYER_PROXY_TIMEOUT_MS,
      },
    },
  },
});
