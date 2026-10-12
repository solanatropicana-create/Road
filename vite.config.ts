import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    // One bundle so the artifact build can inline it into a single page.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
