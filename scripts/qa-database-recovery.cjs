// Pure mocks/new streams only: never starts/stops a database or real app.
const assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {recoverOwnedDatabase,cleanupResources}=require('../desktop/database-recovery.cjs');
const {createEdgeTransport}=require('../desktop/edge-embed.cjs');
const dataDir=path.resolve('QA only/中文 路径/database'),pgCtl=path.resolve('QA only/pg_ctl.exe'),psql=path.resolve('QA only/psql.exe'),bin=path.dirname(pgCtl);
let checks=0;
async function scenario({status=0,marker,actual=dataDir,queryFailure=false,databaseName}={}){
 const calls=[],reads=[];
 const result=await recoverOwnedDatabase({pgCtl,psql,dataDir,bin,databaseName,files:{realpathSync:value=>path.resolve(value),readFileSync:file=>{reads.push(file);return marker??`12345\n${dataDir}\n123456\n35432\n`; }},runProcess:async(file,args,options)=>{
  calls.push({file,args,options});
  if(file===pgCtl){assert.equal(args.at(-1),'status');assert.equal(options.timeout,5000);if(status!==0)throw Object.assign(Error('status failure'),{exitCode:status});return 'owned server running';}
  assert.equal(file,psql);assert.equal(args[args.indexOf('-h')+1],'127.0.0.1');assert.ok(args.includes('-w'));assert.ok(args.includes('-X'));assert.equal(args[args.indexOf('-d')+1],databaseName||'matrix_db');assert.equal(args.at(-1),"SELECT current_setting('data_directory');");assert.equal(options.env.PGCONNECT_TIMEOUT,'5');assert.equal(options.timeout,10000);
  if(queryFailure)throw Error('query failed');return actual+'\n';
 }});
 return {result,calls,reads};
}
(async()=>{
 const stopped=await scenario({status:3});assert.equal(stopped.result,null);assert.equal(stopped.calls.length,1);assert.equal(stopped.reads.length,0);checks+=3;
 for(const code of [1,2,null,undefined]){await assert.rejects(()=>scenario({status:code===undefined?'spawn-error':code}),/无法确认/);checks++;}
 const recovered=await scenario();assert.deepEqual(recovered.result,{pgCtl,dataDir,bin,port:35432});assert.equal(recovered.calls.length,2);assert.equal(recovered.reads.length,1);checks+=3;
 const fresh=await scenario({databaseName:'postgres'});assert.equal(fresh.result.port,35432);assert.equal(fresh.calls.at(-1).args[fresh.calls.at(-1).args.indexOf('-d')+1],'postgres');checks+=2;
 for(const databaseName of ['foreign','matrix_db; DROP DATABASE postgres','']){await assert.rejects(()=>scenario({databaseName}),/参数/);checks++;}
 for(const marker of [`0\n${dataDir}\n123\n35432\n`,`12345\n${dataDir}\n123\n9999\n`,`12345\n${dataDir}\n123\n35452\n`,`12345\n${dataDir}\n123\n35432.5\n`,`12345\n${dataDir}-foreign\n123\n35432\n`,'x'.repeat(4097)]){await assert.rejects(()=>scenario({marker}),/归属信息/);checks++;}
 for(const actual of [dataDir+'-foreign',dataDir+'\nforeign','']){await assert.rejects(()=>scenario({actual}),/归属核验失败/);checks++;}
 await assert.rejects(()=>scenario({queryFailure:true}),/归属核验失败/);checks++;
 const order=[];assert.deepEqual(cleanupResources([['preview',()=>{order.push('preview');throw Error('never-return-secret');}],['native',()=>{order.push('native');throw Error('EPIPE');}],['server',()=>order.push('server')],['database',()=>order.push('database')]]),['preview','native']);assert.deepEqual(order,['preview','native','server','database']);checks+=2;
 assert.deepEqual(cleanupResources([['database',()=>{throw Error('stop timed out');}]]),['database']);checks++;
 const closeMessages=[],child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(chunk,encoding,done){closeMessages.push(JSON.parse(chunk.toString()).command);done();}});
 const transport=createEdgeTransport(child,{timeout:100});transport.close();transport.close();assert.deepEqual(closeMessages,['close']);await assert.rejects(transport.request('profile'),/已关闭/);checks+=2;
 for(const synchronous of [false,true]){
  const broken=new EventEmitter();broken.stdout=new PassThrough();broken.stderr=new PassThrough();broken.stdin=new Writable({write(_chunk,_encoding,done){done(Object.assign(Error('broken pipe'),{code:'EPIPE'}));}});
  if(synchronous)broken.stdin.write=()=>{throw Object.assign(Error('broken pipe'),{code:'EPIPE'});};
  const pipe=createEdgeTransport(broken,{timeout:100});await assert.rejects(pipe.request('profile'),/已关闭/);assert.doesNotThrow(()=>pipe.close());await new Promise(resolve=>setImmediate(resolve));checks+=2;
 }
 console.log(JSON.stringify({databaseRecoveryAndShutdownChecks:checks,localClusterVerifiedBeforeReuse:true,noBlindRestart:true,noPidDeletionOrAclChange:true,nativePipeErrorsContained:true,databasesOrServicesStarted:false,realUserDataTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
