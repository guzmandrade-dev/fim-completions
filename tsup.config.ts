import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  external: ['vscode'],
  sourcemap: true,
  clean: true,
});
