const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('client/src/components/workspace/account-group-colors.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const sandbox = { exports: {} }; vm.runInNewContext(outputText, sandbox);
const { groupLabelPalette, groupLabelColor, groupLabelForeground } = sandbox.exports;
let checks = 0;
for (const color of groupLabelPalette) { assert.equal(groupLabelColor(color), color); assert.equal(groupLabelForeground(color), '#20242c'); checks += 2; }
assert.equal(groupLabelColor('#EF476F'), '#fbeaea'); checks++;
assert.equal(groupLabelColor('#6376dd'), '#eaf0ff'); checks++;
assert.equal(groupLabelColor('invalid'), groupLabelPalette[0]); checks++;
assert.equal(groupLabelColor('#000000'), '#000000'); checks++;
assert.equal(groupLabelForeground('#000000'), '#ffffff'); checks++;
assert.equal(groupLabelForeground('#ffffff'), '#20242c'); checks++;
console.log(JSON.stringify({ groupLabelColorChecks: checks, darkCustomTextReadable: true, externalWrites: false }));
