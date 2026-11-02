// Synthetic encrypted owner indexes only. No real profile, credentials or I/O.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { boundArchive } = require('../desktop/douyin-inbox-cache.cjs');
const { createInteractionCache } = require('../desktop/douyin-interaction-cache.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-owner-index-qa-'));
let checks = 0; const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const key = crypto.randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString(text) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]); },
  decryptString(bytes) { const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8'); },
};
const config = { userData: directory, safeStorage, binding: 'QA-binding', userId: 'QA-user', accountId: 'QA-account' };
const binding = crypto.createHash('sha256').update(config.binding).digest('hex');
const file = path.join(directory, 'douyin-inbox', binding + '.owner.bin');
try {
  eq(boundArchive(config), undefined);
  eq(fs.existsSync(file), false);
  eq(boundArchive({ ...config, ownUid: '100' }).ownUid, '100');
  eq(boundArchive(config).ownUid, '100');
  const before = fs.readFileSync(file);
  const rejected = (options, code) => {
    assert.throws(() => boundArchive(options), error => error.message.includes('（' + code + '）') && !/PRIVATE|QA-binding|QA-user|[a-f0-9]{64}/.test(error.message)); checks++;
    eq(fs.readFileSync(file), before);
  };
  rejected({ ...config, io: { ...fs, lstatSync() { throw Object.assign(Error('PRIVATE_PATH'), { code: 'EACCES' }); } } }, 'stat/EACCES');
  rejected({ ...config, io: { ...fs, readFileSync() { throw Object.assign(Error('PRIVATE_PATH'), { code: 'EIO' }); } } }, 'read/EIO');
  rejected({ ...config, io: { ...fs, readFileSync() { throw Object.assign(Error('PRIVATE_PATH'), { code: 'PRIVATE_CODE' }); } } }, 'read/unknown');
  for (const stat of [{ isFile: () => false, isSymbolicLink: () => false, size: 10 }, { isFile: () => true, isSymbolicLink: () => true, size: 10 }, { isFile: () => true, isSymbolicLink: () => false, size: 8193 }, { isFile: () => true, isSymbolicLink: () => false, size: 0 }]) rejected({ ...config, io: { ...fs, lstatSync: () => stat } }, 'file');
  rejected({ ...config, safeStorage: { ...safeStorage, decryptString(bytes) { if (bytes.equals(before)) throw Error('PRIVATE_CRYPTO'); return safeStorage.decryptString(bytes); } } }, 'decrypt/roundtrip-ok');
  rejected({ ...config, safeStorage: { ...safeStorage, decryptString() { throw Error('PRIVATE_CRYPTO'); } } }, 'decrypt/roundtrip-failed');
  for (const [plain, code] of [['{', 'json'], ['null', 'version'], ['[]', 'version'], [JSON.stringify({ version: 2, binding, ownUid: '100' }), 'version'], [JSON.stringify({ version: 1, binding: 'PRIVATE_BINDING', ownUid: '100' }), 'binding'], [JSON.stringify({ version: 1, binding, ownUid: 'PRIVATE_OWNER' }), 'owner']]) rejected({ ...config, safeStorage: { ...safeStorage, decryptString: () => plain } }, code);
  assert.throws(() => boundArchive({ ...config, ownUid: '101' }), /身份.*不一致/); checks++; eq(fs.readFileSync(file), before);
  // Denied stat must not masquerade as "missing" and recreate an owner index.
  let writes = 0;
  rejected({ ...config, ownUid: '100', io: { ...fs, lstatSync() { throw Object.assign(Error('PRIVATE'), { code: 'EPERM' }); }, openSync() { writes++; throw Error('PRIVATE'); } } }, 'stat/EPERM');
  eq(writes, 0);
  eq(boundArchive(config).ownUid, '100');
  // Comments and followers must also separate actual file, crypto, JSON and
  // scope-validation failures. Never reinterpret a denied stat as empty data.
  const interaction = { directory: path.join(directory,'interactions'), scope: 'QA-scoped-comments', protect: safeStorage.encryptString, unprotect: safeStorage.decryptString };
  const cache = createInteractionCache(interaction);
  cache.merge({ records: [{platformId:'200',workId:'300',content:'QA-only'}], works: [{platformId:'300',title:'QA-work'}], complete: true });
  const interactionFile = path.join(interaction.directory,fs.readdirSync(interaction.directory)[0]);
  const interactionBefore = fs.readFileSync(interactionFile);
  const rejectedInteraction = (options, stage) => {
    assert.throws(() => createInteractionCache({...interaction,...options}), error => error.message.includes('（'+stage+'）') && !/PRIVATE|QA-only|QA-scoped|[a-f0-9]{64}/.test(error.message)); checks++;
    eq(fs.readFileSync(interactionFile),interactionBefore);
  };
  for (const method of ['mkdirSync','lstatSync','readFileSync']) {
    const stage = {mkdirSync:'prepare',lstatSync:'stat',readFileSync:'read'}[method];
    rejectedInteraction({io:{...fs,[method](){throw Object.assign(Error('PRIVATE_PATH'),{code:'EACCES'});}}},stage+'/EACCES');
    rejectedInteraction({io:{...fs,[method](){throw Object.assign(Error('PRIVATE_PATH'),{code:'PRIVATE_CODE'});}}},stage+'/unknown');
  }
  rejectedInteraction({unprotect(){throw Error('PRIVATE_CRYPTO');}},'decrypt');
  rejectedInteraction({unprotect:()=>'{PRIVATE'},'json');
  for(const value of [null,[],{version:2},{version:1,scope:'PRIVATE_SCOPE',records:[],works:[],complete:true}])rejectedInteraction({unprotect:()=>JSON.stringify(value)},'validate');
  for(const stat of [{isFile:()=>false,isSymbolicLink:()=>false,size:10},{isFile:()=>true,isSymbolicLink:()=>true,size:10},{isFile:()=>true,isSymbolicLink:()=>false,size:33*1024*1024}])rejectedInteraction({io:{...fs,lstatSync:()=>stat}},'file');
  eq(createInteractionCache(interaction).get().records[0].content,'QA-only');
  console.log(JSON.stringify({ checks, syntheticOnly: true, oldIndexBytePreserved: true, credentialsExported: false, platformRequests: 0 }));
} finally {
  assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('matrix-owner-index-qa-'));
  fs.rmSync(directory, { recursive: true });
}
