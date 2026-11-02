// Full HTTP + TLS SMTP regression in a newly created disposable database.
// Never uses installed accounts, real mailboxes or the user's password.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { createRecoverySmtp } from './qa-recovery-smtp.mjs';
import { recoveryUi } from './qa-password-recovery-ui.mjs';

const config={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};
const source=new URL(config.SUDA_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(source.hostname));
const name='matrix_recovery_qa_'+Date.now();assert.match(name,/^matrix_recovery_qa_\d+$/);
const qaUrl=new URL(source);qaUrl.pathname='/'+name;
const admin=postgres(source.toString(),{max:1});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-recovery-qa-'));
const base='http://127.0.0.1:3296';
let sql,server,smtp,created=false,tail='',csrf,checks=0;
const secret=randomBytes(48).toString('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await pause(50);}throw Error(label);}
async function start(mail=true){
  server=spawn(process.execPath,['dist/server/main.js'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,...config,NODE_ENV:'production',MATRIX_DESKTOP:'1',SUDA_DATABASE_URL:qaUrl.toString(),MIAODA_APP_TYPE:'3',MIAODA_LOCAL_DEV:'1',SERVER_HOST:'127.0.0.1',SERVER_PORT:'3296',FORCE_AUTHN_INNERAPI_DOMAIN:base,MIAODA_CACHE_URL:'',JWT_SECRET:secret,TOKEN_ENCRYPTION_KEY:secret,OAUTH_STATE_SECRET:secret,MATRIX_RECOVERY_SECRET:secret,MATRIX_SMTP_HOST:'localhost',MATRIX_SMTP_PORT:String(smtp.port),MATRIX_SMTP_SECURE:'true',MATRIX_SMTP_USER:'isolated-fixture',MATRIX_SMTP_PASSWORD:mail?'isolated-fixture-only':'',MATRIX_SMTP_FROM:'noreply@matrix.local.test',NODE_EXTRA_CA_CERTS:smtp.cert}});
  server.stdout.on('data',data=>{tail=(tail+data).slice(-3000);});server.stderr.on('data',data=>{tail=(tail+data).slice(-3000);});
  await wait(async()=>{if(server.exitCode!==null)throw Error('Isolated recovery server stopped');try{return(await fetch(base+'/app/')).ok;}catch{return false;}},'Recovery test server unavailable');
  const page=await fetch(base+'/app/');csrf=/suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie')||'')?.[1];assert.ok(csrf);
}
async function stop(){if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}server=undefined;}
async function api(method,route,body,token,expected=200){
  const response=await fetch(base+route,{method,headers:{cookie:'suda-csrf-token='+csrf,'x-suda-csrf-token':csrf,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();
  if(response.status===500&&expected!==500){const diagnostic=String(result.error?.cause||result.error?.stack||'').replaceAll(source.password||'__none__','[redacted]').slice(0,1000);console.error('Isolated API diagnostic: '+diagnostic);}
  assert.equal(response.status,expected,route+': '+JSON.stringify(result.error?.message||result.message||'unexpected response'));return result.data;
}
let userIndex=0;
async function user(){const username='recover_'+Date.now()+'_'+(++userIndex),email=username+'@local.test',password='Before-'+randomBytes(10).toString('hex');await api('POST','/api/auth/register',{username,email,password},undefined,201);const login=await api('POST','/api/auth/login',{username,password});return{username,email,password,id:login.user.id,token:login.token};}
async function loosenRates(){await sql`UPDATE password_recovery_challenges SET created_at=CURRENT_TIMESTAMP-interval '2 hours'`;}
async function request(u){return api('POST','/api/auth/password-recovery/request',{username:u.username,email:u.email},undefined,202);}
async function code(u,requestId){
  let found;await wait(async()=>{const [row]=await sql`SELECT send_state FROM password_recovery_challenges WHERE id=${requestId}`;found=smtp.mails.filter(m=>m.recipient===u.email).map(m=>/验证码：(\d{6})/.exec(m.text)?.[1]).filter(Boolean).at(-1);return row?.send_state==='sent'&&found;},'TLS fixture code was not accepted');return found;
}
async function finish(r,c,password,expected=200,confirmPassword=password){return api('POST','/api/auth/forgot-password',{requestId:r.requestId,code:c,newPassword:password,confirmPassword},undefined,expected);}
try{
  await admin.unsafe('CREATE DATABASE "'+name+'"');created=true;sql=postgres(qaUrl.toString(),{max:6});
  const schema=fs.readFileSync('desktop/database-schema.sql','utf8').replace(/^\\.*$/gm,'').replace(/^GRANT[^;]*;/gm,'');await sql.unsafe(schema);
  await sql.unsafe('SET search_path TO public');
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO "anon_", "authenticated_", "service_role_"; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "anon_", "authenticated_", "service_role_"; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "anon_", "authenticated_", "service_role_";');
  // Exercise the additive upgrade path, not just a new-schema installation.
  await sql.unsafe('ALTER TABLE public.app_users DROP COLUMN auth_version');
  smtp=await createRecoverySmtp(profile);await start();
  const status=await api('GET','/api/auth/password-recovery/status');assert.equal(status.emailAvailable,true);checks++;
  const a=await user(),other=await user();
  const [account]=await sql`INSERT INTO platform_accounts(user_id,platform,nickname,raw_data) VALUES(${a.id},'douyin','QA preserved',${sql.json({provider:'desktop-connector',connectorSessionId:randomUUID()})}) RETURNING id`;
  await sql`INSERT INTO account_groups(user_id,group_name) VALUES(${a.id},'QA preserved group')`;
  await sql`INSERT INTO content_posts(user_id,account_id,platform,title,status) VALUES(${a.id},${account.id},'douyin','QA preserved draft','draft')`;
  const snapshot=async()=>JSON.stringify({accounts:await sql`SELECT * FROM platform_accounts WHERE user_id=${a.id} ORDER BY id`,groups:await sql`SELECT * FROM account_groups WHERE user_id=${a.id} ORDER BY id`,drafts:await sql`SELECT * FROM content_posts WHERE user_id=${a.id} ORDER BY id`});
  const before=await snapshot();
  const r=await request(a),c=await code(a,r.requestId);
  assert.deepEqual(Object.keys(r).sort(),['cooldownSeconds','expiresInSeconds','message','requestId']);checks++;
  const [stored]=await sql`SELECT code_hash,attempts FROM password_recovery_challenges WHERE id=${r.requestId}`;
  assert.match(stored.code_hash,/^[a-f0-9]{64}$/);assert.notEqual(stored.code_hash,c);checks+=2;
  await api('POST','/api/auth/password-recovery/request',{username:a.username,email:a.email},undefined,429);checks++;
  const newPassword='After-'+randomBytes(12).toString('hex');
  await finish(r,c,newPassword,400,'different-password');checks++;
  await finish(r,c,'汉'.repeat(25),400);checks++;
  await finish(r,c,a.password,400);checks++;
  const wrong=c==='000000'?'000001':'000000';await finish(r,wrong,newPassword,400);checks++;
  const outcomes=await Promise.all([0,1].map(async()=>{const response=await fetch(base+'/api/auth/forgot-password',{method:'POST',headers:{cookie:'suda-csrf-token='+csrf,'x-suda-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({requestId:r.requestId,code:c,newPassword,confirmPassword:newPassword})});return response.status;}));
  assert.deepEqual(outcomes.sort(),[200,400]);checks++;
  await finish(r,c,'Other-'+randomBytes(10).toString('hex'),400);checks++;
  await api('GET','/api/auth/me',undefined,a.token,401);checks++;
  const legacy=jwt.sign({userId:a.id,role:'user',username:a.username},secret,{expiresIn:'1h'});await api('GET','/api/auth/me',undefined,legacy,401);checks++;
  await api('GET','/api/auth/me',undefined,other.token);checks++;
  await api('POST','/api/auth/login',{username:a.username,password:a.password},undefined,401);checks++;
  await api('POST','/api/auth/login',{username:a.username,password:newPassword});checks++;
  assert.equal(await snapshot(),before);checks++;
  const logs=await sql`SELECT detail FROM operation_logs WHERE action='reset_password_email' AND operator_id=${a.id}`;assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes(c));assert.ok(!JSON.stringify(logs).includes(newPassword));checks+=3;
  await loosenRates();const unknown={username:'absent_'+Date.now(),email:'absent@local.test'},u=await request(unknown);assert.deepEqual(Object.keys(u).sort(),Object.keys(r).sort());assert.equal(u.message,r.message);await finish(u,'123456',newPassword,400);checks+=3;
  const [noop]=await sql`SELECT user_id,send_state FROM password_recovery_challenges WHERE id=${u.requestId}`;assert.equal(noop.user_id,null);assert.equal(noop.send_state,'noop');checks+=2;
  await loosenRates();const resend=await request(other),oldCode=await code(other,resend.requestId);await loosenRates();const resend2=await request(other),nextCode=await code(other,resend2.requestId);await finish(resend,oldCode,newPassword,400);await finish(resend2,nextCode,newPassword);checks+=2;
  const attemptsUser=await user();await loosenRates();const limited=await request(attemptsUser),limitedCode=await code(attemptsUser,limited.requestId);
  for(let i=0;i<5;i++)await finish(limited,limitedCode==='999999'?'999998':'999999',newPassword,400);
  const [locked]=await sql`SELECT attempts,consumed_at FROM password_recovery_challenges WHERE id=${limited.requestId}`;assert.equal(locked.attempts,5);assert.ok(locked.consumed_at);checks+=2;
  await stop();await start();await finish(limited,limitedCode,newPassword,400);await api('POST','/api/auth/login',{username:attemptsUser.username,password:attemptsUser.password});checks+=2;
  await loosenRates();const expired=await request(attemptsUser),expiredCode=await code(attemptsUser,expired.requestId);await sql`UPDATE password_recovery_challenges SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=${expired.requestId}`;await finish(expired,expiredCode,newPassword,400);checks++;
  await loosenRates();const changing=await request(attemptsUser),changingCode=await code(attemptsUser,changing.requestId);await sql`UPDATE app_users SET email='changed@local.test' WHERE id=${attemptsUser.id}`;await finish(changing,changingCode,newPassword,400);checks++;
  const active=await user();await loosenRates();const good=await request(active),goodCode=await code(active,good.requestId);await loosenRates();await request({...active,email:'wrong@local.test'});await finish(good,goodCode,newPassword);checks++;
  const disabled=await user();await loosenRates();const dr=await request(disabled),dc=await code(disabled,dr.requestId);await sql`UPDATE app_users SET status='disabled' WHERE id=${disabled.id}`;await finish(dr,dc,newPassword,400);checks++;
  const failed=await user();await loosenRates();smtp.reject(true);const fr=await request(failed);await wait(async()=>{const [row]=await sql`SELECT send_state FROM password_recovery_challenges WHERE id=${fr.requestId}`;return row.send_state==='failed';},'SMTP rejection did not remain failed');await api('POST','/api/auth/login',{username:failed.username,password:failed.password});checks++;smtp.reject(false);
  await loosenRates();const hourly=await user();
  for(let i=0;i<5;i++){const hr=await request(hourly);await code(hourly,hr.requestId);await sql`UPDATE password_recovery_challenges SET created_at=CURRENT_TIMESTAMP-interval '61 seconds' WHERE id=${hr.requestId}`;}
  await api('POST','/api/auth/password-recovery/request',{username:hourly.username,email:hourly.email},undefined,429);checks++;
  await loosenRates();for(let i=0;i<10;i++)await request({username:'ip_fixture_'+Date.now()+'_'+i,email:'absent@local.test'});
  const spoofed=await fetch(base+'/api/auth/password-recovery/request',{method:'POST',headers:{cookie:'suda-csrf-token='+csrf,'x-suda-csrf-token':csrf,'content-type':'application/json','x-forwarded-for':'192.0.2.15'},body:JSON.stringify({username:'another_absent',email:'absent@local.test'})});
  assert.equal(spoofed.status,429);checks++;
  if(process.argv.includes('--ui')){
    await loosenRates();const uiUser=await user(),uiPassword='UiReset-'+randomBytes(10).toString('hex');
    await recoveryUi({base,profile,user:uiUser,password:uiPassword,getCode:async()=>{const [row]=await sql`SELECT id FROM password_recovery_challenges WHERE user_id=${uiUser.id} ORDER BY created_at DESC LIMIT 1`;assert.ok(row);return code(uiUser,row.id);}});
    await api('POST','/api/auth/login',{username:uiUser.username,password:uiPassword});checks++;
  }
  await stop();await start(false);const unconfigured=await api('GET','/api/auth/password-recovery/status');assert.equal(unconfigured.emailAvailable,false);assert.equal(unconfigured.configured,false);await api('POST','/api/auth/password-recovery/request',{username:a.username,email:a.email},undefined,503);checks+=3;
  await api('POST','/api/auth/forgot-password',{username:a.username,email:a.email,newPassword:'unsafe-password'},undefined,400);checks++;
  assert.equal(await snapshot(),before);checks++;
  console.log(JSON.stringify({passwordRecoveryIntegrationChecks:checks,realTlsSmtpFixture:true,atomicSingleUse:true,oldSessionsRevoked:true,wrongResendDoesNotInvalidateLegitimateCode:true,attemptLimitsPersistAcrossRestart:true,boundEmailChangeBlocked:true,originalPlatformDataPreserved:true,realEmailsSent:false,installedUserPasswordsChanged:false}));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
  await stop();await smtp?.close();await sql?.end();
  if(created){await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;await admin.unsafe('DROP DATABASE "'+name+'"');}await admin.end();
}
