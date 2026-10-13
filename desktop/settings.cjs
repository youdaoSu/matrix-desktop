const fs = require('node:fs');
const path = require('node:path');
function registerDesktopSettings({app,ipcMain,shell,Notification,getWindow,getAppUrl,fileSystem=fs}) {
  const file = () => path.join(app.getPath('userData'),'desktop-settings.json');
  const read = () => { try { const value=JSON.parse(fileSystem.readFileSync(file(),'utf8')); return {zoom:[0.8,0.9,1,1.1,1.2].includes(value.zoom)?value.zoom:1}; } catch { return {zoom:1}; } };
  const host = event => { const win=getWindow(); if (!win || event.sender.id!==win.webContents.id) throw Error('仅允许矩效主窗口修改设置'); const url=new URL(win.webContents.getURL()); if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.origin!==new URL(getAppUrl()).origin)throw Error('仅允许矩效本机界面修改设置');return win; };
  const info = () => ({version:app.isPackaged?app.getVersion():require('../package.json').version,electron:process.versions.electron,node:process.versions.node,platform:process.platform,arch:process.arch,packaged:app.isPackaged,zoom:read().zoom,autoStart:app.isPackaged?app.getLoginItemSettings().openAtLogin:false,notificationsSupported:Notification.isSupported()});
  ipcMain.handle('matrix:system-settings',async(event,input={})=>{
    try {
      const win=host(event);
      if(input.command==='read')return info();
      if(input.command==='zoom') {
        if(![0.8,0.9,1,1.1,1.2].includes(input.zoom))throw Error('缩放值无效');
        const temp=file()+'.tmp';fileSystem.writeFileSync(temp,JSON.stringify({zoom:input.zoom}));
        try { fileSystem.renameSync(temp,file()); }
        catch(error) {
          if(error.code!=='EXDEV')throw error;
          // Some Windows encrypted/redirected profiles cannot rename this leaf file.
          // Copy only this validated preferences file; never touch cookies or databases.
          fileSystem.copyFileSync(temp,file());
          if(read().zoom!==input.zoom)throw Error('缩放设置未正确保存，请重试');
          try { fileSystem.unlinkSync(temp); } catch { /* A leftover preferences temp file is harmless. */ }
        }
        win.webContents.setZoomFactor(input.zoom);return info();
      }
      if(input.command==='auto-start') {
        if(!app.isPackaged)throw Error('开机启动仅在安装版中可设置');
        if(typeof input.enabled!=='boolean')throw Error('开机启动参数无效');
        app.setLoginItemSettings({openAtLogin:input.enabled,path:app.getPath('exe'),args:[]});
        if(app.getLoginItemSettings().openAtLogin!==input.enabled)throw Error('Windows 未确认开机启动设置，请检查系统启动应用权限');
        return info();
      }
      if(input.command==='releases') {await shell.openExternal('https://github.com/youdaoSu/matrix-desktop/releases');return {opened:true};}
      if(input.command==='notify') {
        if(!Notification.isSupported())throw Error('当前系统不支持桌面通知');
        const labels={test:['矩效通知测试','桌面通知已提交给 Windows；若未显示，请检查系统通知权限与勿扰模式。'],publish:['矩效发布任务更新','发布任务有新的处理结果，请在任务记录中查看。'],reminder:['矩效到期待办','有待处理的个人任务，请在矩效中查看。']};
        if(!Object.hasOwn(labels,input.category))throw Error('通知类型无效');
        const [title,body]=labels[input.category];new Notification({title,body}).show();return {requested:true};
      }
      throw Error('设置操作无效');
    }catch(error){return {error:error.message};}
  });
  return win=>win.webContents.setZoomFactor(read().zoom);
}
module.exports={registerDesktopSettings};
