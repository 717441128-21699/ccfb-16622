import { defineConfig } from 'vite';
import { audioWorkletPlugin } from './vite-plugins/worklet';

export default defineConfig({
  base: './',
  plugins: [audioWorkletPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
