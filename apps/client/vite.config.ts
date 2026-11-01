import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const gatewayTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [
    react(),
    !process.env.TAURI_ENV_PLATFORM &&
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Sapremo Warehouse Manager',
          short_name: 'Warehouse',
          description:
            'Offline-first Warehouse Management System (WMS) with local IndexedDB mutation queue and STOMP telemetry',
          theme_color: '#1677ff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    port: 3000,
    strictPort: true,
    open: false,
    proxy: {
      '/api/warehouse/ws': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/ws': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/api/warehouse': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/drivers': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/factory': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: gatewayTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-dexie': ['dexie', 'dexie-react-hooks'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-pdf': ['@react-pdf/renderer'],
          'vendor-misc': ['dayjs', 'axios', 'zustand', 'lottie-react'],
        },
      },
    },
    chunkSizeWarningLimit: 1600,
  },
});
