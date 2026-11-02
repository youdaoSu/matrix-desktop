const { spawnSync } = require('node:child_process');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const cached = path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe');
const electron = fs.existsSync(cached) ? cached : require('electron');
const result = spawnSync(electron, [path.join(__dirname, 'qa-page-actions-renderer.cjs')], {
  cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
