// Temporary synthetic diagnostic files only. No installed app/profile touched.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if(process.argv[2]==='--packaged'&&!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(__dirname,'../.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
let moduleRoot=path.resolve(__dirname,'..');if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=path.join(moduleRoot,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);}
const { createBoundedServerLog } = require(path.join(moduleRoot,'desktop/bounded-server-log.cjs'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-bounded-log-qa-'));
if(process.versions.electron){const profile=path.join(root,'electron-profile');fs.mkdirSync(profile);require('electron').app.setPath('userData',profile);}
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const make = name => { const folder = path.join(root, name); fs.mkdirSync(folder); return folder; };
const sizes = folder => fs.readdirSync(path.join(folder, 'matrix-server-bounded-v1')).filter(name => name.endsWith('.log')).map(name => fs.statSync(path.join(folder, 'matrix-server-bounded-v1', name)).size);
async function finish(stream) { const done = once(stream, 'finish'); stream.end(); await done; }
(async () => {
  const directory = make('rotation'), legacy = path.join(directory, 'matrix-server.log');
  fs.writeFileSync(legacy, 'LEGACY_DIAGNOSTIC_KEEP');
  let stream = createBoundedServerLog({ directory, maxBytes: 64, segments: 4 });
  eq(stream.snapshot().disabled, false);
  stream.write(Buffer.alloc(700, 65));
  eq(sizes(directory).every(size => size <= 64), true);
  eq(sizes(directory).reduce((a, b) => a + b), 252);
  eq(stream.snapshot().rotations, 10);
  eq(stream.snapshot().bytesWritten, 700);
  eq(stream.snapshot().droppedBytes, 0);
  await finish(stream);
  eq(fs.readFileSync(legacy, 'utf8'), 'LEGACY_DIAGNOSTIC_KEEP');
  stream = createBoundedServerLog({ directory, maxBytes: 64, segments: 4 });
  eq(stream.snapshot().disabled, false);
  stream.write(Buffer.alloc(1000, 66)); await finish(stream);
  eq(sizes(directory).every(size => size <= 64), true);
  eq(sizes(directory).reduce((a, b) => a + b) <= 256, true);
  eq(fs.readFileSync(legacy, 'utf8'), 'LEGACY_DIAGNOSTIC_KEEP');

  const dual = make('dual'), stdout = new PassThrough(), stderr = new PassThrough();
  stream = createBoundedServerLog({ directory: dual, maxBytes: 64, segments: 2 });
  stdout.pipe(stream, { end: false }); stderr.pipe(stream, { end: false });
  stdout.end('OUT\n'); await new Promise(resolve => setImmediate(resolve));
  eq(stream.writableEnded, false); stderr.end('ERR\n'); await new Promise(resolve => setImmediate(resolve));
  await finish(stream);
  eq(fs.readFileSync(path.join(dual, 'matrix-server-bounded-v1', 'segment-0.log'), 'utf8'), 'OUT\nERR\n');

  const unknown = make('unknown'), managed = path.join(unknown, 'matrix-server-bounded-v1');
  fs.mkdirSync(managed); fs.writeFileSync(path.join(managed, 'unrelated.txt'), 'KEEP');
  stream = createBoundedServerLog({ directory: unknown, maxBytes: 64 });
  eq(stream.snapshot().disabled, true); stream.write('DROPPED'); await finish(stream);
  eq(stream.snapshot().droppedBytes, 7); eq(fs.readdirSync(managed), ['unrelated.txt']);
  eq(fs.readFileSync(path.join(managed, 'unrelated.txt'), 'utf8'), 'KEEP');

  for (const method of ['mkdirSync', 'openSync', 'writeSync', 'ftruncateSync', 'fstatSync']) {
    const folder = make('fault-' + method); let enabled = false;
    const io = { ...fs, [method](...args) { if (enabled) throw Error('Synthetic filesystem failure'); return fs[method](...args); } };
    stream = createBoundedServerLog({ directory: folder, maxBytes: 64, fileSystem: io });
    enabled = true;
    let errors = 0; stream.on('error', () => errors++);
    stream.write(Buffer.alloc(300)); await finish(stream);
    if (method !== 'mkdirSync') { eq(stream.snapshot().disabled, true); eq(stream.snapshot().droppedBytes > 0, true); }
    eq(errors, 0); eq(sizes(folder).every(size => size <= 64), true);
  }

  const oversized = make('oversized'); stream = createBoundedServerLog({ directory: oversized, maxBytes: 64 }); await finish(stream);
  const segment = path.join(oversized, 'matrix-server-bounded-v1', 'segment-1.log'); fs.writeFileSync(segment, Buffer.alloc(65, 90));
  stream = createBoundedServerLog({ directory: oversized, maxBytes: 64 });
  eq(stream.snapshot().disabled, true); stream.write('NO'); await finish(stream); eq(fs.statSync(segment).size, 65);

  const changed = make('changed'); stream = createBoundedServerLog({ directory: changed, maxBytes: 64 });
  fs.appendFileSync(path.join(changed, 'matrix-server-bounded-v1', 'segment-0.log'), 'EXTERNAL');
  stream.write('NO'); await finish(stream); eq(stream.snapshot().disabled, true);
  eq(fs.readFileSync(path.join(changed, 'matrix-server-bounded-v1', 'segment-0.log'), 'utf8'), 'EXTERNAL');

  const linked = make('linked');
  stream = createBoundedServerLog({ directory: linked, maxBytes: 64, fileSystem: { ...fs, lstatSync(file) { const stat = fs.lstatSync(file); if (String(file).endsWith('segment-2.log')) return { ...stat, isFile: () => true, isSymbolicLink: () => true }; return stat; } } });
  eq(stream.snapshot().disabled, true); await finish(stream);
  for (const options of [{directory:'relative'}, {directory:make('bad-limit'),maxBytes:63}, {directory:make('bad-segments'),segments:1000000000}, {directory:make('above-limit'),maxBytes:8*1024*1024+1}]) {
    stream=createBoundedServerLog(options); eq(stream.snapshot().disabled,true);stream.write('drain');await finish(stream);eq(stream.snapshot().droppedBytes,5);
  }
  for (const method of ['mkdirSync','openSync','writeFileSync','fsyncSync']) {
    const directory=make('init-'+method),io={...fs,[method](){throw Error('Synthetic initial failure');}};
    stream=createBoundedServerLog({directory,maxBytes:64,fileSystem:io});eq(stream.snapshot().disabled,true);stream.write('drain');await finish(stream);eq(stream.snapshot().droppedBytes,5);
  }
  const foreign=make('foreign-after-open');stream=createBoundedServerLog({directory:foreign,maxBytes:64});
  fs.writeFileSync(path.join(foreign,'matrix-server-bounded-v1','foreign.txt'),'KEEP');stream.write(Buffer.alloc(100));await finish(stream);
  eq(stream.snapshot().disabled,true);eq(fs.readFileSync(path.join(foreign,'matrix-server-bounded-v1','foreign.txt'),'utf8'),'KEEP');
  const markerRoot=make('changed-marker');stream=createBoundedServerLog({directory:markerRoot,maxBytes:64});await finish(stream);
  fs.writeFileSync(path.join(markerRoot,'matrix-server-bounded-v1','ownership.json'),'FOREIGN_KEEP');stream=createBoundedServerLog({directory:markerRoot,maxBytes:64});eq(stream.snapshot().disabled,true);await finish(stream);eq(fs.readFileSync(path.join(markerRoot,'matrix-server-bounded-v1','ownership.json'),'utf8'),'FOREIGN_KEEP');
  const main = fs.readFileSync(path.join(moduleRoot, 'desktop/main.cjs'), 'utf8');
  eq(main.includes("serverProcess.stdout.pipe(logStream, { end: false })"), true);
  eq(main.includes("serverProcess.stderr.pipe(logStream, { end: false })"), true);
  eq(main.includes("serverProcess.once('close', () => logStream.end())"), true);
  eq(main.includes("fs.createWriteStream(logPath, { flags: 'a' })"), false);
  console.log(JSON.stringify({ boundedServerLogChecks: checks, activeDiagnosticLimitBytes: 32 * 1024 * 1024, legacyLogUntouched: true, unknownFilesPreserved: true, filesystemFailureStillDrainsBothPipes: true, realProfileTouched: false, realServerStarted: false }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert(path.basename(root).startsWith('matrix-bounded-log-qa-'));
  fs.rmSync(root, { recursive: true, force: true });
  if(process.versions.electron)require('electron').app.exit(process.exitCode||0);
});
