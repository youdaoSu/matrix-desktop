// Compile the candidate as an in-memory overlay. No source repo edits/emits.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {projectRoot:root,root:stage,projectRequire}=require('./qa-operations-paths.cjs'),ts=projectRequire('typescript');
const resolve=file=>{const relative=path.relative(root,file);if(!relative.startsWith('..')&&!path.isAbsolute(relative)){const candidate=path.join(stage,relative);if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;}return file;};
const read=file=>ts.sys.readFile(resolve(file)),exists=file=>ts.sys.fileExists(resolve(file));
const config=ts.readConfigFile(path.join(root,'tsconfig.app.json'),read);if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,{...ts.sys,readFile:read,fileExists:exists},root,{noEmit:true,incremental:false,composite:false},path.join(root,'tsconfig.app.json'));
const host=ts.createCompilerHost(parsed.options);host.readFile=read;host.fileExists=exists;host.getSourceFile=(file,version)=>{const text=read(file);return text===undefined?undefined:ts.createSourceFile(file,text,version,true);};
const program=ts.createProgram(parsed.fileNames,parsed.options,host),diagnostics=ts.getPreEmitDiagnostics(program);if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=>'\n'}));process.exitCode=1;}else console.log(JSON.stringify({clientOverlayTypecheck:true,emit:false,actualRepositoryModified:false}));
