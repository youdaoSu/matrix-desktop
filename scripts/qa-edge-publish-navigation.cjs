const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const fixture=new Module('edge-navigation-fixture');
fixture._compile(ts.transpileModule(fs.readFileSync('client/src/components/workspace/edge-publish-navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'edge-navigation-fixture.cjs');
const {waitForEdgeNavigation}=fixture.exports;
(async()=>{
 let checks=0,polls=0,entryCalls=0;
 const completed=new Map([['old-login',{navigationRequestId:'old-login',navigationComplete:true}]]);
 await waitForEdgeNavigation('fresh-home',id=>completed.get(id),()=>{},async()=>{
  polls++;
  if(polls===1)completed.set('fresh-home',{navigationRequestId:'fresh-home',navigationComplete:false});
  if(polls===2)completed.set('unrelated',{navigationRequestId:'unrelated',navigationComplete:true});
  if(polls===3)completed.set('fresh-home',{navigationRequestId:'fresh-home',navigationComplete:true});
  assert.equal(entryCalls,0);
 });entryCalls++;
 assert.equal(polls,3);assert.equal(entryCalls,1);checks+=5;
 let sleeps=0;
 // Completion may precede the acknowledgement; a later title status must not
 // erase the retained, request-correlated completion.
 await waitForEdgeNavigation('fresh-home',id=>completed.get(id),()=>{},async()=>{sleeps++;});
 assert.equal(sleeps,0);checks++;
 await assert.rejects(waitForEdgeNavigation('new',()=>({navigationRequestId:'old-login',navigationComplete:true}),()=>{},async()=>{},3),/导航超时/);checks++;
 await assert.rejects(waitForEdgeNavigation('new',()=>({navigationRequestId:'new',navigationComplete:true,error:'官方页面加载失败'}),()=>{},async()=>{}),/官方页面加载失败/);checks++;
 await assert.rejects(waitForEdgeNavigation(undefined,()=>{throw Error('Must not read')},()=>{},async()=>{}),/导航标识/);checks++;
 let cancelled=false;
 await assert.rejects(waitForEdgeNavigation('new',()=>({navigationRequestId:'new',navigationComplete:cancelled}),()=>{if(cancelled)throw Error('stopped')},async()=>{cancelled=true}),/stopped/);checks++;
 await assert.rejects(waitForEdgeNavigation('new',()=>undefined,()=>{},async()=>{},2),/尚未上传或提交/);checks++;
 console.log(JSON.stringify({requestCorrelatedNavigationChecks:checks,oldLoginCompletionCannotAuthorizeEntry:true,lateTitleStatusCannotEraseCompletion:true,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
