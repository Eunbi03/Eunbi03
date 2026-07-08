import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "splash.png"],
      manifest: {
        name: "TimeCard 근태관리",
        short_name: "TimeCard",
        description: "근태관리 어플리케이션",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#333333",
        theme_color: "#2f6d8f",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 네비게이션 폴백에서 API 경로는 제외 (SPA 라우팅과 분리)
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // API 요청은 절대 캐시하지 않고 항상 네트워크로 (인증/실시간 데이터)
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://api:3000",
        changeOrigin: true,
      },
    },
  },
});
