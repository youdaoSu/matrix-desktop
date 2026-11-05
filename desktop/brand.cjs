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
module.exports = { brand, configureBrand };
