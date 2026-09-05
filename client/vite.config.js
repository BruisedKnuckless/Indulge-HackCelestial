import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5050',
      '/socket.io': { target: 'http://localhost:5050', ws: true },
    },
  },
  preview: {
    // Vite's preview server checks the incoming Host header and refuses
    // anything not on this list. Railway serves the app through a generated
    // *.up.railway.app subdomain, which isn't there by default, so the page
    // loads a blank screen with a "Blocked request" error until it's allowed.
    // The wildcard covers a renamed service or a redeployed domain; the exact
    // host is kept too since a literal match is what Vite checks first.
    allowedHosts: ['indulge-hackcelestial-production.up.railway.app', '.up.railway.app'],
  },
});
