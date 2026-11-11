import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// =====================================================================
// Données & utilitaires
// =====================================================================
const STATUS = {
  'idee':     { label: 'Idée',     color: '#c7a6ff' },
  'en-cours': { label: 'En cours', color: '#ffd27a' },
  'en-pause': { label: 'En pause', color: '#ff9a6b' },
  'livre':    { label: 'Livré',    color: '#8fd8ff' },
  'archive':  { label: 'Archivé',  color: '#8b8399' },
};
const THEME_COLORS = ['#ffc86b', '#7fc8ff', '#ff8a7a', '#b69cff', '#7fe0b0', '#ff9fd2', '#f4e38a', '#8ab4ff'];
const ERRANT = '__errant__';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function ago(ms) {
  if (!ms) return 'jamais';
  const s = (ms - Date.now()) / 1000, a = Math.abs(s);
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (a < 86400 * 365) return rtf.format(Math.round(s / 86400 / 30), 'month');
  return rtf.format(Math.round(s / 86400 / 365), 'year');
}
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
function hash(str) { let h = 2166136261 >>> 0; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const api = {
  galaxy: () => fetch('/api/galaxy').then((r) => r.json()),
  post: (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Galaxie': '1' }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; }),
};

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// =====================================================================
// Scène
// =====================================================================
const container = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'labels';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#03030a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 14000);
camera.position.set(0, 1050, 1650);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.18;
controls.minDistance = 3;
controls.maxDistance = 3600;
controls.zoomSpeed = 0.9;
controls.zoomToCursor = true; // la molette zoome vers l'endroit pointé, pas vers le centre

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.AmbientLight(0xffffff, 0.09));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

function makeGlow(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = makeGlow([[0, 1], [0.12, 0.8], [0.35, 0.22], [1, 0]]);
const SOFT = makeGlow([[0, 0.55], [0.5, 0.15], [1, 0]]);
const DOT = makeGlow([[0, 1], [0.3, 0.6], [1, 0]]);

function sprite(tex, color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale); return s;
}

// Fond d'étoiles lointaines
(function starfield() {
  const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = rng(7);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, R = 5000 + r() * 2500, s = Math.sqrt(1 - u * u);
    pos.set([R * s * Math.cos(th), R * u, R * s * Math.sin(th)], i * 3);
    const c = new THREE.Color().setHSL(0.55 + r() * 0.2, 0.3, 0.6 + r() * 0.4); col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false })));
})();

// Poussière galactique (bras spiraux), une par galaxie
function makeDust(radius, palette, seed) {
  const n = 26000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = rng(seed);
  const inner = new THREE.Color(palette[0]), outer = new THREE.Color(palette[1]), accent = new THREE.Color(palette[2]);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  const arms = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const arm = i % arms, d = Math.pow(r(), 1.5) * radius + 6;
    const a = (arm * Math.PI * 2) / arms + d * (3.2 / radius) + gauss() * 0.35;
    const spread = 6 + d * 0.09;
    pos.set([Math.cos(a) * d + gauss() * spread, gauss() * (14 * (1 - d / (radius * 1.15)) + 2), Math.sin(a) * d + gauss() * spread], i * 3);
    const c = inner.clone().lerp(outer, Math.min(1, d / radius));
    if (r() < 0.08) c.lerp(accent, 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 3, map: DOT, vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
}

// ---------------------------------------------------------------------
// Planètes réalistes : texture procédurale (bruit 3D raccordé sur la sphère)
// Chaque projet reçoit toujours la même planète (graine = chemin du dossier).
// ---------------------------------------------------------------------
function noise3(seed) {
  const h = (x, y, z) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = s(x - X), v = s(y - Y), w = s(z - Z);
    return lerp(lerp(lerp(h(X, Y, Z), h(X + 1, Y, Z), u), lerp(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
                lerp(lerp(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), lerp(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
  };
  return (x, y, z, oct = 5) => { let a = 0, f = 1, amp = 0.5, tot = 0; for (let i = 0; i < oct; i++) { a += n(x * f, y * f, z * f) * amp; tot += amp; f *= 2.03; amp *= 0.5; } return a / tot; };
}

const PLANET_KINDS = {
  gas: [
    ['#b98a62', '#e2cba3', '#8d5f3e', '#efe0c2', '#c79a6d'],   // façon Jupiter
    ['#d6bf8a', '#ecdcb0', '#b39257', '#f3e8c8'],              // façon Saturne
    ['#5f86b0', '#86a9cc', '#3f6390', '#a9c4de'],              // façon Neptune
    ['#9fc3c9', '#bfdadd', '#7fa9b0', '#d4e8ea'],              // façon Uranus
  ],
  rock: [
    ['#7a4a30', '#a8693f', '#5a3422', '#c28a5c'],              // rouille
    ['#6f6c69', '#8f8b86', '#55524f', '#a7a29b'],              // gris lunaire
    ['#a8885f', '#c9ab7c', '#7d6342', '#dcc49a'],              // sable
  ],
  ice: [['#b9cfdc', '#d8e5ec', '#93b1c4', '#e8f0f4']],
  ocean: [['#173f63', '#1f5a85', '#3d6b3a', '#7a7048', '#e6edf0']], // eau, eau claire, terre, désert, glace
};

function pickPlanet(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const roll = r();
  const kind = roll < 0.38 ? 'gas' : roll < 0.7 ? 'rock' : roll < 0.85 ? 'ice' : 'ocean';
  const list = PLANET_KINDS[kind];
  return { kind, palette: list[Math.floor(r() * list.length)].map((c) => new THREE.Color(c)) };
}

function mixPalette(pal, t) {
  t = Math.min(0.999, Math.max(0, t)) * (pal.length - 1);
  const i = Math.floor(t);
  return pal[i].clone().lerp(pal[i + 1], t - i);
}

function planetTexture(seed, dim) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const { kind, palette } = pickPlanet(seed);
  const nz = noise3(seed | 0), r = rng(seed);
  const bandFreq = 6 + r() * 10, warp = 0.4 + r() * 0.8;
  const col = new THREE.Color(), white = new THREE.Color('#f2f4f6'), grey = new THREE.Color('#4a4650');
  for (let y = 0; y < H; y++) {
    const v = y / H, lat = (v - 0.5) * Math.PI, cy = Math.sin(lat) * 2, cr = Math.cos(lat) * 2;
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2, px = Math.cos(a) * cr, pz = Math.sin(a) * cr;
      if (kind === 'gas') {
        const w = nz(px * 1.5, cy * 1.5, pz * 1.5, 4);
        const t = 0.5 + 0.5 * Math.sin(v * bandFreq * Math.PI + w * warp * 8) * 0.8 + (nz(px * 6, cy * 14, pz * 6, 3) - 0.5) * 0.35;
        col.copy(mixPalette(palette, t));
      } else if (kind === 'rock') {
        const t = nz(px * 2.2, cy * 2.2, pz * 2.2, 6);
        col.copy(mixPalette(palette, (t - 0.25) * 1.9));
      } else if (kind === 'ice') {
        const t = nz(px * 2, cy * 2, pz * 2, 5);
        col.copy(mixPalette(palette, t * 1.4 - 0.2));
        if (nz(px * 9, cy * 9, pz * 9, 2) > 0.62) col.multiplyScalar(0.88); // fissures
      } else {
        const h = nz(px * 1.6, cy * 1.6, pz * 1.6, 6);
        if (h < 0.52) col.copy(palette[0]).lerp(palette[1], Math.max(0, (h - 0.38) / 0.14));
        else col.copy(palette[2]).lerp(palette[3], Math.min(1, (h - 0.52) * 4));
        if (Math.abs(v - 0.5) > 0.41 + (h - 0.5) * 0.1) col.copy(palette[4]);
        const cloud = nz(px * 3 + 9, cy * 3, pz * 3, 4);
        if (cloud > 0.56) col.lerp(white, Math.min(0.85, (cloud - 0.56) * 4));
      }
      if (dim) col.lerp(grey, 0.45);
      const i = (y * W + x) * 4;
      d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (kind === 'rock') { // cratères
    const n = 18 + r() * 25;
    for (let k = 0; k < n; k++) {
      const x = r() * W, y = H * (0.15 + r() * 0.7), rad = 2 + Math.pow(r(), 3) * 16;
      g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.15})`; g.beginPath(); g.ellipse(x, y, rad, rad * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x - 0.6, y - 0.6, rad, rad * 0.8, 0, Math.PI, Math.PI * 1.8); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { map: t, kind, palette };
}

function ringTexture(seed, palette) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d'), r = rng(seed + 7);
  for (let x = 0; x < 256; x++) {
    const col = mixPalette(palette, r() * 0.5 + 0.25);
    const a = (0.25 + 0.55 * Math.abs(Math.sin(x * 0.11 + r() * 0.5))) * (x < 12 || x > 244 ? 0.3 : 1) * (r() < 0.08 ? 0.15 : 1);
    g.fillStyle = `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},${a.toFixed(2)})`; g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Rend une étiquette cliquable : même effet qu'un clic sur l'astre
function bindLabel(o, h) {
  const el = o.element;
  el.classList.add('clickable');
  el.addEventListener('click', (e) => { e.stopPropagation(); tip.hidden = true; activate(h); });
  el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (h.kind === 'moon' && h.moon.planet.kind === 'project') resume(h.moon.planet.p, h.moon.session); });
  el.addEventListener('mouseenter', () => { hovered = h; });
  el.addEventListener('mouseleave', () => { if (hovered === h) hovered = null; });
  // la molette continue de zoomer même au-dessus d'un nom
  el.addEventListener('wheel', (e) => { e.preventDefault(); renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });
  return o;
}

// Zone de clic invisible, plus large que l'astre
function hitSprite(scale, data) {
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  h.scale.setScalar(scale); h.userData = data; return h;
}

function label(html, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = html;
  const o = new CSS2DObject(el); o.visible = false; return o;
}

// =====================================================================
// Univers : définitions
// =====================================================================
const CAT = {
  skill:     { label: 'Skills',      one: 'skill',      many: 'skills',      color: '#7fe0b0', blurb: 'Tes savoir-faire personnels. Claude les charge tout seul quand le sujet s’y prête, ou quand tu tapes leur nom avec un « / ».' },
  plugin:    { label: 'Plugins',     one: 'plugin',     many: 'plugins',     color: '#b69cff', blurb: 'Des paquets installés qui apportent d’un coup des skills, des commandes et parfois des serveurs MCP.' },
  mcp:       { label: 'MCP',         one: 'serveur',    many: 'serveurs',    color: '#7fc8ff', blurb: 'Les serveurs qui donnent des outils à Claude : GitHub, Supabase, un navigateur, la génération d’images…' },
  connector: { label: 'Connecteurs', one: 'connecteur', many: 'connecteurs', color: '#ff9fd2', blurb: 'Les services reliés à ton compte claude.ai (Gmail, Drive…), utilisables aussi dans Claude Code.' },
};
// Une galaxie par domaine de projets (Pro, Perso…), plus la galaxie des compétences.
// Les domaines reprennent à tour de rôle ces ambiances.
const DOMAIN_LOOKS = [
  { tilt: [0.2, 0, 0.12],    palette: ['#ffcf9a', '#5a68ff', '#ff6fb8'] },
  { tilt: [-0.12, 0, 0.16],  palette: ['#ffd9c2', '#c2477a', '#ff9a5c'] },
  { tilt: [0.14, 0, -0.1],   palette: ['#dfe6ff', '#3d6bd6', '#a77bff'] },
  { tilt: [-0.18, 0, -0.08], palette: ['#fff0c4', '#b8742e', '#ffc86b'] },
  { tilt: [0.1, 0, 0.2],     palette: ['#e8d8ff', '#7a3fd0', '#ff7fd0'] },
];
const CAPS_DEF = { id: 'competences', kind: 'cap', name: 'Compétences', tilt: [-0.16, 0, -0.18], palette: ['#b8ffe6', '#6a4cff', '#5fd4ff'] };
const UNIVERSE_CAM_BASE = new THREE.Vector3(0, 1050, 1650);
let universeCam = UNIVERSE_CAM_BASE.clone();

// =====================================================================
// État
// =====================================================================
const state = {
  data: null,
  view: 'universe',    // universe | galaxy | system | planet
  gal: null,           // galaxie focalisée
  sys: null,           // système focalisé
  planet: null,        // planète focalisée
  filters: new Set(Object.keys(STATUS)),
  hotSession: null,
};
const universe = new THREE.Group();
scene.add(universe);
let galaxies = [], systems = [], center = null;
const angles = new Map(); // angle orbital conservé entre deux reconstructions

// Accès génériques : une planète est soit un projet, soit une compétence
const dotColor = (kind, p) => (kind === 'project' ? STATUS[p.status].color : CAT[p.cat].color);
function moonsOf(kind, p) {
  if (kind === 'project') return p.sessions.map((s) => ({ id: s.id, title: s.title, updated: s.updated, size: s.size }));
  return p.children.map((c, i) => ({ id: c.name + '#' + i, title: c.name, sub: c.kind, desc: c.description || '', updated: 0, size: 60 }));
}
const planetName = (pl) => pl.p.name;

// =====================================================================
// Construction
// =====================================================================
function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry) x.geometry.dispose();
    if (x.material) { if (x.material.map && x.material.map !== GLOW && x.material.map !== SOFT && x.material.map !== DOT) x.material.map.dispose(); x.material.dispose(); }
    if (x.isCSS2DObject) x.element.remove();
  });
}

function buildUniverse() {
  disposeTree(universe); universe.clear(); galaxies = []; systems = [];
  const { themes, projects, caps } = state.data;
  const domains = state.data.domains?.length ? state.data.domains : [{ id: 'd-projets', name: 'Projets' }];

  // Galaxies des projets : une par domaine, un soleil par thème
  const groups = themes.map((t) => ({ id: t.id, kind: 'project', theme: t, domain: domains.some((d) => d.id === t.domain) ? t.domain : domains[0].id, name: t.name, color: t.color, items: projects.filter((p) => p.theme === t.id) }));
  for (const g of groups) { g.items.sort((a, b) => b.lastActivity - a.lastActivity); g.lastActivity = g.items[0]?.lastActivity || 0; }
  groups.sort((a, b) => b.lastActivity - a.lastActivity);
  // les projets sans thème dérivent dans la première galaxie
  const lost = projects.filter((p) => !p.theme).sort((a, b) => b.lastActivity - a.lastActivity);
  if (lost.length) groups.push({ id: ERRANT, kind: 'project', theme: null, domain: domains[0].id, name: 'Planètes errantes', color: '#9d8cff', items: lost, lastActivity: lost[0].lastActivity });

  // Galaxie des compétences : un soleil par famille
  const capGroups = Object.entries(CAT)
    .map(([k, c]) => ({ id: 'cat:' + k, kind: 'cap', cat: k, name: c.label, color: c.color, items: caps.filter((x) => x.cat === k).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  domains.forEach((d, i) => {
    const def = { id: d.id, kind: 'project', name: d.name, domain: d, ...DOMAIN_LOOKS[i % DOMAIN_LOOKS.length] };
    galaxies.push(buildGalaxy(def, groups.filter((g) => g.domain === d.id)));
  });
  galaxies.push(buildGalaxy(CAPS_DEF, capGroups));
  placeGalaxies();
  buildCenter();
  buildLinks();
  universe.updateMatrixWorld(true);
  for (const s of systems) s.wpos = s.group.getWorldPosition(new THREE.Vector3());
  updateStats(); renderLegend();
}

function buildGalaxy(def, groups) {
  const gal = { def, id: def.id, kind: def.kind, name: def.name, group: new THREE.Group(), systems: [], groups };
  gal.group.rotation.set(...def.tilt); // la position est fixée par placeGalaxies()
  universe.add(gal.group);

  for (const g of groups) {
    const ext = Math.max(0, ...g.items.map((p) => planetExtent(g.kind, p)));
    g.step = Math.max(g.items.length > 12 ? 2.6 : 3.6, ext * 2 + 1.2);
    g.radius = 10 + ext + Math.max(0, g.items.length - 1) * g.step + 4;
  }
  // Placement en spirale (angle d'or), puis on écarte les systèmes qui se chevauchent
  let d = 0;
  groups.forEach((g, i) => {
    d = i === 0 ? 120 + g.radius : d + 34 + g.radius * 0.9;
    const r = rng(hash(g.id));
    const a = i * 2.39996 + (r() - 0.5) * 0.3 + hash(def.id) % 7;
    g.pos = new THREE.Vector3(Math.cos(a) * d, (r() - 0.5) * 24, Math.sin(a) * d);
  });
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const A = groups[i], B = groups[j], min = A.radius + B.radius + 30;
      const v = new THREE.Vector3().subVectors(B.pos, A.pos); v.y = 0;
      const len = v.length() || 0.01;
      if (len < min) { v.multiplyScalar((min - len) / len / 2); A.pos.sub(v); B.pos.add(v); }
    }
  }
  gal.radius = Math.max(260, ...groups.map((g) => g.pos.length() + g.radius)) + 60;
  gal.dust = makeDust(gal.radius + 30, def.palette, hash(def.id));
  gal.group.add(gal.dust);
  gal.group.add(sprite(GLOW, def.palette[0], 200, 0.3));

  const hit = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.scale.setScalar(gal.radius * 1.2); hit.userData = { kind: 'galaxy', gal };
  gal.group.add(hit); gal.hit = hit;

  const n = groups.reduce((s, g) => s + g.items.length, 0);
  const sub = def.kind === 'project' ? `${plural(groups.filter((g) => g.id !== ERRANT).length, 'thème', 'thèmes')} · ${plural(n, 'projet', 'projets')}` : `${plural(n, 'compétence', 'compétences')}`;
  gal.label = label(`${esc(def.name)}<small>${sub}</small>`, 'lbl-gal');
  gal.group.add(gal.label);
  bindLabel(gal.label, { kind: 'galaxy', gal });

  for (const g of groups) { const s = buildSystem(g, gal); gal.systems.push(s); systems.push(s); }
  return gal;
}

// Galaxies en cercle autour de « Toi » : les compétences à droite, les domaines de projets
// répartis régulièrement sur le reste du cercle, assez loin pour ne jamais se chevaucher.
function placeGalaxies() {
  const caps = galaxies.find((g) => g.kind === 'cap');
  const projs = galaxies.filter((g) => g.kind === 'project');
  const N = galaxies.length, step = (Math.PI * 2) / N;
  const order = [caps, ...projs].filter(Boolean);
  // si une galaxie tombait pile dans l'axe de la caméra (N multiple de 4), elle cacherait « Toi » : on tourne d'un demi-pas
  const off = N % 4 === 0 ? step / 2 : 0;
  const angle = new Map();
  if (caps) angle.set(caps, off);
  projs.forEach((g, k) => angle.set(g, Math.PI + off + (k - (projs.length - 1) / 2) * step));
  // distance au centre : assez pour que deux voisines ne se touchent pas
  let D = 820;
  const sorted = [...order].sort((a, b) => angle.get(a) - angle.get(b));
  for (let i = 0; i < sorted.length && N > 1; i++) {
    const A = sorted[i], B = sorted[(i + 1) % sorted.length];
    let da = Math.abs(angle.get(B) - angle.get(A)); if (da > Math.PI) da = Math.PI * 2 - da;
    if (!da) continue;
    D = Math.max(D, (A.radius + B.radius + 160) / (2 * Math.sin(Math.min(da, Math.PI) / 2)));
  }
  for (const g of order) D = Math.max(D, g.radius + 420);
  let extent = 0;
  order.forEach((g, i) => {
    const a = angle.get(g);
    g.def.center = new THREE.Vector3(Math.cos(a) * D, g === caps ? 30 : (i % 2 ? 0 : -20),Math.sin(a) * D * 0.85 - Math.cos(a) * 140);
    g.group.position.copy(g.def.center);
    extent = Math.max(extent, Math.hypot(g.def.center.x, g.def.center.z) + g.radius);
  });
  universeCam = UNIVERSE_CAM_BASE.clone().multiplyScalar(Math.max(1, extent / 1180));
  controls.maxDistance = Math.max(3600, universeCam.length() * 1.5);
}

// Taille d'une planète et rayon occupé par son cortège de lunes
const MAX_MOONS = 10, MOON_GAP = 0.34;
function planetSize(kind, p) {
  if (kind === 'project') return 1.0 + Math.min(Math.log2(1 + p.sessions.length), 5) * 0.28;
  return { skill: 0.85, mcp: 0.95, connector: 1.05, plugin: 1.0 }[p.cat] + (p.cat === 'plugin' ? Math.min(Math.log2(1 + p.children.length), 5) * 0.25 : 0);
}
function planetExtent(kind, p) {
  const n = Math.min(MAX_MOONS, kind === 'project' ? p.sessions.length : p.children.length);
  const size = planetSize(kind, p);
  return n ? size + 1.1 + (n - 1) * MOON_GAP + 0.3 : size;
}

function buildCenter() {
  const g = new THREE.Group(); universe.add(g);
  g.add(sprite(GLOW, '#cfd8ff', 110, 0.45), sprite(GLOW, '#ffffff', 22, 1));
  const { projects, caps } = state.data;
  const lbl = label(`Toi<small>${plural(projects.length, 'projet', 'projets')} · ${plural(caps.length, 'compétence', 'compétences')}</small>`, 'lbl-center');
  g.add(lbl);
  // ponts d'étoiles entre toi et chaque galaxie
  for (const { def } of galaxies) {
    const n = 900, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = rng(hash(def.id) + 3);
    const a = new THREE.Color('#cfd8ff'), b = new THREE.Color(def.palette[0]);
    const side = new THREE.Vector3(-def.center.z, 0, def.center.x).normalize();
    for (let i = 0; i < n; i++) {
      const t = r();
      const p = def.center.clone().multiplyScalar(t * 0.82);
      p.addScaledVector(side, Math.sin(t * Math.PI) * 140 + (r() - 0.5) * 40 * (1 - t * 0.5));
      p.y += (r() - 0.5) * 30 * Math.sin(t * Math.PI);
      pos.set([p.x, p.y, p.z], i * 3);
      const c = a.clone().lerp(b, t); col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.6, map: DOT, vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  center = { group: g, label: lbl };
}

function buildSystem(g, gal) {
  const sys = { ...g, gal, group: new THREE.Group(), planets: [], errant: g.id === ERRANT };
  sys.group.position.copy(g.pos);
  gal.group.add(sys.group);
  const color = new THREE.Color(g.color);
  const n = g.items.length;

  if (sys.errant) {
    const r = rng(9);
    for (let i = 0; i < 7; i++) {
      const s = sprite(SOFT, i % 2 ? '#7a5cff' : '#ff6fb8', 30 + r() * 30, 0.14);
      s.position.set((r() - 0.5) * 22, (r() - 0.5) * 8, (r() - 0.5) * 22);
      sys.group.add(s);
    }
    sys.halo = sprite(GLOW, '#b9a8ff', 12, 0.3);
    sys.group.add(sys.halo);
    sys.group.add(new THREE.PointLight(0xc9bfff, 1.0, 0, 0));
  } else {
    sys.halo = sprite(GLOW, color, 14 + Math.min(n, 12) * 0.8, 0.45);
    sys.core = sprite(GLOW, '#fff6e8', 7, 0.5);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 48, 32), new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(1.25) }));
    sys.group.add(sys.halo, sys.core, sun);
    sys.group.add(new THREE.PointLight(0xfff4e6, 1.25, 0, 0));
  }
  const hit = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.scale.setScalar(16); hit.userData = { kind: 'sun', sys };
  sys.group.add(hit); sys.hit = hit;

  let sub;
  if (g.kind === 'project') {
    const sessions = g.items.reduce((s, p) => s + p.sessions.length, 0);
    sub = `${plural(n, 'planète', 'planètes')}${sessions ? ' · ' + plural(sessions, 'lune', 'lunes') : ''}`;
  } else sub = plural(n, CAT[g.cat].one, CAT[g.cat].many);
  sys.label = label(`${esc(g.name)}<small>${sub}</small>`, 'lbl-sun');
  sys.group.add(sys.label);
  bindLabel(sys.label, { kind: 'sun', sys });

  g.items.forEach((p, i) => sys.planets.push(buildPlanet(sys, g.kind, p, i)));
  return sys;
}

function buildPlanet(sys, kind, p, i) {
  const r = rng(hash(p.key));
  const R = 10 + Math.max(0, ...sys.items.map((x) => planetExtent(kind, x))) + i * sys.step + (r() - 0.5) * 0.4;
  let size, ageDays, dim;
  if (kind === 'project') {
    size = planetSize(kind, p);
    ageDays = (Date.now() - p.lastActivity) / 864e5;
    dim = p.status === 'archive';
  } else {
    size = planetSize(kind, p);
    ageDays = p.updated ? (Date.now() - p.updated) / 864e5 : 999;
    dim = p.cat === 'plugin' && p.enabled === false;
  }
  const color = dotColor(kind, p);

  const pivot = new THREE.Group();
  pivot.rotation.set((r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16);
  sys.group.add(pivot);

  const pts = []; for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sys.color, transparent: true, opacity: 0.13, depthWrite: false }));
  pivot.add(orbit);

  const holder = new THREE.Group(); pivot.add(holder);
  const tex = planetTexture(hash(p.key), dim);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(size, 40, 28),
    new THREE.MeshStandardMaterial({ map: tex.map, roughness: tex.kind === 'ice' || tex.kind === 'ocean' ? 0.6 : 0.95, metalness: 0 }),
  );
  if (tex.kind !== 'rock') {
    const rim = new THREE.Mesh(new THREE.SphereGeometry(size * 1.04, 40, 28), new THREE.MeshBasicMaterial({ color: tex.kind === 'ocean' ? '#6fa8ff' : tex.palette[1], transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
    holder.add(rim);
  }
  mesh.rotation.z = (r() - 0.5) * 0.6;
  mesh.userData = { kind: 'planet' };
  holder.add(mesh);

  // halo visible seulement de loin, pour repérer les planètes actives
  const glowOp = dim ? 0.05 : kind === 'project' ? 0.08 + 0.3 * Math.exp(-ageDays / 20) : 0.16;
  const atmo = sprite(SOFT, color, size * 3.4, glowOp);
  holder.add(atmo);

  const moonsData = moonsOf(kind, p);
  if (moonsData.length >= 6) {
    const rg = new THREE.RingGeometry(size * 1.4, size * 2.3, 96, 1);
    const uv = rg.attributes.uv, pos = rg.attributes.position, v3 = new THREE.Vector3();
    for (let k = 0; k < uv.count; k++) { v3.fromBufferAttribute(pos, k); uv.setXY(k, (v3.length() - size * 1.4) / (size * 0.9), 0.5); }
    const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: ringTexture(hash(p.key), tex.palette), side: THREE.DoubleSide, transparent: true, depthWrite: false, roughness: 1 }));
    ring.rotation.x = Math.PI / 2 - 0.35; holder.add(ring);
  }

  const lbl = label(`<i style="background:${color}"></i>${esc(p.name)}`, 'lbl-planet');
  holder.add(lbl);

  const pl = { kind, p, sys, pivot, holder, mesh, dim, atmo, atmoOp: glowOp, orbit, label: lbl, R, size, speed: 0.5 / Math.pow(R, 0.9), moons: [] };
  if (!angles.has(p.key)) angles.set(p.key, r() * Math.PI * 2);
  mesh.userData.planet = pl;
  pl.hit = hitSprite(Math.max(size * 3.2, 4), { kind: 'planet', planet: pl });
  holder.add(pl.hit);
  bindLabel(lbl, { kind: 'planet', planet: pl });

  moonsData.slice(0, MAX_MOONS).forEach((s, j) => {
    const mr = rng(hash(s.id));
    const mp = new THREE.Group(); mp.rotation.set((mr() - 0.5) * 0.9, 0, (mr() - 0.5) * 0.9); holder.add(mp);
    const mh = new THREE.Group(); mp.add(mh);
    const ms = 0.13 + Math.min(Math.log10(s.size + 1), 4) * 0.035;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(ms, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.6 + mr() * 0.15, 0.1, 0.5), roughness: 1 }));
    moon.userData = { kind: 'moon' };
    mh.add(moon);
    const ml = label(esc(s.title), 'lbl-moon'); mh.add(ml);
    const mR = size + 1.1 + j * MOON_GAP;
    const m = { session: s, pivot: mp, holder: mh, mesh: moon, label: ml, R: mR, speed: 0.9 / Math.sqrt(mR), angle: mr() * Math.PI * 2, planet: pl };
    moon.userData.moon = m;
    m.hit = hitSprite(1.1, { kind: 'moon', moon: m });
    mh.add(m.hit);
    bindLabel(ml, { kind: 'moon', moon: m });
    pl.moons.push(m);
  });

  applyFilter(pl);
  return pl;
}

function applyFilter(pl) { pl.pivot.visible = pl.kind !== 'project' || state.filters.has(pl.p.status); }
const planetWorld = (pl) => pl.holder.getWorldPosition(new THREE.Vector3());

// =====================================================================
// Liens projets ↔ compétences : montrés seulement dans les fiches
// (« Compétences utilisées », « Utilisée dans »). Aucun fil dans la 3D :
// essayés, ils encombraient la vue sans rien apprendre de plus.
// =====================================================================
function buildLinks() {
  const byKey = new Map();
  for (const s of systems) for (const pl of s.planets) { byKey.set(pl.p.key, pl); pl.links = []; }
  for (const p of state.data.projects) for (const u of p.uses || []) {
    const a = byKey.get(p.key), b = byKey.get(u.key);
    if (!a || !b) continue;
    const l = { a, b, n: u.n };
    a.links.push(l); b.links.push(l);
  }
}

// =====================================================================
// Caméra : vols
// =====================================================================
let flight = null;
function flyTo(pos, target, dur = 1500) {
  flight = { fromP: camera.position.clone(), toP: pos.clone(), fromT: controls.target.clone(), toT: target.clone(), t0: performance.now(), dur };
}

function focusUniverse(fly = true) {
  state.view = 'universe'; state.gal = null; state.sys = null; state.planet = null; state.hotSession = null;
  controls.autoRotate = true;
  if (fly) flyTo(universeCam, new THREE.Vector3(0, 0, 0), 2000);
  closePanel(); renderCrumbs(); renderLegend();
}

function focusGalaxy(gal, fly = true) {
  state.view = 'galaxy'; state.gal = gal; state.sys = null; state.planet = null; state.hotSession = null;
  controls.autoRotate = true;
  if (fly) {
    const c = gal.def.center;
    flyTo(c.clone().add(new THREE.Vector3(c.x * 0.12, gal.radius * 0.95, gal.radius * 1.35)), c, 1900);
  }
  renderGalaxyPanel(gal); renderCrumbs(); renderLegend();
}

function focusSystem(sys, fly = true) {
  state.view = 'system'; state.gal = sys.gal; state.sys = sys; state.planet = null; state.hotSession = null;
  controls.autoRotate = false;
  const R = sys.radius;
  if (fly) {
    const dir = new THREE.Vector3().subVectors(camera.position, sys.wpos).setY(0).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0, 0, 1);
    flyTo(sys.wpos.clone().add(dir.multiplyScalar(R * 1.12 + 14)).add(new THREE.Vector3(0, R * 0.72 + 10, 0)), sys.wpos);
  }
  sys.kind === 'project' ? renderThemePanel(sys) : renderCatPanel(sys);
  renderCrumbs(); renderLegend();
}

function focusPlanet(pl, fly = true) {
  state.view = 'planet'; state.gal = pl.sys.gal; state.sys = pl.sys; state.planet = pl; state.hotSession = null;
  controls.autoRotate = false;
  if (fly) {
    const wp = planetWorld(pl);
    const toSun = new THREE.Vector3().subVectors(pl.sys.wpos, wp).setY(0).normalize();
    const side = new THREE.Vector3(-toSun.z, 0, toSun.x);
    const dist = pl.size * 4 + 4 + (pl.moons.length ? pl.moons[pl.moons.length - 1].R * 1.6 : 0);
    flyTo(wp.clone().add(toSun.multiplyScalar(dist * 0.55)).add(side.multiplyScalar(dist * 0.3)).add(new THREE.Vector3(0, dist * 0.95, 0)), wp, 1400);
  }
  pl.kind === 'project' ? renderProjectPanel(pl) : renderCapPanel(pl);
  renderCrumbs(); renderLegend();
}

function back() {
  if (state.view === 'planet') focusSystem(state.sys);
  else if (state.view === 'system') focusGalaxy(state.gal);
  else if (state.view === 'galaxy') focusUniverse();
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#dlg').open && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') back();
});

// =====================================================================
// Interaction (survol, clic)
// =====================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null, downAt = null;

function shown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }

function pick(ev) {
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  for (const gal of galaxies) if (state.view === 'universe' || (state.view === 'galaxy' && state.gal !== gal)) targets.push(gal.hit);
  for (const s of systems) {
    targets.push(s.hit);
    if (state.view === 'universe') continue;
    for (const pl of s.planets) {
      if (!shown(pl.mesh)) continue;
      targets.push(pl.hit);
      if (state.planet === pl) for (const m of pl.moons) targets.push(m.hit);
    }
  }
  const hits = raycaster.intersectObjects(targets, false);
  const order = { moon: 0, planet: 1, sun: 2, galaxy: 3 };
  hits.sort((a, b) => (order[a.object.userData.kind] - order[b.object.userData.kind]) || a.distance - b.distance);
  return hits[0]?.object.userData || null;
}

function tooltipHtml(h) {
  if (h.kind === 'galaxy') return `<b>Galaxie ${esc(h.gal.name)}</b><small>clic pour y entrer</small>`;
  if (h.kind === 'sun') {
    const s = h.sys;
    if (s.kind === 'cap') return `<b>${esc(s.name)}</b><small>${plural(s.items.length, CAT[s.cat].one, CAT[s.cat].many)}</small>`;
    return `<b>${esc(s.name)}</b><small>${plural(s.items.length, 'projet', 'projets')} · actif ${ago(s.lastActivity)}</small>`;
  }
  if (h.kind === 'planet') {
    const pl = h.planet, p = pl.p;
    const nl = pl.links?.length || 0;
    if (pl.kind === 'cap') return `<b>${esc(p.name)}</b><small>${!p.global && p.projects?.length ? 'projet : ' + esc(p.projects.map((x) => x.name).join(', ')) + '<br>' : ''}${esc(p.fr?.resume || CAT[p.cat].label)}${nl ? `<br>utilisée dans ${plural(nl, 'projet', 'projets')}` : ''}</small>`;
    return `<b>${esc(p.name)}</b><small>${STATUS[p.status].label} · ${plural(p.sessions.length, 'conversation', 'conversations')}<br>modifié ${ago(p.lastActivity)}${nl ? `<br>${plural(nl, 'compétence utilisée', 'compétences utilisées')}` : ''}</small>`;
  }
  const s = h.moon.session;
  if (h.moon.planet.kind === 'cap') return `<b>${esc(s.title)}</b><small>${esc(s.sub || '')}${s.desc ? ' · ' + esc(s.desc.slice(0, 140)) + (s.desc.length > 140 ? '…' : '') : ''}</small>`;
  return `<b>${esc(s.title)}</b><small>${ago(s.updated)} · double-clic pour la reprendre</small>`;
}

const tip = $('#tooltip');
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (flight || ev.buttons) { tip.hidden = true; return; }
  const h = pick(ev);
  hovered = h;
  renderer.domElement.style.cursor = h ? 'pointer' : '';
  if (!h) { tip.hidden = true; return; }
  tip.innerHTML = tooltipHtml(h); tip.style.left = ev.clientX + 'px'; tip.style.top = ev.clientY + 'px'; tip.hidden = false;
});
renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; });
renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; flight = null; });
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return;
  const h = pick(ev);
  if (!h) return;
  tip.hidden = true;
  activate(h);
});

function activate(h) {
  if (h.kind === 'galaxy') focusGalaxy(h.gal);
  else if (h.kind === 'sun') focusSystem(h.sys);
  else if (h.kind === 'planet') focusPlanet(h.planet);
  else if (h.kind === 'moon') {
    const pl = h.moon.planet;
    if (state.planet !== pl) focusPlanet(pl);
    state.hotSession = h.moon.session.id;
    pl.kind === 'project' ? renderProjectPanel(pl) : renderCapPanel(pl);
    scrollToHot();
  }
}
renderer.domElement.addEventListener('dblclick', (ev) => {
  const h = pick(ev);
  if (h?.kind === 'moon' && h.moon.planet.kind === 'project') resume(h.moon.planet.p, h.moon.session);
});

// =====================================================================
// Boucle de rendu
// =====================================================================
const clock = new THREE.Clock();
let viewShift = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

  for (const sys of systems) {
    const frozen = state.view === 'planet' && state.sys === sys;
    if (sys.halo && !sys.errant) sys.halo.material.opacity = (state.sys === sys ? 0.22 : 0.45) + Math.sin(t * 0.8 + sys.pos.x) * 0.04;
    for (const pl of sys.planets) {
      let a = angles.get(pl.p.key);
      if (!frozen) { a += pl.speed * dt; angles.set(pl.p.key, a); }
      pl.holder.position.set(Math.cos(a) * pl.R, 0, Math.sin(a) * pl.R);
      pl.mesh.rotation.y += dt * 0.25;
      const atmoTarget = state.view === 'galaxy' || state.view === 'universe' ? pl.atmoOp : 0;
      pl.atmo.material.opacity += (atmoTarget - pl.atmo.material.opacity) * Math.min(1, dt * 4);
      const moonK = state.planet === pl ? 0.25 : 1;
      for (const m of pl.moons) { m.angle += m.speed * dt * moonK; m.holder.position.set(Math.cos(m.angle) * m.R, 0, Math.sin(m.angle) * m.R); }
    }
  }

  const dustTarget = { universe: 0.32, galaxy: 0.32, system: 0.05, planet: 0.015 }[state.view];
  for (const gal of galaxies) {
    const want = state.gal && state.gal !== gal && state.view !== 'galaxy' ? 0.2 : dustTarget;
    gal.dust.material.opacity += (want - gal.dust.material.opacity) * Math.min(1, dt * 3);
  }

  if (flight) {
    const k = Math.min(1, (performance.now() - flight.t0) / flight.dur), e = ease(k);
    camera.position.lerpVectors(flight.fromP, flight.toP, e);
    controls.target.lerpVectors(flight.fromT, flight.toT, e);
    if (k >= 1) flight = null;
  }
  const wantShift = document.body.classList.contains('panel-open') ? Math.min(200, innerWidth * 0.14) : 0;
  viewShift += (wantShift - viewShift) * Math.min(1, dt * 5);
  if (Math.abs(viewShift) > 0.5) camera.setViewOffset(innerWidth, innerHeight, viewShift, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  controls.update();
  updateLabels();
  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function setLabel(o, visible, opacity = 1, hot = false) {
  o.visible = visible;
  if (visible) { o.element.style.opacity = opacity.toFixed(2); o.element.classList.toggle('hot', hot); }
}

function updateLabels() {
  const v = state.view;
  setLabel(center.label, v === 'universe', 1);
  for (const gal of galaxies) {
    const focusedG = state.gal === gal;
    setLabel(gal.label, v === 'universe' || (v === 'galaxy' && !focusedG), v === 'universe' ? 1 : 0.6, hovered?.gal === gal);
    for (const sys of gal.systems) {
      const d = camera.position.distanceTo(sys.wpos);
      const focused = state.sys === sys;
      const sunVisible = focusedG && ((v === 'galaxy') || (!focused && d < 260));
      setLabel(sys.label, sunVisible, Math.max(0.35, Math.min(1, 1.5 - d / 900)), hovered?.sys === sys);
      for (const pl of sys.planets) {
        const show = v !== 'universe' && shown(pl.pivot) && ((focused && v !== 'galaxy') || d < 120);
        const isFocus = state.planet === pl;
        setLabel(pl.label, show, v === 'planet' && !isFocus ? 0.45 : 1, isFocus || hovered?.planet === pl);
        for (const m of pl.moons) setLabel(m.label, isFocus, 1, state.hotSession === m.session.id || hovered?.moon === m);
      }
    }
  }
}

// =====================================================================
// Interface : stats, légende, fil d'Ariane
// =====================================================================
function updateStats() {
  const { projects, caps } = state.data;
  const sessions = projects.reduce((s, p) => s + p.sessions.length, 0);
  $('#stats').textContent = `${plural(projects.length, 'projet', 'projets')} · ${plural(caps.length, 'compétence', 'compétences')} · ${plural(sessions, 'conversation', 'conversations')}`;
}

function renderLegend() {
  const el = $('#legend');
  if (state.view === 'universe') {
    el.innerHTML = `<span class="hint btn">Clique sur une galaxie pour y entrer · molette pour zoomer · glisser pour tourner</span>`;
    return;
  }
  if (state.gal?.id === 'competences') {
    el.innerHTML = Object.entries(CAT).map(([k, c]) => {
      const n = state.data.caps.filter((x) => x.cat === k).length;
      return n ? `<button data-cat="${k}"><i style="background:${c.color};color:${c.color}"></i>${c.label} <em>${n}</em></button>` : '';
    }).join('') + `<span class="hint btn">soleil = famille · planète = compétence · lune = contenu</span>`;
    el.querySelectorAll('button[data-cat]').forEach((b) => b.onclick = () => { const s = systems.find((x) => x.id === 'cat:' + b.dataset.cat); if (s) focusSystem(s); });
    return;
  }
  const counts = {};
  const inView = state.gal ? state.gal.systems.flatMap((s) => s.items) : state.data.projects;
  for (const p of inView) counts[p.status] = (counts[p.status] || 0) + 1;
  el.innerHTML = Object.entries(STATUS).map(([k, s]) =>
    `<button data-st="${k}" class="${state.filters.has(k) ? '' : 'off'}" title="Afficher / masquer"><i style="background:${s.color};color:${s.color}"></i>${s.label} <em>${counts[k] || 0}</em></button>`).join('')
    + `<span class="hint btn">soleil = thème · planète = projet · lune = conversation</span>`;
  el.querySelectorAll('button[data-st]').forEach((b) => b.onclick = () => {
    const k = b.dataset.st;
    state.filters.has(k) ? state.filters.delete(k) : state.filters.add(k);
    for (const s of systems) for (const pl of s.planets) applyFilter(pl);
    renderLegend();
  });
}

function renderCrumbs() {
  const el = $('#crumbs');
  if (state.view === 'universe') { el.hidden = true; return; }
  el.hidden = false;
  const parts = [`<button class="back" data-go="back">← Retour</button>`, `<button data-go="universe">Univers</button>`];
  const here = (t) => `<span>/</span><b class="here">${esc(t)}</b>`;
  const link = (go, t) => `<span>/</span><button data-go="${go}">${esc(t)}</button>`;
  if (state.view === 'galaxy') parts.push(here(state.gal.name));
  if (state.view === 'system') parts.push(link('galaxy', state.gal.name), here(state.sys.name));
  if (state.view === 'planet') parts.push(link('galaxy', state.gal.name), link('system', state.sys.name), here(planetName(state.planet)));
  el.innerHTML = parts.join('');
  el.querySelector('[data-go="back"]').onclick = back;
  el.querySelector('[data-go="universe"]').onclick = () => focusUniverse();
  el.querySelector('[data-go="galaxy"]')?.addEventListener('click', () => focusGalaxy(state.gal));
  el.querySelector('[data-go="system"]')?.addEventListener('click', () => focusSystem(state.sys));
}

// =====================================================================
// Panneau latéral
// =====================================================================
const panel = $('#panel');
function openPanel(html) {
  panel.innerHTML = `<button class="x" title="Fermer (Échap)">✕</button>` + html; panel.querySelector('.x').onclick = back; document.body.classList.add('panel-open'); panel.scrollTop = 0;
  // pastilles des liens : clic pour s'y rendre, survol pour voir le fil
  panel.querySelectorAll('[data-link]').forEach((b) => {
    const pl = findPlanet(b.dataset.link);
    b.onclick = () => pl && focusPlanet(pl);
    b.onmouseenter = () => { if (pl) hovered = { kind: 'planet', planet: pl }; };
    b.onmouseleave = () => { hovered = null; };
  });
}

// Pastilles des planètes reliées à `pl` (compétences d'un projet, ou projets d'une compétence)
function linkChips(pl, title, hint) {
  const ls = (pl.links || []).slice().sort((x, y) => y.n - x.n);
  if (!ls.length) return '';
  const chips = ls.map((l) => {
    const o = l.a === pl ? l.b : l.a;
    const c = o.kind === 'cap' ? CAT[o.p.cat].color : STATUS[o.p.status].color;
    return `<button class="chip" data-link="${esc(o.p.key)}" title="Aller sur ${esc(o.p.name)}"><i style="background:${c}"></i>${esc(o.p.name)} <em>${l.n}</em></button>`;
  }).join('');
  return `<section><h3><span>${title}</span><span>${ls.length}</span></h3><p class="sub-note">${hint}</p><div class="chips">${chips}</div></section>`;
}
function closePanel() { document.body.classList.remove('panel-open'); }
function scrollToHot() { panel.querySelector('li.hot')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

function renderGalaxyPanel(gal) {
  const isProj = gal.kind === 'project';
  const total = gal.systems.reduce((s, x) => s + x.items.length, 0);
  const nProjGal = galaxies.filter((g) => g.kind === 'project').length;
  const list = gal.systems.map((s) => `
    <li data-sys="${esc(s.id)}">
      <span class="dot" style="background:${s.color};box-shadow:0 0 8px ${s.color}"></span>
      <span class="t"><b>${esc(s.name)}</b><small>${isProj ? plural(s.items.length, 'projet', 'projets') + (s.lastActivity ? ' · actif ' + ago(s.lastActivity) : '') : esc(CAT[s.cat].blurb)}</small></span>
      <span class="go">→</span>
    </li>`).join('');
  openPanel(`
    <div class="eyebrow">Galaxie</div>
    ${isProj ? `<input class="title-input" id="g-name" value="${esc(gal.name)}" maxlength="40" title="Clique pour renommer">` : `<h2>${esc(gal.name)}</h2>`}
    <p class="lede">${isProj
      ? `${plural(gal.systems.length, 'soleil', 'soleils')} · ${plural(total, 'projet', 'projets')}. Chaque soleil est un thème, chaque planète un projet, chaque lune une conversation avec Claude.`
      : `${plural(total, 'compétence', 'compétences')} installées sur ta machine. Tout ce que Claude sait faire en plus, rangé par famille.`}</p>
    ${isProj ? `<div class="actions"><button class="btn primary" id="g-new">+ Nouveau projet</button><button class="btn small" id="g-theme">+ Nouveau thème</button></div>` : ''}
    <section><h3>${isProj ? 'Soleils · thèmes' : 'Soleils · familles'}</h3>${list ? `<ul class="list">${list}</ul>` : `<p class="empty-note">Aucun soleil pour l’instant. Crée un thème ici, ou déplace un thème existant dans cette galaxie depuis sa fiche.</p>`}</section>
    ${isProj ? `<section><h3>Galaxies de projets</h3><p class="sub-note">Range tes thèmes dans plusieurs galaxies : le pro, le perso, une association…</p>
      <div class="actions"><button class="btn small" id="g-add">+ Nouvelle galaxie</button></div></section>
      ${nProjGal > 1 ? `<div class="foot"><button class="linkish" id="g-del">Supprimer cette galaxie</button></div>` : ''}` : ''}`);
  panel.querySelectorAll('li[data-sys]').forEach((li) => {
    const s = gal.systems.find((x) => x.id === li.dataset.sys);
    li.onclick = () => focusSystem(s);
    li.onmouseenter = () => { hovered = { kind: 'sun', sys: s }; };
    li.onmouseleave = () => { hovered = null; };
  });
  $('#g-new')?.addEventListener('click', () => openNewProject());
  $('#g-theme')?.addEventListener('click', () => newThemeFlow(gal.id));
  if (!isProj) return;
  const name = $('#g-name');
  name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); if (e.key === 'Escape') { name.value = gal.name; name.blur(); } };
  name.onblur = async () => {
    const v = name.value.trim();
    if (!v || v === gal.name) { name.value = gal.name; return; }
    await save(() => api.post('/api/domain', { action: 'update', id: gal.id, name: v }), 'Galaxie renommée');
  };
  $('#g-add').onclick = async () => {
    const id = await openNewDomain();
    if (!id) return;
    await load(); lastSig = sig(state.data);
    toast('Une nouvelle galaxie se forme ✦');
    const g = galaxies.find((x) => x.id === id); if (g) focusGalaxy(g);
  };
  const del = $('#g-del');
  if (del) del.onclick = async () => {
    const first = galaxies.find((g) => g.kind === 'project' && g !== gal);
    const nThemes = gal.systems.filter((s) => !s.errant).length;
    if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = nThemes ? `Confirmer : ses ${plural(nThemes, 'thème rejoindra', 'thèmes rejoindront')} « ${first.name} »` : 'Confirmer la suppression'; return; }
    await save(() => api.post('/api/domain', { action: 'delete', id: gal.id }), 'Galaxie supprimée', { keepFocus: false });
    focusUniverse();
  };
}

function bindPlanetList(sys) {
  panel.querySelectorAll('li[data-key]').forEach((li) => {
    const pl = sys.planets.find((x) => x.p.key === li.dataset.key);
    li.onclick = () => pl && focusPlanet(pl);
    li.onmouseenter = () => { hovered = { kind: 'planet', planet: pl }; };
    li.onmouseleave = () => { hovered = null; };
  });
}

function renderCatPanel(sys) {
  const c = CAT[sys.cat];
  const list = sys.items.map((p) => `
    <li data-key="${esc(p.key)}">
      <span class="dot" style="background:${c.color};box-shadow:0 0 8px ${c.color}${p.enabled === false ? ';opacity:.35' : ''}"></span>
      <span class="t"><b>${esc(p.name)}</b><small>${!p.global && p.projects?.length ? `<span class="proj-tag">projet : ${esc(p.projects.map((x) => x.name).join(', '))}</span> · ` : ''}${esc(p.fr?.resume || p.detail || (p.description || '').slice(0, 90))}</small></span>
      <span class="go">→</span>
    </li>`).join('');
  openPanel(`
    <div class="eyebrow">Soleil · <button id="cp-gal">Compétences</button></div>
    <h2>${esc(c.label)}</h2>
    <p class="lede">${esc(c.blurb)}</p>
    <section><h3><span>Planètes</span><span>${sys.items.length}</span></h3><ul class="list">${list}</ul></section>`);
  $('#cp-gal').onclick = () => focusGalaxy(sys.gal);
  bindPlanetList(sys);
}

function renderCapPanel(pl, editing = false) {
  const p = pl.p, c = CAT[p.cat], fr = p.fr || {};
  const rows = [];
  if (p.cat === 'skill' && p.command) rows.push(['Utilisation', `Tape <code>${esc(p.name)}</code> dans Claude, dans ce projet.`]);
  else if (p.cat === 'skill') rows.push(['Utilisation', `Claude le charge tout seul quand le sujet s’y prête. Tu peux aussi taper <code>/${esc(p.name)}</code>.`]);
  if (p.cat === 'skill' && p.projects?.length) rows.push(['Disponible', 'seulement dans ' + projLinks(p)]);
  if (p.cat === 'skill' && p.synced) rows.push(['Origine', 'Synchronisé depuis claude.ai']);
  if (p.cat === 'plugin') { rows.push(['Source', esc(p.detail)]); rows.push(['État', p.enabled === false ? 'Désactivé' : 'Activé']); }
  if (p.cat === 'mcp') { rows.push(['Type', esc(p.description)]); rows.push(['Adresse', `<code>${esc(p.detail)}</code>`]); rows.push(['Disponible', p.global ? 'tous les projets' + (p.projects?.length ? ', et déclaré dans ' + projLinks(p) : '') : 'seulement dans ' + projLinks(p)]); }
  if (p.cat === 'connector') rows.push(['Via', 'ton compte claude.ai']);
  const kids = moonsOf('cap', p);
  const list = kids.map((s) => `
    <li data-sid="${esc(s.id)}" class="${state.hotSession === s.id ? 'hot' : ''} tall">
      <span class="moon"></span>
      <span class="t"><b>${esc(s.title)}</b><small class="kind">${esc(s.sub)}</small>${s.desc ? `<small class="desc">${esc(s.desc)}</small>` : ''}</span>
    </li>`).join('');

  const textBlock = editing ? `
    <section class="fr-edit">
      <h3>C’est quoi</h3><textarea class="field" id="fr-resume" placeholder="En une ou deux phrases…">${esc(fr.resume)}</textarea>
      <h3>Quand t’en servir</h3><textarea class="field" id="fr-quand" placeholder="Dans quelle situation…">${esc(fr.quand)}</textarea>
      <h3>Exemple à dire à Claude</h3><input class="field" id="fr-exemple" placeholder="ex. Rends ce texte moins IA" value="${esc(fr.exemple)}">
      <div class="actions" style="margin-top:12px">
        <button class="btn small primary" id="fr-save">Enregistrer</button>
        <button class="btn small" id="fr-cancel">Annuler</button>
        ${p.frCustom ? '<button class="linkish" id="fr-reset" style="margin-left:auto">Revenir au texte d’origine</button>' : ''}
      </div>
    </section>` : `
    <section class="fr">
      ${fr.resume ? `<p class="fr-resume">${esc(fr.resume)}</p>` : `<p class="empty-note">Pas encore de description en français.</p><p class="hint-cmd">Tape <code>/galaxie:decrire</code> dans Claude Code : il écrira les descriptions de toutes tes compétences.</p>`}
      ${fr.quand ? `<h3>Quand t’en servir</h3><p>${esc(fr.quand)}</p>` : ''}
      ${fr.exemple ? `<h3>Exemple à dire à Claude</h3><button class="example" id="fr-copy" title="Copier">« ${esc(fr.exemple)} »<span>copier</span></button>` : ''}
      <button class="linkish edit" id="fr-edit">${fr.resume ? 'Modifier la description' : 'Écrire une description'}</button>
    </section>`;

  openPanel(`
    <div class="eyebrow">Planète · <button id="cp-sys">${esc(c.label)}</button></div>
    <h2>${esc(p.name)}</h2>
    ${p.path ? `<p class="path">${esc(p.path)}</p>` : '<p class="path"></p>'}
    ${textBlock}
    ${p.path ? `<div class="actions" style="margin-top:16px"><button class="btn small" id="cp-folder">Ouvrir le dossier</button></div>` : ''}
    <section><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>
    ${linkChips(pl, 'Utilisée dans', 'Les projets où Claude s’en est servi. Le nombre indique combien de conversations.')}
    ${p.description && p.cat !== 'mcp' && p.cat !== 'connector' ? `<section><details class="orig"><summary>Description d’origine</summary><p>${esc(p.description)}</p></details></section>` : ''}
    ${kids.length ? `<section><h3><span>Lunes · contenu</span><span>${kids.length}</span></h3><ul class="list">${list}</ul></section>` : ''}`);

  $('#cp-sys').onclick = () => focusSystem(pl.sys);
  bindProjLinks();
  $('#cp-folder')?.addEventListener('click', () => api.post('/api/open', { cap: p.key }).catch((e) => toast(e.message, true)));
  $('#fr-edit')?.addEventListener('click', () => renderCapPanel(pl, true));
  $('#fr-cancel')?.addEventListener('click', () => renderCapPanel(pl));
  $('#fr-copy')?.addEventListener('click', () => navigator.clipboard.writeText(fr.exemple).then(() => toast('Exemple copié, colle-le dans Claude')).catch(() => toast('Copie impossible', true)));
  const saveText = async (body, msg) => {
    try {
      await api.post('/api/captext', { key: p.textKey, ...body });
      const st = snapshot(); await load(); lastSig = sig(state.data); restore(st, false); toast(msg);
    } catch (e) { toast(e.message, true); }
  };
  $('#fr-save')?.addEventListener('click', () => saveText({ resume: $('#fr-resume').value.trim(), quand: $('#fr-quand').value.trim(), exemple: $('#fr-exemple').value.trim() }, 'Description enregistrée'));
  $('#fr-reset')?.addEventListener('click', () => saveText({ reset: true }, 'Texte d’origine rétabli'));
  if (editing) $('#fr-resume').focus();

  panel.querySelectorAll('li[data-sid]').forEach((li) => {
    const m = pl.moons.find((x) => x.session.id === li.dataset.sid);
    li.onmouseenter = () => { hovered = m ? { kind: 'moon', moon: m } : null; };
    li.onmouseleave = () => { hovered = null; };
  });
}

function renderThemePanel(sys) {
  const n = sys.items.length;
  const sessions = sys.items.reduce((s, p) => s + p.sessions.length, 0);
  const list = sys.items.map((p) => `
    <li data-key="${esc(p.key)}">
      <span class="dot" style="background:${STATUS[p.status].color};box-shadow:0 0 8px ${STATUS[p.status].color}"></span>
      <span class="t"><b>${esc(p.name)}</b><small>${STATUS[p.status].label} · ${plural(p.sessions.length, 'conversation', 'conversations')} · ${ago(p.lastActivity)}</small></span>
      <span class="go">→</span>
    </li>`).join('');

  if (sys.errant) {
    openPanel(`
      <div class="eyebrow">Hors thème</div>
      <h2>Planètes errantes</h2>
      <p class="lede">Les projets sans thème dérivent ici. Ouvre-en un et choisis son soleil : il ira se mettre en orbite.</p>
      <section><h3><span>${plural(n, 'planète', 'planètes')}</span></h3><ul class="list">${list}</ul></section>`);
  } else {
    openPanel(`
      <div class="eyebrow">Soleil · thème</div>
      <input class="title-input" id="th-name" value="${esc(sys.name)}" maxlength="40" title="Clique pour renommer">
      <p class="lede">${plural(n, 'planète', 'planètes')} · ${plural(sessions, 'conversation', 'conversations')} · actif ${ago(sys.lastActivity)}</p>
      <div class="actions"><button class="btn primary" id="th-add">+ Nouveau projet dans ce thème</button></div>
      <section><h3>Couleur</h3><div class="swatches">${THEME_COLORS.map((c) => `<button class="swatch ${c === sys.color ? 'on' : ''}" data-c="${c}" style="background:${c};color:${c}" title="${c}"></button>`).join('')}</div></section>
      <section><h3>Galaxie</h3>${domainSelect('th-domain', sys.gal.id).replace('</select>', '<option value="__new__">+ Nouvelle galaxie…</option></select>')}</section>
      <section><h3><span>Planètes</span></h3>${n ? `<ul class="list">${list}</ul>` : `<p class="empty-note">Aucune planète en orbite. Crée un projet ici, ou range un projet existant dans ce thème depuis sa fiche.</p>`}</section>
      <div class="foot"><button class="linkish" id="th-del">Supprimer ce thème</button></div>`);
    const name = $('#th-name');
    name.onkeydown = (e) => { if (e.key === 'Enter') name.blur(); if (e.key === 'Escape') { name.value = sys.name; name.blur(); } };
    name.onblur = async () => {
      const v = name.value.trim();
      if (!v || v === sys.name) { name.value = sys.name; return; }
      await save(() => api.post('/api/theme', { action: 'update', id: sys.id, name: v }), 'Thème renommé');
    };
    panel.querySelectorAll('.swatch').forEach((b) => b.onclick = () => save(() => api.post('/api/theme', { action: 'update', id: sys.id, color: b.dataset.c })));
    $('#th-add').onclick = () => openNewProject(sys.id);
    $('#th-domain').onchange = async (e) => {
      let v = e.target.value;
      if (v === '__new__') {
        v = await openNewDomain();
        if (!v) { e.target.value = sys.gal.id; return; }
      }
      await save(() => api.post('/api/theme', { action: 'update', id: sys.id, domain: v }), 'Le soleil part vers une autre galaxie…');
    };
    const del = $('#th-del');
    del.onclick = async () => {
      if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = n ? `Confirmer : ses ${n} planètes deviendront errantes` : 'Confirmer la suppression'; return; }
      const gal = sys.gal;
      await save(() => api.post('/api/theme', { action: 'delete', id: sys.id }), 'Thème supprimé', { keepFocus: false });
      focusGalaxy(galaxies.find((g) => g.id === gal.id));
    };
  }
  bindPlanetList(sys);
}

function renderProjectPanel(pl) {
  const p = pl.p, themes = state.data.themes;
  const st = Object.entries(STATUS).map(([k, s]) =>
    `<button class="chip ${p.status === k ? 'on' : ''} ${p.status === k && p.statusAuto ? 'auto' : ''}" data-st="${k}"><i style="background:${s.color}"></i>${s.label}</button>`).join('');
  const moons = p.sessions.map((s) => `
    <li data-sid="${esc(s.id)}" class="${state.hotSession === s.id ? 'hot' : ''}">
      <span class="moon"></span>
      <span class="t"><b title="${esc(s.title)}">${esc(s.title)}</b><small>${ago(s.updated)}${s.from ? ` · commencée dans ${esc(s.from)}` : ''}</small></span>
      <button class="btn small go" data-resume="${esc(s.id)}">Reprendre</button>
    </li>`).join('');

  openPanel(`
    <div class="eyebrow">Planète · ${pl.sys.errant ? 'errante' : `<button id="pp-theme-link">${esc(pl.sys.name)}</button>`}</div>
    <h2>${esc(p.name)}</h2>
    <p class="path">${esc(p.path)}</p>
    <h3 class="launch-title">Nouvelle conversation avec Claude</h3>
    <div class="launch">
      <button class="btn primary" id="pp-launch" title="Ouvre Claude Code dans le terminal, dans ce dossier">
        <span class="ico">›_</span><span><b>Claude Code</b><small>dans le terminal</small></span>
      </button>
      <button class="btn primary alt" id="pp-desktop" title="Ouvre Claude Desktop (onglet Code) sur ce dossier">
        <span class="ico">✦</span><span><b>Claude Desktop</b><small>l’application</small></span>
      </button>
    </div>
    <div class="actions">
      <button class="btn small" id="pp-folder">Ouvrir le dossier</button>
      ${state.data.hasCode ? '<button class="btn small" id="pp-code">VS Code</button>' : ''}
      ${p.url ? `<a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">Voir le site ↗</a>` : ''}
    </div>
    <section><h3>Thème</h3>
      <select class="field" id="pp-theme">
        ${themeOptions(p.theme)}
        <option value="" ${!p.theme ? 'selected' : ''}>— Aucun (planète errante)</option>
        <option value="__new__">+ Nouveau thème…</option>
      </select>
    </section>
    <section><h3>Statut</h3><div class="chips">${st}</div></section>
    ${linkChips(pl, 'Compétences utilisées', 'Le nombre indique dans combien de conversations elle a servi.')}
    <section><h3>Note</h3><textarea class="field" id="pp-note" placeholder="Où j'en suis, prochaine étape, client…">${esc(p.note)}</textarea></section>
    <section><h3>Adresse du site</h3><input class="field" id="pp-url" type="url" placeholder="https://…" value="${esc(p.url)}"></section>
    <section><h3><span>Lunes · conversations</span><span>${p.sessions.length}</span></h3>
      ${p.sessions.length ? `<ul class="list">${moons}</ul>` : `<p class="empty-note">Pas encore de lune. Lance une première conversation et elle se mettra en orbite.</p>`}
    </section>
    <div class="foot"><button class="linkish" id="pp-hide">Retirer cette planète de la galaxie</button></div>`);

  $('#pp-theme-link')?.addEventListener('click', () => focusSystem(pl.sys));
  $('#pp-launch').onclick = () => api.post('/api/launch', { path: p.path }).then(() => toast('Claude Code s’ouvre dans le terminal…')).catch((e) => toast(e.message, true));
  $('#pp-desktop').onclick = () => api.post('/api/launch', { path: p.path, app: 'desktop' }).then(() => toast('Claude Desktop s’ouvre : confirme le dossier dans la fenêtre')).catch((e) => toast(e.message, true));
  $('#pp-folder').onclick = () => api.post('/api/open', { path: p.path, app: 'explorer' }).catch((e) => toast(e.message, true));
  $('#pp-code')?.addEventListener('click', () => api.post('/api/open', { path: p.path, app: 'code' }).catch((e) => toast(e.message, true)));

  $('#pp-theme').onchange = async (e) => {
    let v = e.target.value;
    if (v === '__new__') {
      const id = await openNewTheme();
      if (!id) { e.target.value = p.theme || ''; return; }
      v = id;
    }
    await save(() => api.post('/api/project', { path: p.path, theme: v || null }), 'La planète change d’orbite…');
  };
  panel.querySelectorAll('.chip[data-st]').forEach((b) => b.onclick = async () => {
    const k = b.dataset.st;
    try {
      await api.post('/api/project', { path: p.path, status: k });
      p.status = k; p.statusAuto = false;
      repaintPlanet(pl); renderLegend(); renderProjectPanel(pl);
    } catch (e) { toast(e.message, true); }
  });
  const note = $('#pp-note');
  note.onblur = () => { if (note.value !== p.note) api.post('/api/project', { path: p.path, note: note.value }).then(() => { p.note = note.value; toast('Note enregistrée'); }).catch((e) => toast(e.message, true)); };
  const url = $('#pp-url');
  url.onchange = () => api.post('/api/project', { path: p.path, url: url.value }).then(() => { p.url = url.value.trim(); renderProjectPanel(pl); toast('Adresse enregistrée'); }).catch((e) => toast(e.message, true));
  const hide = $('#pp-hide');
  hide.onclick = async () => {
    if (!hide.dataset.armed) { hide.dataset.armed = '1'; hide.textContent = 'Confirmer (le dossier n’est pas supprimé)'; return; }
    const sysId = pl.sys.id;
    await save(() => api.post('/api/project', { path: p.path, hidden: true }), 'Planète retirée de la galaxie', { keepFocus: false });
    const ns = systems.find((s) => s.id === sysId); ns ? focusSystem(ns) : focusGalaxy(galaxies[0]);
  };

  panel.querySelectorAll('li[data-sid]').forEach((li) => {
    const s = p.sessions.find((x) => x.id === li.dataset.sid);
    li.onmouseenter = () => { const m = pl.moons.find((x) => x.session.id === s.id); hovered = m ? { kind: 'moon', moon: m } : null; };
    li.onmouseleave = () => { hovered = null; };
    li.onclick = (e) => { if (!e.target.dataset.resume) { state.hotSession = s.id; panel.querySelectorAll('li.hot').forEach((x) => x.classList.remove('hot')); li.classList.add('hot'); } };
  });
  panel.querySelectorAll('[data-resume]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    resume(p, p.sessions.find((x) => x.id === b.dataset.resume));
  });
}

function resume(p, s) {
  api.post('/api/launch', { path: p.path, sessionId: s.id })
    .then(() => toast(`Reprise de « ${s.title.slice(0, 40)} »…`))
    .catch((e) => toast(e.message, true));
}

function repaintPlanet(pl) {
  const p = pl.p, c = STATUS[p.status].color;
  const dim = p.status === 'archive';
  if (pl.dim !== dim) { pl.mesh.material.map.dispose(); pl.mesh.material.map = planetTexture(hash(p.key), dim).map; pl.mesh.material.needsUpdate = true; pl.dim = dim; }
  pl.atmo.material.color.set(c);
  pl.label.element.querySelector('i').style.background = c;
  applyFilter(pl);
}

// =====================================================================
// Chargement & sauvegarde
// =====================================================================
async function load() {
  state.data = await api.galaxy();
  buildUniverse();
}

const snapshot = () => ({ view: state.view, galId: state.gal?.id, sysId: state.sys?.id, key: state.planet?.p.key });
function findPlanet(key) { for (const s of systems) { const pl = s.planets.find((x) => x.p.key === key); if (pl) return pl; } return null; }
function restore(st, fly = true) {
  if (st.view === 'planet') { const pl = findPlanet(st.key); if (pl) return focusPlanet(pl, fly); }
  if (st.view === 'system' || st.view === 'planet') { const s = systems.find((x) => x.id === st.sysId); if (s) return focusSystem(s, fly); }
  if (st.view !== 'universe') { const g = galaxies.find((x) => x.id === st.galId); if (g) return focusGalaxy(g, fly); }
  focusUniverse(fly);
}

// Sauvegarde, recharge l'univers et revient sur le même objet
async function save(fn, msg, { keepFocus = true } = {}) {
  try {
    await fn();
    const st = snapshot();
    await load();
    lastSig = sig(state.data);
    if (msg) toast(msg);
    if (keepFocus) restore(st);
  } catch (e) { toast(e.message, true); }
}

// Quand on revient sur la page (après une session Claude), on rafraîchit
let lastSig = '';
const sig = (d) => JSON.stringify([d.domains, d.themes,d.caps.map((c) => [c.key, c.fr]), d.projects.map((p) => [p.key, p.theme, p.status, p.sessions.length, p.sessions[0]?.title])]);
addEventListener('focus', async () => {
  if ($('#dlg').open || document.activeElement?.matches('input, textarea')) return;
  const d = await api.galaxy().catch(() => null);
  if (!d || sig(d) === lastSig) return;
  lastSig = sig(d);
  const st = snapshot();
  state.data = d; buildUniverse();
  restore(st, false);
});

// =====================================================================
// Recherche
// =====================================================================
const search = $('#search'), results = $('#results');
let found = [], sel = 0;
function norm(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
search.oninput = () => {
  const q = norm(search.value.trim());
  if (!q) { results.hidden = true; return; }
  found = [];
  for (const g of galaxies) if (norm(g.name).includes(q)) found.push({ type: 'gal', gal: g, title: g.name, sub: 'Galaxie' });
  for (const s of systems) {
    if (!s.errant && norm(s.name).includes(q)) found.push({ type: 'sys', sys: s, title: s.name, sub: `Soleil · ${s.gal.name}` });
    for (const pl of s.planets) {
      const p = pl.p;
      if (pl.kind === 'project') {
        if (norm(p.name).includes(q) || norm(p.note).includes(q)) found.push({ type: 'planet', pl, title: p.name, sub: `Projet · ${s.name}` });
        for (const se of p.sessions) if (norm(se.title).includes(q)) found.push({ type: 'moon', pl, id: se.id, title: se.title, sub: `Conversation · ${p.name}` });
      } else {
        if (norm(p.name).includes(q) || norm(p.description).includes(q) || norm(p.fr?.resume).includes(q) || norm(p.fr?.quand).includes(q)) found.push({ type: 'planet', pl, title: p.name, sub: `${CAT[p.cat].label}${p.detail ? ' · ' + p.detail : ''}` });
        moonsOf('cap', p).forEach((m) => { if (norm(m.title).includes(q) || norm(m.desc).includes(q)) found.push({ type: 'moon', pl, id: m.id, title: m.title, sub: `${m.sub} · ${p.name}` }); });
      }
    }
  }
  // Les meilleurs résultats d'abord : nom qui commence par la recherche, puis galaxies,
  // thèmes et projets avant les conversations (l'ordre d'origine est gardé à égalité).
  const rank = (f) => (norm(f.title).startsWith(q) ? 0 : norm(f.title).includes(q) ? 1 : 2) * 2 + (f.type === 'moon' ? 1 : 0);
  found = found.map((f, i) => [rank(f), i, f]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  found = found.slice(0, 40); sel = 0;
  results.innerHTML = found.length ? found.map((f, i) => `<li data-i="${i}" class="${i === 0 ? 'sel' : ''}"><b>${esc(f.title)}</b><small>${esc(f.sub)}</small></li>`).join('') : '<li class="empty">Rien dans cet univers…</li>';
  results.hidden = false;
  results.querySelectorAll('li[data-i]').forEach((li) => li.onmousedown = (e) => { e.preventDefault(); go(found[+li.dataset.i]); });
};
search.onkeydown = (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!found.length) return;
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length;
    results.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', i === sel));
  } else if (e.key === 'Enter' && found[sel]) go(found[sel]);
  else if (e.key === 'Escape') { search.value = ''; results.hidden = true; search.blur(); }
};
search.onblur = () => setTimeout(() => { results.hidden = true; }, 120);
function go(f) {
  results.hidden = true; search.blur();
  if (f.type === 'gal') return focusGalaxy(f.gal);
  if (f.type === 'sys') return focusSystem(f.sys);
  if (!shown(f.pl.pivot)) { state.filters.add(f.pl.p.status); applyFilter(f.pl); }
  focusPlanet(f.pl);
  if (f.type === 'moon') {
    state.hotSession = f.id;
    f.pl.kind === 'project' ? renderProjectPanel(f.pl) : renderCapPanel(f.pl);
    scrollToHot();
  }
}
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); search.focus(); }
  if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); search.focus(); search.select(); }
});

// =====================================================================
// Dialogues : nouveau projet, nouveau thème
// =====================================================================
const dlg = $('#dlg');
function openNewProject(themeId = state.sys && state.sys.kind === 'project' && !state.sys.errant ? state.sys.id : '') {
  const themes = state.data.themes;
  dlg.innerHTML = `
    <form method="dialog" id="f">
      <h2>Nouvelle planète</h2>
      <p>Un dossier est créé dans <code>${esc(state.data.newProjectRoot)}</code>, puis Claude s’ouvre dedans.</p>
      <label for="f-name">Nom du projet</label>
      <input class="field" id="f-name" required maxlength="60" placeholder="ex. site-boulangerie" autocomplete="off">
      <label for="f-theme">Thème</label>
      <select class="field" id="f-theme">
        ${themeOptions(themeId)}
        <option value="" ${!themeId ? 'selected' : ''}>— Aucun (planète errante)</option>
      </select>
      <div class="err" id="f-err"></div>
      <div class="row"><button class="btn" value="cancel" formnovalidate>Annuler</button><button class="btn primary" id="f-ok">Créer et lancer Claude</button></div>
    </form>`;
  dlg.onclose = null;
  dlg.showModal();
  $('#f').onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const name = $('#f-name').value.trim(), theme = $('#f-theme').value || null;
    $('#f-ok').disabled = true;
    try {
      const r = await api.post('/api/create', { name, theme });
      dlg.close();
      await load(); lastSig = sig(state.data);
      toast('Une nouvelle planète est née ✦');
      const pl = findPlanet(r.key); if (pl) focusPlanet(pl);
    } catch (err) { $('#f-err').textContent = err.message; $('#f-ok').disabled = false; }
  };
}

// Galaxie de projets « courante » : celle qu'on regarde, sinon la première
function currentDomain() {
  const g = state.gal?.kind === 'project' ? state.gal : galaxies.find((x) => x.kind === 'project');
  return g?.id || '';
}
function domainSelect(id, selected) {
  const ds = galaxies.filter((g) => g.kind === 'project');
  return `<select class="field" id="${id}">${ds.map((g) => `<option value="${esc(g.id)}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>`;
}

// Liste des thèmes, regroupés par galaxie quand il y en a plusieurs
function themeOptions(selected) {
  const opt = (t) => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`;
  const ds = galaxies.filter((g) => g.kind === 'project');
  if (ds.length < 2) return state.data.themes.map(opt).join('');
  return ds.map((g) => {
    const ts = state.data.themes.filter((t) => g.systems.some((s) => s.id === t.id));
    return ts.length ? `<optgroup label="${esc(g.name)}">${ts.map(opt).join('')}</optgroup>` : '';
  }).join('');
}

function openNewTheme(domain = currentDomain()) {
  return new Promise((resolve) => {
    let color = THEME_COLORS[state.data.themes.length % THEME_COLORS.length];
    const several = galaxies.filter((g) => g.kind === 'project').length > 1;
    dlg.innerHTML = `
      <form method="dialog" id="f">
        <h2>Nouveau soleil</h2>
        <p>Un thème regroupe des projets : un client, un type de site, le perso…</p>
        <label for="f-name">Nom du thème</label>
        <input class="field" id="f-name" required maxlength="40" placeholder="ex. Sites clients" autocomplete="off">
        ${several ? `<label for="f-domain">Dans la galaxie</label>${domainSelect('f-domain', domain)}` : ''}
        <label>Couleur</label>
        <div class="swatches">${THEME_COLORS.map((c) => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c};color:${c}"></button>`).join('')}</div>
        <div class="err" id="f-err"></div>
        <div class="row"><button class="btn" value="cancel" formnovalidate>Annuler</button><button class="btn primary" id="f-ok">Allumer ce soleil</button></div>
      </form>`;
    dlg.showModal();
    dlg.querySelectorAll('.swatch').forEach((b) => b.onclick = () => { color = b.dataset.c; dlg.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b)); });
    dlg.onclose = () => resolve(null);
    $('#f').onsubmit = async (e) => {
      if (e.submitter?.value === 'cancel') return;
      e.preventDefault();
      try {
        const body = { action: 'create', name: $('#f-name').value.trim(), color };
        const dom = $('#f-domain')?.value || domain;
        if (dom) body.domain = dom;
        const r = await api.post('/api/theme', body);
        dlg.onclose = null; dlg.close();
        resolve(r.id);
      } catch (err) { $('#f-err').textContent = err.message; }
    };
  });
}

function openNewDomain() {
  return new Promise((resolve) => {
    dlg.innerHTML = `
      <form method="dialog" id="f">
        <h2>Nouvelle galaxie</h2>
        <p>Une galaxie rassemble plusieurs thèmes : le pro, le perso, une association… Tu y rangeras ensuite tes soleils.</p>
        <label for="f-name">Nom de la galaxie</label>
        <input class="field" id="f-name" required maxlength="40" placeholder="ex. Perso" autocomplete="off">
        <div class="err" id="f-err"></div>
        <div class="row"><button class="btn" value="cancel" formnovalidate>Annuler</button><button class="btn primary" id="f-ok">Créer la galaxie</button></div>
      </form>`;
    dlg.showModal();
    dlg.onclose = () => resolve(null);
    $('#f').onsubmit = async (e) => {
      if (e.submitter?.value === 'cancel') return;
      e.preventDefault();
      try {
        const r = await api.post('/api/domain', { action: 'create', name: $('#f-name').value.trim() });
        dlg.onclose = null; dlg.close();
        resolve(r.id);
      } catch (err) { $('#f-err').textContent = err.message; }
    };
  });
}

async function newThemeFlow(domain) {
  const id = await openNewTheme(domain);
  if (!id) return;
  await load(); lastSig = sig(state.data);
  toast('Un nouveau soleil s’allume ✦');
  const s = systems.find((x) => x.id === id); if (s) focusSystem(s);
}

$('#btn-new').onclick = () => openNewProject();
$('#btn-settings').onclick = () => openSettings();

function openSettings() {
  const d = state.data;
  dlg.innerHTML = `
    <form method="dialog" id="f">
      <h2>Réglages</h2>
      <p>Tes projets sont trouvés de deux façons : les dossiers où tu as déjà parlé à Claude, et les sous-dossiers des emplacements ci-dessous.</p>
      <label for="s-roots">Où chercher tes projets (un dossier par ligne)</label>
      <textarea class="field" id="s-roots" rows="3" placeholder="Aucun : seulement les dossiers où tu as parlé à Claude">${esc((d.scanRoots || []).join('\n'))}</textarea>
      <button type="button" class="btn small" id="s-add" style="margin-top:6px">+ Ajouter un dossier…</button>
      <label for="s-new">Où créer les nouveaux projets</label>
      <input class="field" id="s-new" value="${esc(d.newProjectRoot)}">
      <label>Application</label>
      <div class="app-box">
        ${matchMedia('(display-mode: standalone)').matches || d.appInstalled
          ? '<p class="ok">✓ Galaxie est installée comme application. Pour l’épingler avec son icône : clic droit sur son icône dans la barre des tâches → Épingler.</p>'
          : window.__installEvt
            ? '<button type="button" class="btn small primary" id="s-install">Installer Galaxie comme application</button><p class="sub">Tu pourras ensuite l’épingler à la barre des tâches, avec sa propre icône.</p>'
            : '<button type="button" class="btn small primary" id="s-install-tab">Ouvrir dans le navigateur pour l’installer</button><p class="sub">Un onglet s’ouvre : clique sur l’icône <b>Installer</b> (un écran avec une flèche ou un <b>+</b>) à droite de la barre d’adresse, puis sur <b>Installer</b>. Tu pourras ensuite l’épingler à la barre des tâches avec sa propre icône.</p>'}
        <label class="check"><input type="checkbox" id="s-auto" ${d.autostart ? 'checked' : ''}> Lancer la Galaxie au démarrage de l’ordinateur <span>discrètement, sans ouvrir de fenêtre, pour que l’application épinglée fonctionne toujours</span></label>
      </div>
      ${d.hiddenCount ? `<label>Planètes retirées</label><button type="button" class="btn small" id="s-unhide">Réafficher les ${d.hiddenCount} planètes retirées</button>` : ''}
      <div class="err" id="f-err"></div>
      <div class="row"><button class="btn" value="cancel" formnovalidate>Annuler</button><button class="btn primary" id="f-ok">Enregistrer</button></div>
    </form>`;
  dlg.onclose = null;
  dlg.showModal();
  $('#s-install')?.addEventListener('click', async () => {
    const evt = window.__installEvt; if (!evt) return;
    evt.prompt(); const r = await evt.userChoice; window.__installEvt = null;
    if (r.outcome === 'accepted') { dlg.close(); toast('Galaxie est installée ✦ Tu peux l’épingler à la barre des tâches'); }
  });
  $('#s-install-tab')?.addEventListener('click', () => api.post('/api/open-tab', {}).then(() => toast('Regarde à droite de la barre d’adresse : icône « Installer »')).catch((e) => toast(e.message, true)));
  $('#s-auto').onchange = async (e) => {
    try { const r = await api.post('/api/autostart', { on: e.target.checked }); state.data.autostart = r.autostart; toast(r.autostart ? 'La Galaxie se lancera au démarrage' : 'Démarrage automatique désactivé'); }
    catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
  };
  $('#s-add').onclick = async () => {
    const p = await pickFolderUI('Où chercher tes projets ?');
    if (p) { const ta = $('#s-roots'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + p; }
  };
  $('#s-unhide')?.addEventListener('click', async () => {
    await api.post('/api/unhide-all', {}); dlg.close();
    const st = snapshot(); await load(); lastSig = sig(state.data); restore(st, false); toast('Planètes réaffichées');
  });
  $('#f').onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    try {
      await api.post('/api/settings', { scanRoots: $('#s-roots').value.split('\n'), newProjectRoot: $('#s-new').value });
      dlg.close();
      const st = snapshot(); await load(); lastSig = sig(state.data); restore(st, false); toast('Réglages enregistrés');
    } catch (err) { $('#f-err').textContent = err.message; }
  };
}
$('#btn-theme').onclick = () => newThemeFlow();

// =====================================================================
// Démarrage
// =====================================================================
try {
  await load();
  lastSig = sig(state.data);
  camera.position.copy(universeCam); // vue d'ensemble à la taille de l'univers
  window.__galaxieReady = true;
  window.__galaxie = { get systems() { return systems; }, get galaxies() { return galaxies; }, focusUniverse, focusGalaxy, focusSystem, focusPlanet };
  tick();
  setTimeout(() => $('#loading').classList.add('done'), 300);
  if (!state.data.onboarded) setTimeout(openWelcome, 900);
} catch (e) {
  $('#loading span').textContent = 'Impossible de joindre le serveur de la galaxie : ' + e.message;
}

// =====================================================================
// Sélecteur de dossier (fenêtre native du système)
// =====================================================================
async function pickFolderUI(title) {
  toast('Une fenêtre de choix de dossier s’ouvre…');
  try { const r = await api.post('/api/pick-folder', { title }); return r.path; }
  catch (e) { toast(e.message, true); return null; }
}

// =====================================================================
// Premier lancement : expliquer ce qui est lu, demander la permission
// =====================================================================
function openWelcome() {
  const d = state.data;
  let roots = [];
  let newRoot = d.newProjectRoot;
  const render = () => {
    $('#w-roots').innerHTML = roots.length
      ? roots.map((r, i) => `<li><code>${esc(r)}</code><button type="button" class="linkish" data-rm="${i}">retirer</button></li>`).join('')
      : '';
    dlg.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { roots.splice(+b.dataset.rm, 1); render(); });
    $('#w-new').textContent = newRoot;
    $('#w-folders').hidden = !$('#w-yes').checked;
  };
  dlg.innerHTML = `
    <form method="dialog" id="f" class="welcome">
      <h2>Bienvenue dans ta Galaxie ✦</h2>
      <p>Avant de cartographier ton univers, voici ce que la Galaxie regarde. <b>Tout reste sur ton ordinateur</b> : rien n’est envoyé sur internet.</p>

      <h3>Toujours</h3>
      <ul class="checks">
        <li><b>Ton historique Claude Code.</b> Chaque dossier où tu as déjà parlé à Claude devient une planète, et tes conversations deviennent ses lunes.</li>
        <li><b>Tes compétences.</b> Tes skills, plugins, serveurs MCP et connecteurs, avec leur nom et leur adresse. Jamais tes clés ni tes mots de passe.</li>
      </ul>

      <h3>Seulement si tu le veux</h3>
      <p class="sub">La Galaxie peut aussi repérer les projets sur lesquels tu n’as pas encore utilisé Claude. Elle lit seulement le <b>nom</b> des sous-dossiers, jamais leur contenu.</p>
      <label class="radio"><input type="radio" name="scan" id="w-no" checked> Non merci, seulement mon historique Claude</label>
      <label class="radio"><input type="radio" name="scan" id="w-yes"> Oui, regarder aussi dans ces dossiers :</label>
      <div id="w-folders" class="folders" hidden>
        <ul id="w-roots" class="roots"></ul>
        <div class="row-left">
          <button type="button" class="btn small" id="w-add">+ Choisir un dossier…</button>
          <button type="button" class="btn small" id="w-home">Mon dossier personnel</button>
        </div>
      </div>

      <h3>Nouveaux projets</h3>
      <p class="sub">Le bouton « + Projet » les créera dans <code id="w-new"></code> <button type="button" class="linkish" id="w-change">changer</button></p>

      <div class="err" id="f-err"></div>
      <div class="row"><button class="btn primary" id="f-ok">Explorer ma galaxie</button></div>
      <p class="sub small">Tu pourras tout changer plus tard dans ⚙ Réglages.</p>
    </form>`;
  dlg.onclose = null;
  dlg.showModal();
  render();
  $('#w-no').onchange = $('#w-yes').onchange = render;
  $('#w-add').onclick = async () => { const p = await pickFolderUI('Où ranges-tu tes projets ?'); if (p && !roots.includes(p)) { roots.push(p); render(); } };
  $('#w-home').onclick = () => { if (!roots.includes(d.home)) { roots.push(d.home); render(); } };
  $('#w-change').onclick = async () => { const p = await pickFolderUI('Où créer les nouveaux projets ?'); if (p) { newRoot = p; render(); } };
  dlg.addEventListener('cancel', (e) => e.preventDefault(), { once: true }); // on attend une vraie réponse
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const scanRoots = $('#w-yes').checked ? roots : [];
    try {
      await api.post('/api/settings', { scanRoots, newProjectRoot: newRoot, onboarded: true });
      dlg.close();
      await load(); lastSig = sig(state.data);
      toast(scanRoots.length ? 'Ta galaxie est cartographiée ✦' : 'Ta galaxie est prête ✦');
    } catch (err) { $('#f-err').textContent = err.message; }
  };
}

// =====================================================================
// Compétences rangées dans un projet
// =====================================================================
function projLinks(p) {
  return (p.projects || []).map((x) => `<button class="proj-link" data-proj="${esc(x.key)}">${esc(x.name)}</button>`).join(', ');
}
function bindProjLinks() {
  panel.querySelectorAll('.proj-link').forEach((b) => b.onclick = () => {
    const pl = findPlanet(b.dataset.proj);
    pl ? focusPlanet(pl) : toast('Ce projet n’est pas dans ta galaxie (dossier retiré ou introuvable)', true);
  });
}
