const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { publicPageAction } = require('./page-action-lookup.cjs');
const { sanitizeOutcomeObservation } = require('./publish-outcome.cjs');

// Receipts are appended in journal order. Single-receipt lookups can stop at
// the newest matching row; history needs only its newest 80 rows. Keep partial
// UTF-8 lines as byte chunks until a newline is found, decoding each line once.
function scanRecent(fd, size, visit) {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = size, suffix = [], complete = true;
  const emit = prefix => {
    const line = suffix.length ? Buffer.concat([prefix, ...suffix.reverse()]).toString('utf8') : prefix.toString('utf8');
    suffix = [];
    return visit(line);
  };
  while (position > 0) {
    const length = Math.min(buffer.length, position);
    position -= length;
    let read = 0;
    while (read < length) {
      const count = fs.readSync(fd, buffer, read, length - read, position + read);
      if (!count) break;
      read += count;
    }
    // A concurrent truncation must not join bytes from opposite sides of a
    // missing extent, or populate the read-through cache from a partial scan.
    if (read < length) { complete = false; suffix = []; }
    let end = read;
    while (end > 0) {
      const newline = buffer.lastIndexOf(10, end - 1);
      if (newline < 0) break;
      if (emit(buffer.subarray(newline + 1, end))) return complete;
      end = newline;
    }
    if (end) suffix.push(Buffer.from(buffer.subarray(0, end)));
  }
  if (suffix.length) emit(Buffer.alloc(0));
  return complete;
}

// A bounded read-through cache, not another source of publication truth. Every
// query checks the actual file identity and revision; writes remain append-only.
function createJournal(directory) {
  const file = path.join(directory, 'page-actions.jsonl');
  const cache = new Map();
  let revision, cacheBytes = 0;
  const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  function invalidate() { cache.clear(); cacheBytes = 0; revision = undefined; }
  function query(kind, ownerId, id) {
    let stat;
    try { stat = fs.statSync(file, { bigint: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; invalidate(); return kind === 'find' ? undefined : []; }
    const version = stamp(stat), key = JSON.stringify([kind, ownerId, id]);
    if (version !== revision) { invalidate(); revision = version; }
    if (cache.has(key)) {
      const item = cache.get(key); cache.delete(key); cache.set(key, item);
      return JSON.parse(item.json).value;
    }
    let latest;
    const items = [], byId = new Map();
    const visit = line => {
      let value;
      try { value = JSON.parse(line); } catch { return; }
      if (!value || value.ownerId !== ownerId) return;
      if(kind==='pending-review'){
        if(!value.id)return;
        if(['comments','messages','withdraw'].includes(value.kind)&&!value.commentDeleted&&
          (['unknown','submitting'].includes(value.status)||value.pinResult?.status==='unknown'||value.commentManagement?.status==='unknown'))byId.set(value.id,value);
        else byId.delete(value.id);
      }
      else if (kind === 'list') { if (value.id) byId.set(value.id, value); }
      else if (value.id === id) {
        if (kind === 'find') { latest = value; return true; }
        items.push(value); return items.length === 80;
      }
    };
    // Do not materialize a second copy of the entire journal as a UTF-8 string
    // plus split lines. A cold query scans a fixed file extent in 64 KiB blocks.
    const fd = fs.openSync(file, 'r');
    let stable = false;
    try {
      const before = fs.fstatSync(fd, { bigint: true });
      let fullyRead = true;
      if (kind !== 'list'&&kind!=='pending-review') {
        fullyRead = scanRecent(fd, Number(before.size), visit);
        if (kind === 'history') items.reverse();
      } else {
        const buffer = Buffer.allocUnsafe(64 * 1024), decoder = new StringDecoder('utf8');
        let position = 0, pending = '';
        while (position < Number(before.size)) {
          const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
          if (!read) { fullyRead = false; break; }
          position += read; pending += decoder.write(buffer.subarray(0, read));
          let start = 0, end;
          while ((end = pending.indexOf('\n', start)) !== -1) { visit(pending.slice(start, end)); start = end + 1; }
          pending = pending.slice(start);
        }
        pending += decoder.end(); if (pending) visit(pending);
      }
      // Never cache a snapshot observed during another writer's append/replace.
      stable = fullyRead && version === stamp(before) && version === stamp(fs.fstatSync(fd, { bigint: true }));
      try { stable = stable && version === stamp(fs.statSync(file, { bigint: true })); }
      catch (error) { if (error.code !== 'ENOENT') throw error; stable = false; }
    } finally { fs.closeSync(fd); }
    const value = kind === 'pending-review'?[...byId.values()].map(publicPageAction):kind === 'find' ? latest : kind === 'list'
      ? [...byId.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 200).map(publicPageAction)
      : items.map((item, index) => ({ sequence: index + 1, at: item.recordedAt || item.verifiedAt || item.completedAt || item.createdAt, timeInferred: !item.recordedAt, status: item.status, checkpoint: item.checkpoint || 'legacy_record', clicked: item.clicked, acceptedAt: item.acceptedAt, resultSource: item.resultSource || 'unknown', message: item.message, verification: item.verification, evidence: item.evidence, identityReview: item.identityReview, resolution: item.resolution, outcomeObservation: sanitizeOutcomeObservation(item.outcomeObservation) }));
    if (stable) {
      const json = JSON.stringify({ value }), bytes = Buffer.byteLength(json);
      // At most 16 queries / 4 MiB, with no single result above 1 MiB cached.
      if (bytes <= 1024 * 1024) {
        while (cache.size >= 16 || cacheBytes + bytes > 4 * 1024 * 1024) {
          const first = cache.keys().next().value; cacheBytes -= cache.get(first).bytes; cache.delete(first);
        }
        cache.set(key, { json, bytes }); cacheBytes += bytes;
      }
    }
    return value;
  }
  return {
    write(record) {
      // Invalidate even if a failed append leaves a partial record behind.
      invalidate(); fs.mkdirSync(directory, { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ ...record, recordedAt: new Date().toISOString() }) + '\n', { encoding: 'utf8', mode: 0o600 });
    },
    find: (ownerId, id) => query('find', ownerId, id),
    history: (ownerId, id) => query('history', ownerId, id),
    list: ownerId => query('list', ownerId),
    pendingReviews: ownerId=>query('pending-review',ownerId),
  };
}

module.exports = { createJournal };
