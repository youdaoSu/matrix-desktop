// Read-only structural inspection of the specifically user-designated installed
// app package. No AppData, account DB, cookies, auth messages or decryption.
const fs=require('node:fs'),path=require('node:path');
const root='D:\\Program Files\\小V猫\\resources\\app';
const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const reports=[];
for(const name of ['main.js','preload.js','publish.js','vcat_webview_preload.js']){
  const target=path.join(root,name);if(!fs.existsSync(target))continue;
  const stat=fs.statSync(target);if(stat.size>20000000)continue;
  const source=fs.readFileSync(target,'utf8');
  reports.push({file:name,bytes:stat.size,plainJavaScript:!source.includes('\u0000'),windowAPIs:['BrowserWindow','BrowserView','WebContentsView'].filter(value=>source.includes(value)),persistentPartitions:/persist:/.test(source),userAgentCustomization:/setUserAgent|userAgent\s*:/.test(source),nativeWebView2:/WebView2|msedgewebview2/.test(source),bytecodeLoader:/bytenode|\.jsc["']/.test(source)});
}
const asset=path.join(root,'assets','app.min.js');
const urls=new Set();
if(fs.existsSync(asset)&&fs.statSync(asset).size<20000000){
  const source=fs.readFileSync(asset,'utf8');
  for(const match of source.matchAll(/https:\/\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_./%#?-]*)?/g)){
    try{const url=new URL(match[0]);if(/(?:weixin\.qq\.com|douyin\.com|kuaishou\.com|bilibili\.com|xiaohongshu\.com|toutiao\.com|baidu\.com|zhihu\.com|jd\.com|pinduoduo\.com|goofish\.com|taobao\.com|smzdm\.com|alipay\.com|jinritemai\.com|taptap\.(?:com|cn)|xiaoheihe\.cn|weibo\.(?:com|cn)|oceanengine\.com|doubao\.com|hongguoduanju\.com|fanqie.*\.com)$/.test(url.hostname))urls.add(url.origin+url.pathname);}catch{}
  }
}
console.log(JSON.stringify({installPath:path.dirname(path.dirname(root)),package:{name:metadata.name,version:metadata.version,main:metadata.main,license:metadata.license},files:reports,publicOfficialEntries:[...urls].sort(),accountDataRead:false,decrypted:false,sourceCopied:false},null,2));
