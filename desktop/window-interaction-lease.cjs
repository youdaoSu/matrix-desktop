// Manual own-window movement only. No bounds/input capture, idle timer or
// preventDefault. Consumers defer historical reads, never receive-side ACKs.
function createWindowInteractionLease({now=Date.now,quietMs=400}={}){
 if(typeof now!=='function'||!Number.isFinite(quietMs)||quietMs<50||quietMs>1000)throw Error('Window interaction lease options invalid');
 let last=-Infinity,window,closed=false;
 const touch=()=>{last=now();};
 const detach=()=>{if(window){window.removeListener('will-move',touch);window.removeListener('will-resize',touch);window.removeListener('closed',detach);window=undefined;}last=-Infinity;};
 return {bind(win){detach();if(closed||!win||win.isDestroyed())return;window=win;win.on('will-move',touch);win.on('will-resize',touch);win.once('closed',detach);},paused(){const age=now()-last;return age>=0&&age<quietMs;},close(){closed=true;detach();}};
}
module.exports={createWindowInteractionLease};
