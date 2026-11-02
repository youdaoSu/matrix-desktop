// A disposable QA process must stop (not pass) if its log reader goes away.
// Handle only the known pipe error, not arbitrary uncaught test exceptions.
function guardQaConsolePipes({ stdout = process.stdout, stderr = process.stderr, exit = code => process.exit(code) } = {}) {
  let stopped = false;
  const onError = error => {
    if (error?.code !== 'EPIPE') throw error;
    if (!stopped) { stopped = true; exit(1); }
  };
  const streams = [...new Set([stdout, stderr].filter(Boolean))];
  for (const stream of streams) stream.on('error', onError);
  return () => { for (const stream of streams) stream.removeListener('error', onError); };
}
module.exports = { guardQaConsolePipes };
