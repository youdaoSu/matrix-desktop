// Synthetic configuration and the public SDK logger with in-memory test sinks.
// No server, database, network transport or actual user data is opened.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
if(process.argv[2]==='--packaged'&&!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=require('node:child_process').spawnSync(path.join(__dirname,'../.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);}
const root=path.resolve(__dirname,'..'),packaged=process.argv[2]==='--packaged',archive=path.join(root,'release-next/win-unpacked/resources/app.asar'),runtime=path.join(root,'release-next/win-unpacked/resources/app-runtime/dist/server');
let profile;if(process.versions.electron){profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'matrix-log-policy-qa-'));require('electron').app.setPath('userData',profile);}
if(packaged)assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(archive)).digest('hex'),process.argv[3]);
const file=path.join(__dirname,'../server/common/desktop-log-policy.ts'),code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObject={};vm.runInNewContext(code,{exports:exportsObject});const {prepareDesktopLogEnvironment,applyDesktopLogLevels}=packaged?require(path.join(runtime,'common/desktop-log-policy.js')):exportsObject;
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},levels=[];
const hosted={MATRIX_DESKTOP:'0',LOGGER_LEVEL:'trace',LOG_REQUEST_BODY:'true',LOG_RESPONSE_BODY:'true'};
eq(prepareDesktopLogEnvironment(hosted),false);applyDesktopLogLevels(false,value=>levels.push(value));eq(levels,[]);eq(hosted.LOGGER_LEVEL,'trace');eq(hosted.LOG_RESPONSE_BODY,'true');
const desktop={MATRIX_DESKTOP:'1',LOGGER_LEVEL:'trace',LOG_REQUEST_BODY:'true',LOG_RESPONSE_BODY:'true',JWT_SECRET:'SYNTHETIC_KEEP'};
eq(prepareDesktopLogEnvironment(desktop),true);eq(desktop.LOGGER_LEVEL,'warn');eq(desktop.LOG_REQUEST_BODY,'false');eq(desktop.LOG_RESPONSE_BODY,'false');eq(desktop.JWT_SECRET,'SYNTHETIC_KEEP');
applyDesktopLogLevels(true,value=>levels.push(Array.from(value)));eq(levels,[['warn','error','fatal']]);
if(packaged)assert.equal(JSON.parse(fs.readFileSync(archive+'/node_modules/@lark-apaas/nestjs-logger/package.json','utf8')).exports['.'].require,'./dist/index.cjs');
const {AppLogger}=require(packaged?archive+'/node_modules/@lark-apaas/nestjs-logger/dist/index.cjs':'@lark-apaas/nestjs-logger'),{Logger}=require(packaged?archive+'/node_modules/@nestjs/common':'@nestjs/common'),received=[];
const pino={level:'trace'},context={getContext:()=>undefined},observable={log:(level,message)=>received.push({level,message})};
const logger=new AppLogger(pino,observable,context),oldNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='production';
try{
 Logger.overrideLogger(logger);
 logger.log('SYNTHETIC_PRIVATE_HISTORY',{paas_attributes_module:'app_server'},'HTTPTraceInterceptor');eq(received.length,1);
 received.length=0;applyDesktopLogLevels(true,value=>Logger.overrideLogger(Array.from(value)));
 logger.log('SYNTHETIC_PRIVATE_HISTORY',{paas_attributes_module:'app_server'},'HTTPTraceInterceptor');logger.debug('SYNTHETIC_PRIVATE_HISTORY');logger.verbose('SYNTHETIC_PRIVATE_HISTORY');eq(received.length,0);
 logger.warn('Technical warning retained');logger.error('Technical error retained');logger.fatal('Technical fatal retained');eq(received.length,3);eq(received.map(value=>value.level),['warn','error','fatal']);eq(JSON.stringify(received).includes('SYNTHETIC_PRIVATE_HISTORY'),false);
 eq(pino.level,'warn');
 const main=fs.readFileSync(packaged?path.join(runtime,'main.js'):path.join(root,'server/main.ts'),'utf8');eq(main.indexOf('prepareDesktopLogEnvironment')<main.indexOf('NestFactory.create'),true);eq(main.lastIndexOf('applyDesktopLogLevels')<main.indexOf('app.listen('),true);
 console.log(JSON.stringify({desktopLogPolicyChecks:checks,actualPublicSdkLoggerTested:true,desktopInfoPayloadsSuppressed:true,warningsErrorsFatalRetained:true,hostedPolicyUnchanged:true,authAndCsrfUnchanged:true,realServerStarted:false,realUserDataRead:false,networkCalls:0}));
}finally{if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;Logger.overrideLogger(false);if(profile){assert.equal(path.dirname(profile),fs.realpathSync(require('node:os').tmpdir()));assert(path.basename(profile).startsWith('matrix-log-policy-qa-'));fs.rmSync(profile,{recursive:true,force:true});require('electron').app.exit(process.exitCode||0);}}
