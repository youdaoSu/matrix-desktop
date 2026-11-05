const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createJournal } = require('../desktop/page-action-journal.cjs');
const { publicPageAction } = require('../desktop/page-action-lookup.cjs');
const { sanitizeOutcomeObservation } = require('../desktop/publish-outcome.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-journal-tail-'));
const file = path.join(directory, 'page-actions.jsonl');
const originalRead = fs.readSync;
let checks = 0, bytes = 0, calls = 0, shortReads = false, afterRead;
fs.readSync = function (fd, buffer, offset, length, position) {
  const count = originalRead.call(fs, fd, buffer, offset, shortReads ? Math.min(997, length) : length, position);
  bytes += count; calls++;
  const callback = afterRead; afterRead = undefined; callback?.();
  return count;
};
const row = (id, extra = {}) => ({ ownerId: 'a', id, status: 'unknown', message: '中文😀数据', createdAt: '2026-10-30T01:02:03Z', ...extra });
// Deliberately simple whole-file forward reference, independent of chunking.
function reference(kind, owner, id) {
  const records = fs.readFileSync(file, 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }).filter(value => value && value.ownerId === owner);
  if (kind === 'find') return records.filter(value => value.id === id).at(-1);
  if (kind === 'list') return [...new Map(records.filter(value => value.id).map(value => [value.id, value])).values()].sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0,200).map(publicPageAction);
  return records.filter(value => value.id === id).slice(-80).map((item,index) => ({ sequence:index+1,at:item.recordedAt||item.verifiedAt||item.completedAt||item.createdAt,timeInferred:!item.recordedAt,status:item.status,checkpoint:item.checkpoint||'legacy_record',clicked:item.clicked,acceptedAt:item.acceptedAt,resultSource:item.resultSource||'unknown',message:item.message,verification:item.verification,evidence:item.evidence,identityReview:item.identityReview,resolution:item.resolution,outcomeObservation:sanitizeOutcomeObservation(item.outcomeObservation) }));
}
function compare(journal, kind, owner, id) { assert.deepEqual(journal[kind](owner,id),reference(kind,owner,id)); checks++; }
try {
  const history = Array.from({length:12000},(_,i) => row(String(i%137), { ownerId:i%7===0?'b':'a',message:`${i}:😀中文`,evidence:{title:'synthetic'},createdAt:new Date(1700000000000+i*1000).toISOString(),payload:'x'.repeat(250) }));
  fs.writeFileSync(file,history.map(JSON.stringify).join('\n')+'\n');
  const journal = createJournal(directory);
  for (const owner of ['a','b','absent']) for (const id of ['0','14','136','missing']) {
    compare(journal,'find',owner,id); compare(journal,'history',owner,id);
  }
  compare(journal,'list','a');compare(journal,'list','b');
  const detached=journal.find('a','136');detached.evidence.title='mutated';compare(journal,'find','a','136');
  const recent = row('recent',{status:'confirmed'});
  journal.write(recent); bytes=0;calls=0;
  assert.equal(journal.find('a','recent').status,'confirmed');
  const tailBytes=bytes,tailCalls=calls,totalBytes=fs.statSync(file).size;
  assert(tailBytes<=65536&&tailBytes<totalBytes/50);checks+=2;
  const cachedCalls=calls;journal.find('a','recent');assert.equal(calls,cachedCalls);checks++;
  // Every byte of a four-byte emoji straddles a reverse chunk boundary.
  const target=JSON.stringify(row('boundary',{message:'😀中文测试'}));
  const emoji=Buffer.from(target).indexOf(Buffer.from('😀'));
  for (let split=0;split<=4;split++) {
    const padding=65536-(Buffer.byteLength(target)-emoji-split);
    fs.writeFileSync(file,Buffer.concat([Buffer.from(target),Buffer.from('\n'+' '.repeat(padding-1))]));
    compare(createJournal(directory),'find','a','boundary');
  }
  for(const ending of ['','\n','\r\n']) {
    fs.writeFileSync(file,JSON.stringify(row('long',{message:'😀'.repeat(70000)}))+ending);
    compare(createJournal(directory),'find','a','long');compare(createJournal(directory),'history','a','long');
  }
  const malformed=['null','123','"text"','{broken','',JSON.stringify(row('other',{ownerId:'b'}))];
  fs.writeFileSync(file,[JSON.stringify(row('first')), ...malformed,JSON.stringify(row('last'))].join('\n'));
  for(const id of ['first','last','absent'])compare(createJournal(directory),'find','a',id);
  // Complete interrupted UTF-8 and valid-but-unterminated JSON in later writes.
  const encoded=Buffer.from(JSON.stringify(row('partial'))+'\n'),cut=encoded.indexOf(Buffer.from('中'))+1;
  fs.appendFileSync(file,'\n');fs.appendFileSync(file,encoded.subarray(0,cut));
  const partial=createJournal(directory);assert.equal(partial.find('a','partial'),undefined);checks++;
  fs.appendFileSync(file,encoded.subarray(cut));compare(partial,'find','a','partial');
  for(let i=0;i<100;i++)partial.write(row('same',{message:String(i)}));
  compare(partial,'history','a','same');assert.equal(partial.history('a','same')[0].message,'20');checks++;
  shortReads=true;compare(createJournal(directory),'history','a','same');shortReads=false;
  // A write/replacement during a read may yield a snapshot, but never a warm
  // cache that hides the next query's actual durable state.
  const changing=createJournal(directory);
  afterRead=()=>fs.appendFileSync(file,JSON.stringify(row('same',{status:'failed'}))+'\n');
  changing.find('a','same');compare(changing,'find','a','same');
  afterRead=()=>fs.truncateSync(file,0);
  createJournal(directory).find('a','first');assert.equal(createJournal(directory).find('a','first'),undefined);checks++;
  fs.writeFileSync(file,JSON.stringify(row('replacement'))+'\n');
  const replacing=createJournal(directory);
  replacing.find('a','replacement');
  // Live-file rename returned EPERM on this Windows host. Preserve the failed
  // run and leave that scenario unverified; do not retry through another API.
  fs.writeFileSync(file,JSON.stringify(row('new'))+'\n');
  compare(replacing,'find','a','new');compare(replacing,'find','a','replacement');
  // Pending receipts are independent of the display cap, owner scoped and
  // removed once a newer durable state resolves the original action.
  const backlog=createJournal(directory);
  const old={id:'older-pin',ownerId:'a',kind:'comments',status:'confirmed',pinResult:{status:'unknown'},createdAt:'2025-01-01'};
  backlog.write(old);backlog.write({...old,ownerId:'b',id:'foreign'});
  for(let i=0;i<201;i++)backlog.write({...old,id:'later-'+i,pinResult:{status:'confirmed'},createdAt:'2026-01-01'});
  assert(!backlog.list('a').some(r=>r.id===old.id));assert.deepEqual(backlog.pendingReviews('a').map(r=>r.id),[old.id]);checks+=2;
  backlog.write({...old,pinResult:{status:'confirmed'}});assert.equal(backlog.pendingReviews('a').length,0);checks++;
  const before=fs.readFileSync(file);replacing.find('a','new');replacing.history('a','new');replacing.list('a');assert.deepEqual(fs.readFileSync(file),before);checks++;
  fs.unlinkSync(file);assert.equal(replacing.find('a','new'),undefined);checks++;
  console.log(JSON.stringify({journalTailChecks:checks,syntheticRows:history.length,latestColdReadBytes:tailBytes,latestColdReadCalls:tailCalls,journalBytes:totalBytes,liveFileReplacementVerified:false,realAccountActions:false}));
} finally {
  fs.readSync=originalRead;
  if(path.dirname(fs.realpathSync(directory))!==fs.realpathSync(os.tmpdir())||!path.basename(directory).startsWith('matrix-journal-tail-'))throw Error('Unexpected QA cleanup target');
  fs.rmSync(directory,{recursive:true,force:true});
}
