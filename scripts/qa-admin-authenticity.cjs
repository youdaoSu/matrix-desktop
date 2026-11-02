// Actual service with synthetic query spies and controlled cryptographic input.
// No database, credentials, platform requests, or real activation codes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{pgTable,uuid,text,timestamp}=require('drizzle-orm/pg-core'),{PgDialect}=require('drizzle-orm/pg-core');
const table=name=>pgTable(name,{id:uuid('id'),name:text('name'),status:text('status'),vipStatus:text('vip_status'),vipExpiresAt:timestamp('vip_expires_at'),createdAt:timestamp('created_at'),publishedAt:timestamp('published_at'),platform:text('platform')});
const schema={};for(const name of ['adminUsers','appUsers','vipPlans','activationCodes','platformAccounts','operationLogs','announcements','sensitiveWords','systemSettings','contentPosts'])schema[name]=table(name.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()));
const dialect=new PgDialect(),queries=[],inserted=[];let draws=0,dbPings=0,checks=0;
const db={execute(){dbPings++;throw Error('platform check must not ping database');},select(fields){const query={fields};queries.push(query);const chain={from(t){query.table=t;return chain;},where(v){query.where=dialect.sqlToQuery(v);return chain;},groupBy(v){query.group=typeof v?.toQuery==='function'?dialect.sqlToQuery(v):v;return chain;},orderBy(){return chain;},limit(){return Promise.resolve([{id:'p',name:'test plan'}]);},then(resolve,reject){return Promise.resolve([{count:0}]).then(resolve,reject);}};return chain;},insert(t){return{values(value){inserted.push({table:t,value});if(Array.isArray(value))return{returning:async()=>value.map((v,i)=>({...v,id:String(i),createdAt:new Date('2026-01-01')}))};return Promise.resolve();}};}};
const file=path.resolve(__dirname,'../server/modules/admin/admin.service.ts'),mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));const original=mod.require.bind(mod);
class BadRequestException extends Error{};mod.require=name=>{
 if(name==='@nestjs/common')return{Injectable:()=>value=>value,Inject:()=>()=>{},Logger:class{},BadRequestException,NotFoundException:class extends Error{},UnauthorizedException:class extends Error{},ConflictException:class extends Error{}};
 if(name==='@lark-apaas/fullstack-nestjs-core')return{DRIZZLE_DATABASE:'fixture'};
 if(name==='@server/database/schema'||name==='../../database/schema')return schema;
 if(name==='../auth/jwt-auth.guard')return{};
 if(name==='node:crypto')return{...require('node:crypto'),randomInt:n=>{assert.equal(n,36);draws++;return (draws-1)%36;}};
 return original(name);
};
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,file);
(async()=>{const service=new mod.exports.AdminService(db),result=await service.testConnection();assert.equal(result.success,false);assert.match(result.message,/未验证平台连接/);assert.equal(dbPings,0);checks+=3;
 const oldRandom=Math.random;Math.random=()=>{throw Error('insecure random used');};try{const codes=await service.generateCodes('qa','qa','p',2,'test',30,2);assert.equal(draws,32);assert.equal(codes.length,2);assert.match(codes[0].code,/^TEST-[A-Z0-9]{16}$/);assert.notEqual(codes[0].code,codes[1].code);assert.equal(inserted.length,2);checks+=5;}finally{Math.random=oldRandom;}
 queries.length=0;const overview=await service.getOverview();assert.equal(overview.followerGrowthAvailable,false);assert.deepEqual(overview.followerGrowthTrend,[]);assert.equal(overview.publishTrendBasis,'published-at-utc');assert.equal(overview.publishTrend.length,7);assert.equal(queries.length,7);checks+=5;
 const pub=queries.find(q=>q.table===schema.contentPosts);assert.ok(pub);assert.match(pub.where.sql,/published_at/);assert.match(pub.where.sql,/status/);assert.ok(pub.where.params.includes('published'));assert.match(pub.group.sql,/timezone\('UTC'/);assert.doesNotMatch(pub.where.sql,/created_at/);checks+=6;
 console.log(JSON.stringify({adminAuthenticityChecks:checks,cryptographicRandomUsed:true,platformNotFaked:true,followerGrowthNotInvented:true,publishTrendRealTimestamp:true,syntheticOnly:true,realRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
