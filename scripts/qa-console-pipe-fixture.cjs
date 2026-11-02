// Disposable no-window Electron fixture. Never loads Matrix or a platform page.
const { app } = require('electron');
require('./qa-console-pipe.cjs').guardQaConsolePipes({ exit: code => app.exit(code) });
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-qa-pipe-')));
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  process.stdout.write('fixture-ready\n');
  const output = process.argv.includes('--qa-stderr') ? process.stderr : process.stdout;
  setInterval(() => output.write('disposable-qa-log\n'), 100);
  setTimeout(() => app.exit(2), 8000);
});
