// Copie three.module.js et les modules "addons" utilisés, avec leurs dépendances relatives.
const fs = require('fs'), path = require('path');
const [, , pkgDir, outDir] = process.argv;
const entries = [
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/renderers/CSS2DRenderer.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
];
const done = new Set();
function copy(rel) {
  if (done.has(rel)) return; done.add(rel);
  const src = path.join(pkgDir, rel), dst = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const txt = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dst, txt);
  for (const m of txt.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) copy(path.posix.join(path.posix.dirname(rel), m[1]));
}
copy('build/three.module.js');
entries.forEach(copy);
fs.copyFileSync(path.join(pkgDir, 'LICENSE'), path.join(outDir, 'LICENSE'));
console.log([...done].join('\n'));
