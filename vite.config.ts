import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project sites are served from /<repo>/, so assets need that prefix.
// Override with BASE_PATH=/ when serving from a custom domain or user site.
const base = process.env.BASE_PATH ?? '/ImageAnalysis/'

// Phones reach the dev server by LAN IP, which isn't a secure context over
// plain http — no service worker, no install prompt, no crypto.randomUUID.
// A self-signed cert buys those back. Off by default: localhost is already
// secure, and the cert costs you an interstitial.
const httpsDev = process.env.HTTPS === '1'

export default defineConfig({
  base,
  // Vite's host check 403s anything but localhost. Tailscale fronts the preview
  // with a real cert on a ts.net name, so let that one family of hosts through.
  preview: { allowedHosts: ['.ts.net'] },
  plugins: [
    react(),
    ...(httpsDev ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // The service worker is production-only by default, so opt in for the
      // https dev run — otherwise there's nothing on-device to test.
      devOptions: { enabled: httpsDev, type: 'module' },
      manifest: {
        name: 'Image Analysis',
        short_name: 'Imaging',
        description:
          'Upload a medical image and get the imaging artifacts and the pathology explained separately.',
        theme_color: '#080b11',
        background_color: '#080b11',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell works offline; analysis obviously still needs the network.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
})
