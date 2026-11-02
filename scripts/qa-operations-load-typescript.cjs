// Trusted candidate TS loader for isolated React tests, never the supplied app.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{root,projectRequire}=require('./qa-operations-paths.cjs'),ts=projectRequire('typescript');
function loadTs(relative,cache=new Map(),overrides=new Map()){
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('QA module outside candidate root');if(cache.has(file))return cache.get(file).exports;
 const module=new Module(file);module.filename=file;cache.set(file,module);module.require=name=>{
  if(overrides.has(name))return overrides.get(name);const target=name.startsWith('@shared/')?path.join(root,'shared',name.slice(8)):name.startsWith('@/')?path.join(root,'client/src',name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(file),name):undefined;
  if(target)for(const suffix of['','.ts','.tsx','/index.ts','/index.tsx'])if(/\.tsx?$/.test(target+suffix)&&(cache.has(target+suffix)||fs.existsSync(target+suffix)))return loadTs(target+suffix,cache,overrides);
  return projectRequire(name);
 };module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return module.exports;
}
module.exports={loadTs};
