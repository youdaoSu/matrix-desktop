// Static analysis of the explicitly designated installed program resources.
// Never require/evaluate the reference code, inspect its data, or change it.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),ts=require('typescript');
const install=path.resolve('D:\\Program Files\\小V猫\\resources\\app');
const file=path.join(install,'assets','app.min.js');
if(fs.statSync(file).size>20000000)throw Error('Reference bundle exceeds the bounded inspection size');
const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,false,ts.ScriptKind.JS);
if(tree.parseDiagnostics.length)throw Error('Reference bundle could not be parsed safely');
const strings=new Map(),calls=new Set(),subscriptions=new Set(),fields=new Map();
const literal=node=>node&&(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))?node.text:undefined;
const safe=value=>typeof value==='string'&&value.length>0&&value.length<=100&&!/[\r\n]|https?:|cookie|token|secret|password|authorization|license|授权码|密码|验证码/i.test(value);
const stack=[tree];
while(stack.length){
  const node=stack.pop(),value=literal(node);
  if(safe(value))strings.set(value,(strings.get(value)||0)+1);
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
    const method=node.expression.name.text,first=literal(node.arguments[0]),second=literal(node.arguments[1]);
    if(method==='getCall'&&safe(first)&&/publish|upload|task|draft|comment|message|group|account|发布|上传|任务|草稿|私信|评论/i.test(first))calls.add(first);
    if(method==='addListenter'&&safe(first)&&safe(second))subscriptions.add(`${first}:${second}`);
  }
  if(ts.isPropertyAssignment(node)||ts.isPropertySignature(node)){
    const name=node.name&&(ts.isIdentifier(node.name)?node.name.text:literal(node.name));
    if(safe(name)&&/^(?:publish|upload|task|draft|submit|retry|fail|success|progress|stage|status|step)[a-z0-9_]{0,50}$/i.test(name))fields.set(name,(fields.get(name)||0)+1);
  }
  ts.forEachChild(node,child=>{stack.push(child);});
}
const take=(pattern,max=60)=>[...strings].filter(([text])=>pattern.test(text)).sort((a,b)=>b[1]-a[1]).slice(0,max).map(([text,count])=>({text,count}));
const core=path.join(install,'server','server.jsc');
const report={inspectedAt:new Date().toISOString(),referenceVersion:JSON.parse(fs.readFileSync(path.join(install,'package.json'),'utf8')).version,
  resources:{frontEnd:{bytes:Buffer.byteLength(source),sha256:createHash('sha256').update(source).digest('hex')},core:{file:'server/server.jsc',bytes:fs.statSync(core).size,format:'bytenode bytecode; not executed or decompiled'},sourceMaps:fs.readdirSync(path.join(install,'assets')).filter(name=>name.endsWith('.map'))},
  labels:{modules:take(/^(?:一键发布|作品管理|账号管理|粉丝互动|数据监控|数据统计|评论管理|私信管理|本地草稿箱|任务记录|任务统计|自动评论|自动私信|批量任务)$/),
    stages:take(/^(?:等待|正在|准备|上传|转码|发布|发表|执行|任务|重发|暂停|完成|已发布|待发表|发表成功|发表失败|发布失败|发布成功)[\u4e00-\u9fff%\s/：:]{0,20}$/),
    validation:take(/(?:请(?:选择|填写|输入|上传|设置)|不能为空|上传失败|发布失败|文件过大|格式不支持|重发|上传进度|执行进度|批量暂停|修改时间)/)},
  interfaceClues:{calls:[...calls].sort(),subscriptions:[...subscriptions].sort(),fieldNames:[...fields].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([name,count])=>({name,count}))},
  limits:'Labels and call names show UI/interface intent, not proof of core scheduling, selectors, account permissions or successful submissions.',
  referenceCodeExecuted:false,completeCoreSourceRecovered:false,accountOrCredentialDataRead:false,referenceAppChanged:false,codeCopiedIntoMatrix:false};
const output=path.resolve(__dirname,'../logs/reference-workflows-latest.json');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({referenceVersion:report.referenceVersion,resources:report.resources,report:output,
  publishInterfaceClues:report.interfaceClues.calls.filter(name=>name.startsWith('PublishController.')||name.startsWith('Models.PublishLog.')),
  publishProgressClues:report.interfaceClues.subscriptions.filter(name=>name.startsWith('PublishController:')),
  limits:report.limits,referenceCodeExecuted:false,completeCoreSourceRecovered:false,accountOrCredentialDataRead:false,referenceAppChanged:false,codeCopiedIntoMatrix:false},null,2));
