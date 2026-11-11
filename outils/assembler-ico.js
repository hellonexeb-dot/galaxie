// Assemble un fichier .ico (format Windows) à partir de PNG de plusieurs tailles.
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const sizes = [256, 48, 32, 16];
const pngs = sizes.map((n) => fs.readFileSync(path.join(dir, `icon-${n}.png`)));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
const entries = []; let offset = 6 + 16 * sizes.length;
sizes.forEach((n, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(n >= 256 ? 0 : n, 0); e.writeUInt8(n >= 256 ? 0 : n, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length; entries.push(e);
});
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, ...entries, ...pngs]));
for (const n of [48, 32, 16]) fs.unlinkSync(path.join(dir, `icon-${n}.png`)); // seulement utiles dans le .ico
console.log('icon.ico', fs.statSync(path.join(dir, 'icon.ico')).size, 'octets');
