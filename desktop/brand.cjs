const path = require('node:path');
const brand = require('./brand.json');

// Configure before settings, sessions or locks; display names never move data.
function configureBrand(app, argv = process.argv) {
  const override = argv.find(value => value.startsWith('--matrix-user-data-dir='));
  const directory = override ? override.slice('--matrix-user-data-dir='.length)
    : app.isPackaged ? path.join(app.getPath('appData'), process.platform === 'darwin' ? brand.macDataName : brand.legacyDataName) : app.getPath('userData');
  if (!directory || !path.isAbsolute(directory)) throw Error('本机资料目录无效，未创建新资料或启动服务');
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  app.setName(brand.name);
  if (process.platform === 'win32') app.setAppUserModelId(brand.appId);
  return directory;
}
// Move only our existing per-user startup entry in this installation. Keep its
// approval state and leave other executables, arguments and machine entries alone.
function migrateLegacyAutoStart(app, platform = process.platform) {
  if (platform !== 'win32' || !app.isPackaged) return false;
  const current = app.getPath('exe');
  if (path.win32.basename(current) !== brand.executableName + '.exe') return false;
  const previous = path.win32.join(path.win32.dirname(current), brand.legacyExecutableName + '.exe');
  const entries = app.getLoginItemSettings({path:previous,args:[]}).launchItems || [];
  const owned = entries.find(item => item.name === brand.name && item.scope === 'user'
    && typeof item.path === 'string' && item.path.toLowerCase() === previous.toLowerCase()
    && Array.isArray(item.args) && item.args.length === 0 && typeof item.enabled === 'boolean');
  if (!owned) return false;
  app.setLoginItemSettings({openAtLogin:true,enabled:owned.enabled,name:owned.name,path:current,args:[]});
  return true;
}
module.exports = { brand, configureBrand, migrateLegacyAutoStart };
