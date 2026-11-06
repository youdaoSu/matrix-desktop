const fs = require('node:fs');
const path = require('node:path');
function registerDesktopSettings({app,ipcMain,shell,Notification,getWindow,getAppUrl,readPerformance,fileSystem=fs}) {
  const file = () => path.join(app.getPath('userData'),'desktop-settings.json');
  const read = () => { try { const value=JSON.parse(fileSystem.readFileSync(file(),'utf8')); return {zoom:[0.8,0.9,1,1.1,1.2].includes(value.zoom)?value.zoom:1,...(typeof value.accessibility==='boolean'?{accessibility:value.accessibility}:{})}; } catch { return {zoom:1}; } };
  const save=patch=>{
    const next={...read(),...patch},temp=file()+'.tmp';fileSystem.writeFileSync(temp,JSON.stringify(next));
    try{fileSystem.renameSync(temp,file());}
    catch(error){
      if(error.code!=='EXDEV')throw error;
      // Recover only this validated preferences leaf on redirected profiles.
      fileSystem.copyFileSync(temp,file());
      if(Object.entries(next).some(([key,value])=>read()[key]!==value))throw Error('显示设置未正确保存，请重试');
      try{fileSystem.unlinkSync(temp);}catch{/* Harmless preferences temp file. */}
    }
  };
  const host = event => { const win=getWindow(); if (!win || event.sender.id!==win.webContents.id) throw Error('仅允许远效主窗口修改设置'); const url=new URL(win.webContents.getURL()); if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.origin!==new URL(getAppUrl()).origin)throw Error('仅允许远效本机界面修改设置');return win; };
  const info = () => ({version:app.isPackaged?app.getVersion():require('../package.json').version,electron:process.versions.electron,node:process.versions.node,platform:process.platform,arch:process.arch,packaged:app.isPackaged,zoom:read().zoom,accessibility:app.isAccessibilitySupportEnabled?.()||false,accessibilitySupported:typeof app.setAccessibilitySupportEnabled==='function',autoStart:app.isPackaged?app.getLoginItemSettings().openAtLogin:false,notificationsSupported:Notification.isSupported()});
  ipcMain.handle('matrix:system-settings',async(event,input={})=>{
    try {
      const win=host(event);
      if(input.command==='read')return info();
      if(input.command==='performance'){
        if(Object.keys(input).some(key=>key!=='command')||typeof readPerformance!=='function')throw Error('本机性能读取参数无效或当前版本不支持');
        return {performance:readPerformance()};
      }
      if(input.command==='zoom') {
        if(![0.8,0.9,1,1.1,1.2].includes(input.zoom))throw Error('缩放值无效');
        save({zoom:input.zoom});
        win.webContents.setZoomFactor(input.zoom);return info();
      }
      if(input.command==='accessibility') {
        if(typeof input.enabled!=='boolean'||typeof app.setAccessibilitySupportEnabled!=='function')throw Error('当前桌面环境不支持此无障碍设置');
        save({accessibility:input.enabled});app.setAccessibilitySupportEnabled(input.enabled);
        return info();
      }
      if(input.command==='auto-start') {
        if(!app.isPackaged)throw Error('开机启动仅在安装版中可设置');
        if(typeof input.enabled!=='boolean')throw Error('开机启动参数无效');
        app.setLoginItemSettings({openAtLogin:input.enabled,path:app.getPath('exe'),args:[]});
        if(app.getLoginItemSettings().openAtLogin!==input.enabled)throw Error('Windows 未确认开机启动设置，请检查系统启动应用权限');
        return info();
      }
      if(input.command==='releases') {await shell.openExternal('https://github.com/youdaoSu/yuanxiao/releases');return {opened:true};}
      if(input.command==='notify') {
        if(!Notification.isSupported())throw Error('当前系统不支持桌面通知');
        const labels={test:['远效通知测试','桌面通知已提交给 Windows；若未显示，请检查系统通知权限与勿扰模式。'],publish:['远效发布任务更新','发布任务有新的处理结果，请在任务记录中查看。'],reminder:['远效到期待办','有待处理的个人任务，请在远效中查看。']};
        if(!Object.hasOwn(labels,input.category))throw Error('通知类型无效');
        const [title,body]=labels[input.category];new Notification({title,body,silent:true}).show();return {requested:true};
      }
      throw Error('设置操作无效');
    }catch(error){return {error:error.message};}
  });
  return win=>{const settings=read();win.webContents.setZoomFactor(settings.zoom);if(typeof settings.accessibility==='boolean')app.setAccessibilitySupportEnabled?.(settings.accessibility);};
}
module.exports={registerDesktopSettings};
