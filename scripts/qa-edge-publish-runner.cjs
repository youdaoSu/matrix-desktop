const { spawnSync } = require('node:child_process');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const result = spawnSync(path.join(root, '.desktop-deps/node_modules/electron/dist/electron.exe'), [path.join(__dirname, 'qa-edge-publish-renderer.cjs')], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 90000 });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
