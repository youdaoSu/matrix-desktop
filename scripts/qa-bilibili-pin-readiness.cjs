const assert=require('node:assert/strict');
const {createBilibiliFollowup}=require('../desktop/bilibili-followup.cjs');
const input={workId:'BV1qa0000001',nativeAccountKey:'12345',text:'inert fixture only',pin:true};
const root={rpid_str:'998877665544332211',oid:24680,type:1,mid:'12345',member:{mid:'12345'},root:0,parent:0,state:17,content:{message:input.text}};
let checks=0;
async function run(mode){
 const calls=[],delays=[];let pins=0,details=0,pinned=false;
 const request=async(method,route)=>{calls.push([method,route]);
  if(route.endsWith('/nav'))return{code:0,data:{isLogin:true,mid:12345}};
  if(route.endsWith('/view'))return{code:0,data:{bvid:input.workId,aid:24680,owner:{mid:12345}}};
  if(route.endsWith('/add'))return{code:0,data:{rpid_str:root.rpid_str,reply:root}};
  if(route.endsWith('/detail')){details++;if(mode==='missing'&&details<3)return{code:12006};if(mode==='auth')return{code:-101};return{code:0,data:{root:mode==='mismatch'?{...root,oid:99}:root}};}
  if(route.endsWith('/top')){pins++;if(mode==='lost')throw Error('lost');if(mode==='denied')return{code:-403};if(mode==='rate')return{code:-509};if(mode==='captcha')return{code:12015};if(mode==='forever'||pins===1)return{code:-404};pinned=true;return{code:0};}
  if(route.endsWith('/reply'))return{code:0,data:{upper:{mid:'12345'},replies:[],top:{upper:pinned?root:mode==='other'&&pins?{...root,rpid_str:'111'}:null}}};
  throw Error(route);
 };
 const result=await createBilibiliFollowup({request,sleep:async ms=>delays.push(ms)})(input,{beforeDispatch:async data=>{if(mode==='changed'&&data.operation==='pin'&&pins)throw Error('owner changed');}});
 assert.equal(calls.filter(x=>x[1].endsWith('/add')).length,1);checks++;
 if(['ready','missing'].includes(mode)){assert.equal(result.pin.status,'confirmed');assert.equal(pins,2);checks+=2;}
 else{assert.notEqual(result.pin.status,'confirmed');assert.equal(pins,mode==='forever'?4:1);checks+=2;}
 assert(delays.reduce((a,b)=>a+b,0)<=28000);checks++;
 return{mode,pins,details,delays,pinStatus:result.pin.status};
}
(async()=>{const results=[];for(const mode of ['ready','missing','forever','auth','mismatch','other','changed','lost','denied','rate','captcha'])results.push(await run(mode));console.log(JSON.stringify({passed:true,checks,results,realPlatformRequests:0}));})().catch(error=>{console.error(error);process.exitCode=1;});
