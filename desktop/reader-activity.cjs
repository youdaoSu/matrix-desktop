// Only read-only collector windows call this helper. Keep their DOM, cookies,
// cursors and network policy intact; do not throttle publishers or IM sockets.
const activity=new WeakMap();
function setReaderActive(win,active){
  if(!win||win.isDestroyed()||typeof win.webContents?.setBackgroundThrottling!=='function')return;
  const value=!!active;if(activity.get(win)===value)return;
  try{
    win.webContents.setBackgroundThrottling(!value);
    // show:false windows initially paint as visible in Electron. Throttling alone
    // leaves their animation frames running. Re-hide only an already-hidden,
    // idle collector; resuming disables throttling without replacing its page.
    if(!value&&typeof win.isVisible==='function'&&!win.isVisible()&&typeof win.hide==='function')win.hide();
    activity.set(win,value);
  }catch(error){activity.delete(win);throw error;}
}
module.exports={setReaderActive};
