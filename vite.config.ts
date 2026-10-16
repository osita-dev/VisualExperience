import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import path from "path"

export default defineConfig({
  plugins: [
    react(),
    /* real PWA via the main package (Workbox): precaches the shell, chunks
       and fonts for instant repeat visits + offline; auto-updates in the
       background. The 31 MB ffmpeg core is explicitly excluded — it is
       fetched only when a decode fallback or ffmpeg export needs it. */
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Visual Experience (FRAME)",
        short_name: "FRAME",
        description:
          "Preset-driven 9:16 template video maker. Fill the slots, the beat grid does the editing.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0B1120",
        theme_color: "#0B1120",
        orientation: "portrait",
        lang: "en",
        categories: ["photo", "video", "productivity"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["ffmpeg/**"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /* split the big stable libraries into their own long-cached
           chunks — a route change or an app update no longer re-downloads
           React/Radix/mediabunny, and the browser loads them in parallel */
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined
          if (
            /node_modules[\\/](react|react-dom|react-router|react-remove-scroll|scheduler)[\\/]/.test(
              id,
            )
          )
            return "react"
          if (id.includes("@radix-ui") || id.includes("radix-ui")) return "radix"
          if (id.includes("mediabunny")) return "mediabunny"
          if (id.includes("@tanstack")) return "tanstack"
          return "vendor"
        },
      },
    },
  },
})
