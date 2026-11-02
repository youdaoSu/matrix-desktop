// Diagnostic transport only. Always loopback, never a platform or remote URL.
const port=Number(process.env.MATRIX_DIAGNOSTIC_PORT||9491);
if(!Number.isInteger(port)||port<9400||port>9599)throw Error('Invalid local diagnostic port');
export const installedDebugUrl=`http://127.0.0.1:${port}/json/list`;
