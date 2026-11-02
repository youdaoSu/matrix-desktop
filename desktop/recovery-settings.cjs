const fs=require('node:fs'),path=require('node:path');
const MAIL_KEYS=new Set(['MATRIX_SMTP_HOST','MATRIX_SMTP_PORT','MATRIX_SMTP_SECURE','MATRIX_SMTP_USER','MATRIX_SMTP_PASSWORD','MATRIX_SMTP_FROM']);
const TEMPLATE='# Recovery SMTP. Edit locally; never share or upload this file.\r\n# Use an SMTP app authorization code, not your mailbox login password.\r\n# QQ: smtp.qq.com / 465 / true. Save and restart Matrix.\r\nMATRIX_SMTP_HOST=\r\nMATRIX_SMTP_PORT=465\r\nMATRIX_SMTP_SECURE=true\r\nMATRIX_SMTP_USER=\r\nMATRIX_SMTP_PASSWORD=\r\nMATRIX_SMTP_FROM=\r\n';
const mailFile=userData=>path.join(userData,'mail-settings.env');
function checkFile(file,f){const s=f.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>16384)throw Error('邮件配置文件无效；未读取内容');}
function readRecoveryMailSettings(userData,f=fs){
  try{
    const file=mailFile(userData);if(!f.existsSync(file))return{};checkFile(file,f);const result={};
    for(const raw of f.readFileSync(file,'utf8').split(/\r?\n/)){
      const line=raw.trim(),pos=line.indexOf('=');if(!line||line.startsWith('#')||pos<0)continue;
      const key=line.slice(0,pos).trim();if(!MAIL_KEYS.has(key))continue;
      let value=line.slice(pos+1).trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      result[key]=value;
    }return result;
  }catch{return{};} // Invalid mail settings disable mail, never app startup.
}
function registerRecoveryMailSettings({ipcMain,app,dialog,shell,getWindow,getAppUrl,fileSystem=fs}){
  let opening=false;
  ipcMain.handle('matrix:recovery-mail-settings',async event=>{
    let ownsOpening=false;
    try{
      const win=getWindow();if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('仅允许远效主窗口配置本机邮件服务');
      const url=new URL(win.webContents.getURL());if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.origin!==new URL(getAppUrl()).origin||url.pathname!=='/app/'||url.hash!=='#/forgot-password')throw Error('请在远效“忘记密码”页面操作');
      if(opening)throw Error('邮件配置窗口已在处理中');opening=true;ownsOpening=true;
      const answer=await dialog.showMessageBox(win,{type:'question',title:'配置本机邮件发送服务',message:'在本机打开 SMTP 配置文件？',detail:'请填写发信服务地址、发件邮箱和 SMTP 专用授权码。不会在软件界面读取或展示原有授权码，也不会修改登录密码、平台账号或业务数据。\n不要把配置文件或授权码发到聊天或上传。保存后需要重启远效才能生效。',buttons:['取消','打开本机配置'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return{cancelled:true};
      const file=mailFile(app.getPath('userData'));
      if(!fileSystem.existsSync(file)){try{fileSystem.writeFileSync(file,TEMPLATE,{encoding:'utf8',flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}}
      checkFile(file,fileSystem);if(await shell.openPath(file))throw Error('系统未能打开邮件配置文件，请使用本机文本编辑器打开；原设置未改变');
      return{opened:true,restartRequired:true};
    }catch(error){return{error:error.message};}finally{if(ownsOpening)opening=false;}
  });
}
module.exports={readRecoveryMailSettings,registerRecoveryMailSettings};
