import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env / .env.local so VITE_PROXY_TARGET set there is honoured (Vite does
  // NOT expose those on process.env inside the config).
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:3001";
  return {
  server: {
    host: "::",
    port: 4000,
    strictPort: true,
    allowedHosts: true,
    // Dev-only: forward API + websocket calls to a backend so `npm run dev` can
    // run against real data with no CORS. Set VITE_PROXY_TARGET in .env.local
    // (e.g. the live backend) to preview locally. Never affects the prod build.
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
        // Follow any upstream redirect (e.g. a retired domain 301'ing to the new
        // one) server-side, so the browser never receives — and permanently
        // caches — a cross-origin 301 that would then get CORS-blocked.
        followRedirects: true,
      },
      "/socket.io": {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
        ws: true,
        followRedirects: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-tanstack': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-lucide': ['lucide-react'],
          'vendor-recharts': ['recharts'],
          'vendor-xlsx': ['xlsx'],
          'vendor-ui-core': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-label',
            '@radix-ui/react-tabs',
            '@radix-ui/react-popover'
          ],
        },
      },
    },
  },
  };
});
