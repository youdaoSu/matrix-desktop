// Read-only account/group audit when the previous app has already exited.
// Only public binding metadata is read; no credentials or session contents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
const mode = process.argv[2];
assert.ok(['before','after'].includes(mode));
const release = process.argv[3] || 'rc39';
assert.match(release, /^rc\d{2,3}$/);
const owner = JSON.parse(fs.readFileSync('logs/installed-rc38-before.json','utf8')).ownerId;
assert.match(owner,/^[a-z0-9-]{16,80}$/i);
const sql = postgres('postgresql://matrix@127.0.0.1:35432/matrix_db',{max:1,connect_timeout:5});
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const accounts = await sql`select id,platform,nickname,avatar_url,platform_user_id,raw_data->>'connectorSessionId' as connector_session_id,group_id,account_remark from platform_accounts where user_id=${owner} order by id`;
  const groups = await sql`select id,group_name,is_default,color,sort_order from account_groups where user_id=${owner} order by id`;
  const report = {accountCount:accounts.length,groupCount:groups.length,accountsDigest:digest(accounts),groupsDigest:digest(groups),accountIds:accounts.map(a=>a.id)};
  if(mode==='before') fs.writeFileSync(`logs/installed-${release}-offline-before.json`,JSON.stringify(report,null,2));
  else {
    const before=JSON.parse(fs.readFileSync(`logs/installed-${release}-offline-before.json`,'utf8'));
    assert.deepEqual(report,before,'Saved bindings/groups changed during installation');
    fs.writeFileSync(`logs/installed-${release}-offline-after.json`,JSON.stringify({...report,sameBindingsAndGroups:true},null,2));
  }
  console.log(JSON.stringify({mode,accounts:accounts.length,groups:groups.length,bindingsAndGroupDigestVerified:mode==='after',readOnly:true}));
} finally { await sql.end(); }
