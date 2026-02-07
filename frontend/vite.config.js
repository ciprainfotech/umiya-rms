import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto', 
      
      // Enables PWA in development mode
      devOptions: {
        enabled: true,
        type: 'classic' // Helps with browser compatibility in dev
      },

      // Inside your VitePWA config in vite.config.js
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
  cleanupOutdatedCaches: true,
  // Add this to handle your /manager route
  navigateFallback: 'index.html',
  navigateFallbackAllowlist: [/^\//], // Allows all routes starting with /
},

      manifest: {
        name: 'Umiya Restaurant Management',
        short_name: 'UmiyaRMS',
        description: 'Complete POS and RMS system for Umiya',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173, // Change back to 5173 for development
    strictPort: true,
    https: false,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false}}
  },
  preview: {
    host: true,
    port: 4173, // Keep 4173 for the "npm run preview" command
    https: false,
    allowedHosts: true,
      proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false}}
  }
})