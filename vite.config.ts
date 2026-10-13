import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // relative asset URLs: the build works from any path (GitHub Pages sub-path, file host, ...)
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered explicitly in src/main.tsx
      includeAssets: ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'opnscrl',
        short_name: 'opnscrl',
        description: 'Make seamless multi-slide carousels. Free, private, works offline.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#16161a',
        theme_color: '#16161a',
        categories: ['photo', 'graphics', 'productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // offline app shell: everything the build emits
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // the HEIC decoder (~3 MB) is only needed for iPhone photos: cached on first use instead
        globIgnores: ['**/heic-to-*.js'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/heic-to-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'heic-decoder', expiration: { maxEntries: 2 } },
          },
          {
            // Google Fonts stylesheets: serve cached, refresh in the background
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            // the font files themselves
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-files',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // heic-to (libheif wasm, ~3 MB) is a lazy chunk fetched only when a HEIC photo is imported;
    // it is deliberately left out of the PWA precache.
    chunkSizeWarningLimit: 3300,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/konva')) return 'vendor-konva';
          if (/node_modules\/(preact|@preact|zod)\//.test(id)) return 'vendor-preact-zod';
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
