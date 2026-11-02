// Static dependency proof: worker has no Electron/network/external-package imports.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,projectRoot}=require('./qa-operations-paths.cjs'),packageFile=fs.existsSync(path.join(root,'package.json'))?path.join(root,'package.json'):path.join(projectRoot,'package.json');
const config=JSON.parse(fs.readFileSync(packageFile,'utf8')).build,visited=new Set();
function walk(relative){relative=relative.replaceAll('\\','/');assert(!relative.split('/').includes('..'));if(visited.has(relative))return;visited.add(relative);const file=path.join(root,relative),code=fs.readFileSync(file,'utf8');assert(!/require\(\s*[^'"\s]/.test(code),'dynamic require '+relative);for(const m of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)){if(m[1].startsWith('node:')){assert(!['node:http','node:https','node:net','node:tls','node:child_process'].includes(m[1]),m[1]);continue;}assert(m[1].startsWith('./')||m[1].startsWith('../'),'external import '+m[1]);const next=path.posix.normalize(path.posix.join(path.posix.dirname(relative),m[1]));walk(next);}}
walk('desktop/account-operations-worker.cjs');
for(const file of visited)assert(config.asarUnpack.includes(file)||file.startsWith('desktop/vendor/hengyuan-interactions/src/')&&config.asarUnpack.includes('desktop/vendor/hengyuan-interactions/src/*.cjs'),'physical unpack missing '+file);
const output={workerDependencyGraph:[...visited].sort(),modules:visited.size,allPhysicalUnpackConfigured:true,workerHasNoElectronOrNetwork:true,platformActions:0};
if(require.main===module)console.log(JSON.stringify(output));module.exports=output;
