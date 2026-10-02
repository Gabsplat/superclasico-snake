import { defineConfig } from 'vite';

// Vista previa accesible por Tailscale desde otros dispositivos de la tailnet.
const allowedHosts = ['omarchy.tailff08b5.ts.net'];

export default defineConfig({
  base: './',
  server: { allowedHosts },
  preview: { allowedHosts },
});
