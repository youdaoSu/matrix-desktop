const fs = require('node:fs');
const path = require('node:path');

// Read-only adoption of this profile's already-running cluster after an app
// crash. Never stop a process, remove a PID file, change ACLs, or trust a port
// without verifying the live PostgreSQL data_directory through loopback psql.
async function recoverOwnedDatabase({ pgCtl, psql, dataDir, bin, runProcess, files = fs, databaseName = 'matrix_db' }) {
  // postgres is used only to verify a newly started cluster before matrix_db
  // exists. Arbitrary database names/SQL must never enter this ownership probe.
  if (!['matrix_db', 'postgres'].includes(databaseName)) throw Error('本机数据库归属检查参数不正确');
  try { await runProcess(pgCtl, ['-D', dataDir, 'status'], { timeout: 5000 }); }
  catch (error) {
    if (error.exitCode === 3) return null;
    throw Error('无法确认远效内置数据库状态，已停止启动；未修改数据库或权限');
  }
  const canonical = value => path.resolve(files.realpathSync(value)).toLowerCase();
  let rows, port;
  try {
    const marker = files.readFileSync(path.join(dataDir, 'postmaster.pid'), 'utf8');
    if (Buffer.byteLength(marker) > 4096) throw Error('oversized marker');
    rows = marker.split(/\r?\n/); port = Number(rows[3]);
    if (!/^[1-9]\d*$/.test(rows[0]) || !Number.isSafeInteger(Number(rows[0])) ||
        !Number.isInteger(port) || port < 35432 || port >= 35452 || canonical(rows[1]) !== canonical(dataDir)) throw Error('mismatched marker');
  } catch { throw Error('残留数据库的本机归属信息不完整，未接管、未删除进程标记；请联系支持'); }
  let actual;
  try {
    actual = (await runProcess(psql, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'matrix', '-d', databaseName,
      '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT current_setting('data_directory');"], { timeout: 10000, env: { ...process.env, PGCONNECT_TIMEOUT: '5' } })).trim();
    if (!actual || /[\r\n]/.test(actual) || canonical(actual) !== canonical(dataDir)) throw Error('different cluster');
  } catch { throw Error('残留数据库尚不可用或归属核验失败，未接管、未停止任何数据库'); }
  return { pgCtl, dataDir, bin, port };
}

function cleanupResources(actions) {
  const failed = [];
  for (const [name, action] of actions) {
    try { action(); } catch { failed.push(name); }
  }
  return failed;
}
module.exports = { recoverOwnedDatabase, cleanupResources };
