// Bounded diagnostics only. The previous matrix-server.log is never opened,
// truncated, renamed or removed. Unknown files disable this sink, not the app.
const fs = require('node:fs');
const path = require('node:path');
const { Writable } = require('node:stream');

function createBoundedServerLog({ directory, maxBytes = 8 * 1024 * 1024, segments = 4, fileSystem = fs }) {
  const validOptions = typeof directory === 'string' && path.isAbsolute(directory) && Number.isSafeInteger(maxBytes) && maxBytes >= 64 && maxBytes <= 8 * 1024 * 1024 && Number.isSafeInteger(segments) && segments >= 2 && segments <= 4;
  const folder = validOptions ? path.join(directory, 'matrix-server-bounded-v1') : '';
  const names = Array.from({ length: validOptions ? segments : 0 }, (_, index) => `segment-${index}.log`);
  const markerName = 'ownership.json';
  const marker = JSON.stringify({ version: 1, purpose: 'matrix-server-diagnostics', maxBytes, files: names }) + '\n';
  let fd, current = 0, size = 0, fileIdentity, disabled = false, rotations = 0, bytesWritten = 0, droppedBytes = 0;
  const io = fileSystem;
  const regular = stat => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= maxBytes;
  const close = () => { if (fd !== undefined) { const old = fd; fd = undefined; try { io.closeSync(old); } catch {} } };
  const disable = () => { disabled = true; close(); };
  const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
  function validate() {
    const root = io.lstatSync(folder);
    if (!root.isDirectory() || root.isSymbolicLink()) throw Error('Diagnostic directory changed');
    const entries = io.readdirSync(folder).sort();
    const expected = [...names, markerName].sort();
    if (entries.length !== expected.length || entries.some((name, index) => name !== expected[index])) throw Error('Unknown diagnostic files preserved');
    const proof = io.lstatSync(path.join(folder, markerName));
    if (!proof.isFile() || proof.isSymbolicLink() || proof.nlink !== 1 || proof.size !== Buffer.byteLength(marker)) throw Error('Diagnostic ownership unavailable');
    if (io.readFileSync(path.join(folder, markerName), 'utf8') !== marker) throw Error('Diagnostic ownership differs');
    for (const name of names) if (!regular(io.lstatSync(path.join(folder, name)))) throw Error('Diagnostic segment changed');
  }
  function open(index, truncate = false) {
    validate();
    const target = path.join(folder, names[index]), before = io.lstatSync(target);
    const next = io.openSync(target, 'r+');
    try {
      const after = io.fstatSync(next);
      if (!regular(after) || !same(before, after)) throw Error('Diagnostic file changed while opening');
      if (truncate) io.ftruncateSync(next, 0);
      fd = next; current = index; size = truncate ? 0 : after.size; fileIdentity = after;
    } catch (error) { try { io.closeSync(next); } catch {} throw error; }
  }
  try {
    if (!validOptions) throw Error('Invalid diagnostic bounds');
    const parent = io.lstatSync(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw Error('Diagnostic parent unavailable');
    if (!io.existsSync(folder)) {
      // Exclusive initialization; a partial or unknown directory is retained.
      io.mkdirSync(folder, { mode: 0o700 });
      for (const name of names) { const created = io.openSync(path.join(folder, name), 'wx', 0o600); io.closeSync(created); }
      const proof = io.openSync(path.join(folder, markerName), 'wx', 0o600);
      try { io.writeFileSync(proof, marker, 'utf8'); io.fsyncSync(proof); } finally { io.closeSync(proof); }
    }
    validate();
    const newest = names.map((name, index) => ({ index, stat: io.lstatSync(path.join(folder, name)) }))
      .filter(row => row.stat.size > 0).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs || b.index - a.index)[0];
    open(newest?.index ?? 0);
  } catch { disable(); }
  const stream = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding); let offset = 0;
      try {
        while (!disabled && offset < bytes.length) {
          const stat = io.fstatSync(fd);
          if (!regular(stat) || !same(fileIdentity, stat) || stat.size !== size) throw Error('Diagnostic writer changed');
          if (size === maxBytes) { close(); open((current + 1) % segments, true); rotations++; }
          const length = Math.min(maxBytes - size, bytes.length - offset);
          const written = io.writeSync(fd, bytes, offset, length, size);
          if (!Number.isSafeInteger(written) || written <= 0 || written > length) throw Error('Incomplete diagnostic write');
          offset += written; size += written; bytesWritten += written;
        }
      } catch { disable(); }
      droppedBytes += bytes.length - offset;
      // Always drain both child pipes, even with ENOSPC/access/rotation errors.
      callback();
    },
    final(callback) { close(); callback(); },
    destroy(_error, callback) { close(); callback(); },
  });
  stream.snapshot = () => ({ disabled, segments, segmentBytes: maxBytes, limitBytes: maxBytes * segments, rotations, bytesWritten, droppedBytes });
  stream.logPath = folder;
  return stream;
}
module.exports = { createBoundedServerLog };
