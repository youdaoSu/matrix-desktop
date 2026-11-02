// Compile and execute the actual NSIS safety macro in disposable EXEs only.
// No installation, registry changes, user profile, service or platform actions.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-installer-probe-'));
const compiler = path.join(root, '.desktop-cache/nsis/nsis-3.0.4.1/makensis.exe');
const plugins = path.join(root, '.desktop-cache/nsis/nsis-resources-3.4.1/plugins/x86-unicode');
const macro = path.join(root, 'desktop/installer.nsh');
const fixtureExe = path.join(folder, '\u77e9\u6548 MatrixInstallerProbe.exe');
const executable = path.join(folder, 'probe.exe');
let fixture, failed = true;
function run(file, args, timeout = 20000) {
  const result = spawnSync(file, args, { windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function compile(output = executable, section = ['  !insertmacro customCheckAppRunning']) {
  const script = [
    'Unicode true', 'RequestExecutionLevel user', 'SilentInstall silent',
    `OutFile "${output}"`, `!addplugindir "${plugins}"`,
    '!define APP_EXECUTABLE_FILENAME "\u77e9\u6548 MatrixInstallerProbe.exe"',
    `!include "${macro}"`, 'LangString appRunning 1033 "Close Matrix first."',
    'Section', ...section, 'SectionEnd',
  ].join('\r\n');
  const input = path.join(folder, 'probe.nsi');
  fs.writeFileSync(input, '\ufeff' + script, 'utf8');
  const result = run(compiler, ['/V2', input]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
(async () => {
  try {
    const source = fs.readFileSync(macro, 'utf8');
    assert.doesNotMatch(source, /nsExec::|_KillProcess|_CloseProcess/);
    assert.match(source, /\$R0 != 603/);
    assert.match(source, /SetErrorLevel 33/);
    compile();
    assert.equal(run(executable, ['/S'], 5000).status, 0, 'Unexpected Matrix process or enumeration failure');
    const errorProbe = path.join(folder, 'probe-enumeration-error.exe');
    compile(errorProbe, ['  StrCpy $R0 611', '  !insertmacro matrixRequireStoppedProcessStatus']);
    assert.equal(run(errorProbe, ['/S'], 5000).status, 33, 'Enumeration errors must fail closed');
    const fixtureSource = path.join(folder, 'Fixture.cs');
    fs.writeFileSync(fixtureSource, 'using System; class Fixture { static void Main() { Console.WriteLine("ready"); Console.Out.Flush(); Console.ReadLine(); } }', 'ascii');
    const csc = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    const compiled = run(csc, ['/nologo', '/target:exe', `/out:${fixtureExe}`, fixtureSource]);
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    fixture = spawn(fixtureExe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Process fixture did not start')), 5000);
      fixture.once('error', error => { clearTimeout(timer); reject(error); });
      fixture.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    assert.equal(run(executable, ['/S'], 5000).status, 32, 'Running Unicode Matrix executable must block update');
    fixture.stdin.end('\n');
    if (fixture.exitCode === null) await new Promise(resolve => fixture.once('exit', resolve));
    assert.equal(run(executable, ['/S'], 5000).status, 0, 'Closed fixture must not block update');
    failed = false;
    console.log(JSON.stringify({ nativeInstallerProbe: 'passed', absentProcessAllowed: true, unicodeRunningProcessRefused: true, closedProcessAllowed: true, simulatedEnumerationErrorRefused: true, registryOrUserDataChanged: false }));
  } finally {
    if (fixture?.exitCode === null) fixture.kill();
    if (!failed && path.dirname(folder) === os.tmpdir() && path.basename(folder).startsWith('matrix-installer-probe-')) fs.rmSync(folder, { recursive: true, force: true });
    if (failed) console.error('Disposable installer probe retained:', folder);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
