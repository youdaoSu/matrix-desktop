const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(path.resolve('.desktop-deps/node_modules/electron/dist/electron.exe'),[path.resolve('scripts/qa-douyin-dom-renderer.cjs')],{windowsHide:true,encoding:'utf8',timeout:60000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error);process.exit(result.status??1);
