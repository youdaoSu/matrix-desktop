const assert=require('node:assert/strict');
const {acquireBackgroundTimerLease:acquire}=require('../desktop/background-timer-lease.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function contents(initial=true){let current=initial,destroyed=false;const changes=[];return{changes,getBackgroundThrottling:()=>current,setBackgroundThrottling:value=>{current=value;changes.push(value);},isDestroyed:()=>destroyed,destroy:()=>{destroyed=true;}};}
const first=contents(),one=acquire(first),two=acquire(first);eq(first.changes,[false]);one();one();eq(first.changes,[false]);two();eq(first.changes,[false,true]);two();eq(first.changes,[false,true]);
const next=acquire(first);eq(first.getBackgroundThrottling(),false);next();eq(first.getBackgroundThrottling(),true);
const unthrottled=contents(false),releaseUnthrottled=acquire(unthrottled);releaseUnthrottled();eq(unthrottled.getBackgroundThrottling(),false);
const other=contents(),releaseOther=acquire(other);other.setBackgroundThrottling(true);releaseOther();eq(other.changes,[false,true]);
const destroyed=contents(),releaseDestroyed=acquire(destroyed);destroyed.destroy();releaseDestroyed();eq(destroyed.changes,[false]);
const independent=contents(),a=acquire(first),b=acquire(independent);a();eq(first.getBackgroundThrottling(),true);eq(independent.getBackgroundThrottling(),false);b();eq(independent.getBackgroundThrottling(),true);
const fails=contents();fails.setBackgroundThrottling=()=>{throw Error('synthetic destroyed during acquisition');};assert.throws(()=>acquire(fails),/synthetic/);checks++;
acquire(undefined)();acquire({})();checks+=2;
console.log(JSON.stringify({passed:true,checks,referenceCounting:true,restoresPreviousSetting:true,noPlatformActions:true}));
