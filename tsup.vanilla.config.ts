import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/vanilla.ts'],
  format: ['iife'],
  globalName: 'Quter',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  clean: false,
  outExtension: () => ({ js: '.global.js' }),
});
