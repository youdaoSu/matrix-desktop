import path from 'path';
import fs from 'fs';
import { defineConfig } from '@lark-apaas/coding-preset-vite-react';

const config = defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});

// The shared preset prebundles dependencies from its full starter template.
// Keep only packages installed by this app so a lean install has a clean dev startup.
if (config.optimizeDeps?.include) {
  config.optimizeDeps.include = config.optimizeDeps.include.filter((entry) => {
    const packageName = entry.startsWith('@') ? entry.split('/').slice(0, 2).join('/') : entry.split('/')[0];
    return fs.existsSync(path.join(process.cwd(), 'node_modules', packageName, 'package.json'));
  });
}

export default config;
