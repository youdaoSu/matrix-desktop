const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');let projectRoot=root;
if(!fs.existsSync(path.join(root,'node_modules/typescript/package.json'))){
 if(process.env.MATRIX_QA_PROJECT_ROOT)projectRoot=path.resolve(process.env.MATRIX_QA_PROJECT_ROOT);
 else{const state=path.join(root,'WORKING-STATE.json');if(!fs.existsSync(state))throw Error('Install project QA dependencies, or explicitly set MATRIX_QA_PROJECT_ROOT for an isolated overlay');projectRoot=path.resolve(JSON.parse(fs.readFileSync(state,'utf8')).currentInstalled.sourceRepo);}
}
if(JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8')).name!=='fullstack-nestjs-template')throw Error('Unexpected QA dependency project');
const projectRequire=Module.createRequire(path.join(projectRoot,'package.json')),electron=path.join(projectRoot,'.desktop-deps/node_modules/electron/dist/electron.exe');
module.exports={root,projectRoot,projectRequire,electron};
