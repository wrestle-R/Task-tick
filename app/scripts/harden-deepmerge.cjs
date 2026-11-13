// Advisory GHSA-gcqx-w48m-w2h4 has no published patched release.
// Define own data properties instead of invoking Object.prototype.__proto__.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.dirname(require.resolve('deepmerge/package.json'));
const expected = {"index.js": "12440c84957c1990ea2d5e33dc0091722dc1dc1585c6d20e0c780e568ffa9d30", "dist/cjs.js": "2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d"};
const patched = {"index.js": "e901c3c5c36d067ae85d39386dce596890b0e2da0137116db7c471d5babdac23", "dist/cjs.js": "6d8b102e03e729cb85e8176ad8bd629159f5175c322d30b3c64bcd616abc98f4"};
for (const [name, hash] of Object.entries(expected)) {
  const file = path.join(root, name), source = fs.readFileSync(file, 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') === patched[name]) continue;
  if (crypto.createHash('sha256').update(source).digest('hex') !== hash) throw Error('deepmerge changed; review the security patch before installing');
  let next = source.replace('function mergeObject(target, source, options) {', 'function setOwnDataProperty(object, key, value) {\n Object.defineProperty(object, key, {value: value, enumerable: true, writable: true, configurable: true});\n}\n\nfunction mergeObject(target, source, options) {');
  next = next.replace(/destination\[key\] = (.+)/g, (_, expression) => 'setOwnDataProperty(destination, key, ' + expression.replace(/;$/, '') + ');');
  new (require('node:vm').Script)(next, {filename: file});
  fs.writeFileSync(file, next);
}
