const {spawnSync}=require('node:child_process');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const result=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[path.join(__dirname,'qa-edge-host-renderer.cjs')],{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)console.error(result.error.message);process.exit(result.status??1);
