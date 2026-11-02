// Small trusted-source loader for isolated tests; does not start an app/server.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadTs(relative, cache = new Map(), overrides = new Map()) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw Error('QA module outside repository');
  if (cache.has(file)) return cache.get(file).exports;
  const module = new Module(file); module.filename = file; module.paths = Module._nodeModulePaths(path.dirname(file)); cache.set(file, module);
  const original = module.require.bind(module);
  module.require = name => {
    if (overrides.has(name)) return overrides.get(name);
    const target = name.startsWith('@shared/') ? path.join(root, 'shared', name.slice(8)) : name.startsWith('@/') ? path.join(root, 'client/src', name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : undefined;
    if (target) for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (/\.tsx?$/.test(target + suffix) && fs.existsSync(target + suffix)) return loadTs(target + suffix, cache, overrides);
    return original(name);
  };
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
  return module.exports;
}
module.exports = { loadTs };
