import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Heavy vendors that no eager code uses. Dropping their preload hint stops the
 * browser being told to fetch them up front.
 *
 * This removes the hint only. recharts and jspdf are still pulled in by a
 * shared import somewhere in the always-loaded path, so they are still
 * fetched — verified in a real browser, not inferred from the build output.
 * Only xlsx (429 KB) is genuinely dropped from first paint today. Finding and
 * cutting that shared import is the remaining work.
 */
const LAZY_VENDORS = /vendor-(recharts|xlsx|jspdf)/;

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
    // The default emits a <link rel="modulepreload"> for every static chunk,
    // so the booking page told the browser to fetch chart, spreadsheet and PDF
    // libraries before painting. See LAZY_VENDORS for what this does and does
    // not currently achieve.
    modulePreload: { resolveDependencies: (_url, deps) => deps.filter((d) => !LAZY_VENDORS.test(d)) },
    rollupOptions: {
      output: {
        // The function form, not the object form: deciding per module lets a
        // vendor stay out of the entry's preload set when only lazy routes use
        // it, and splits jspdf out of the main bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@tanstack/react-query')) return 'vendor-tanstack';
          if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          // recharts only — not its d3-* dependencies: something in the eager
          // graph also depends on a d3 module, so grouping d3 here dragged the
          // whole chart chunk back into the entry.
          if (id.includes('recharts')) return 'vendor-recharts';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('jspdf')) return 'vendor-jspdf';
          if (/@radix-ui[\\/]react-(dialog|select|label|tabs|popover)/.test(id)) return 'vendor-ui-core';
        },
      },
    },
  },
  };
});
