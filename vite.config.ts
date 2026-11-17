import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin UI is deployed separately from the gateway (Cloudflare Pages), so the API
// base is a build-time value. Empty means same origin, which is what the Worker-routing
// deployment uses.
export default defineConfig({
  plugins: [react()],
  // Stamped into the footer: if a browser is running an old bundle, it says so.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36).slice(-6)) },
  build: { outDir: "dist", sourcemap: false },
  server: { port: 5173 },
});
