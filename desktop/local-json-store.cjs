const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Some Windows user-data locations report EXDEV even for a same-directory
// rename. Preserve a recovery copy before falling back to a verified copy.
// This is for application-owned JSON, not browser cookies or login secrets.
function writeLocalJson(file, value, io = fs) {
  const payload = JSON.stringify(value, null, 2);
  if (payload === undefined) throw Error('Invalid JSON value');
  const previousFile = file + '.previous';
  const regular = target => {
    if (io.existsSync(target)) {
      const stat = io.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Unsafe JSON storage target');
    }
  };
  regular(file);
  regular(previousFile);
  io.mkdirSync(path.dirname(file), { recursive: true });
  const previous = io.existsSync(file) ? io.readFileSync(file, 'utf8') : '[]';
  const temporary = file + '.' + randomUUID() + '.tmp';
  let created = false;
  const writeDurably = (target, contents, flags = 'w') => {
    const descriptor = io.openSync(target, flags, 0o600);
    try { io.writeFileSync(descriptor, contents, 'utf8'); io.fsyncSync(descriptor); }
    finally { io.closeSync(descriptor); }
  };
  try {
    // The unique temporary file can be cleaned up only after we created it.
    const descriptor = io.openSync(temporary, 'wx', 0o600);
    created = true;
    try { io.writeFileSync(descriptor, payload, 'utf8'); io.fsyncSync(descriptor); }
    finally { io.closeSync(descriptor); }
    try { io.renameSync(temporary, file); }
    catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      writeDurably(previousFile, previous);
      if (io.readFileSync(previousFile, 'utf8') !== previous) throw Error('JSON recovery copy failed verification');
      try {
        io.copyFileSync(temporary, file);
        // fsync the destination as well; a copied file is not necessarily durable.
        const destination = io.openSync(file, 'r+');
        try { io.fsyncSync(destination); } finally { io.closeSync(destination); }
        if (io.readFileSync(file, 'utf8') !== payload) throw Error('JSON write failed verification');
      } catch (copyError) {
        try {
          writeDurably(file, previous);
          if (io.readFileSync(file, 'utf8') !== previous) throw Error('JSON restoration failed verification');
        } catch {
          throw Error('JSON save and restoration failed; recovery copy retained');
        }
        throw copyError;
      }
    }
  } finally {
    if (created && io.existsSync(temporary)) {
      try { io.unlinkSync(temporary); }
      catch { /* A leftover recovery temporary must not turn a verified save into a duplicate retry. */ }
    }
  }
}
module.exports = { writeLocalJson };
