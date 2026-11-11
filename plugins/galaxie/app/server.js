'use strict';
// Galaxie — ton univers Claude Code en 3D (plugin).
// Serveur local sans dépendance : lit les dossiers de projets, l'historique
// des conversations Claude et les compétences installées, et lance Claude à la demande.
// Fonctionne sur Windows, macOS et Linux. Node.js 18 ou plus.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const PORT = Number(process.env.GALAXIE_PORT) || 4747;
const HOST = '127.0.0.1';
const HOME = os.homedir();
const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const CLAUDE_PROJECTS = path.join(CLAUDE_HOME, 'projects');
// Données de l'utilisateur : hors du plugin, pour survivre aux mises à jour
const DATA_DIR = process.env.GALAXIE_HOME || path.join(HOME, '.galaxie');
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Dossiers du profil (Windows, macOS, Linux) qui ne sont pas des projets.
const EXCLUDED = new Set([
  'appdata', 'application data', 'cookies', 'local settings', 'nethood', 'printhood',
  'recent', 'sendto', 'start menu', 'templates', 'my documents', 'contacts', 'favorites',
  'links', 'saved games', 'searches', 'desktop', 'documents', 'downloads', 'music',
  'pictures', 'videos', 'onedrive', '3d objects', 'ansel', 'icloud drive', 'iclouddrive',
  'dropbox', 'galaxie', 'library', 'applications', 'movies', 'public', 'snap', 'bureau',
  'téléchargements', 'images', 'musique', 'vidéos', 'modèles', 'public', 'go',
]);
const TEMP_DIRS = [os.tmpdir(), path.join(HOME, 'AppData'), path.join(HOME, 'Library')].map((p) => path.resolve(p).toLowerCase());

const STATUSES = ['idee', 'en-cours', 'en-pause', 'livre', 'archive'];

// ---------- utilitaires ----------
// Windows et macOS ignorent la casse des chemins, Linux non
const norm = (p) => { const r = path.resolve(p).replace(/[\\/]+$/, ''); return IS_WIN || IS_MAC ? r.toLowerCase() : r; };
const isTempPath = (p) => { const l = path.resolve(p).toLowerCase(); return TEMP_DIRS.some((t) => l === t || l.startsWith(t + path.sep)); };

function findOnPath(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  dirs.push(path.join(HOME, '.local', 'bin'), path.join(HOME, '.claude', 'local'), '/usr/local/bin', '/opt/homebrew/bin');
  for (const name of names) {
    for (const d of dirs) {
      const f = path.join(d, name);
      try { if (fs.statSync(f).isFile()) return f; } catch { /* absent */ }
    }
  }
  return null;
}

const WT = IS_WIN ? findOnPath(['wt.exe']) : null;
const CLAUDE = findOnPath(IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude']) || 'claude';
const CODE = findOnPath(IS_WIN ? ['code.cmd'] : ['code']) || (IS_MAC && fs.existsSync('/Applications/Visual Studio Code.app') ? 'open-vscode' : null);

function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* premier lancement */ }
  return {
    scanRoots: Array.isArray(c.scanRoots) ? c.scanRoots : [], // rien n'est exploré sans accord
    onboarded: !!c.onboarded,
    newProjectRoot: c.newProjectRoot || HOME,
    hidden: Array.isArray(c.hidden) ? c.hidden : [],
    projects: c.projects && typeof c.projects === 'object' ? c.projects : {},
    themes: Array.isArray(c.themes) ? c.themes : null, // null = jamais initialisés
    domains: Array.isArray(c.domains) ? c.domains : [], // galaxies de projets (Pro, Perso…)
    capTexts: c.capTexts && typeof c.capTexts === 'object' ? c.capTexts : {},
  };
}

const THEME_COLORS = ['#ffc86b', '#7fc8ff', '#ff8a7a', '#b69cff', '#7fe0b0', '#ff9fd2', '#f4e38a', '#8ab4ff'];
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const VALID_COLOR = /^#[0-9a-f]{6}$/i;

// Premier lancement : un thème par dossier qui contient des sous-projets.
function seedThemes(cfg, list) {
  cfg.themes = [];
  const groups = list.filter((p) => !p.core && !p.parent && list.some((c) => c.parent === p.key));
  groups.forEach((g, i) => {
    const id = newId() + i;
    cfg.themes.push({ id, name: g.name, color: THEME_COLORS[i % THEME_COLORS.length] });
    for (const p of list) {
      let cur = p, top = p;
      while (cur && cur.parent) { cur = list.find((x) => x.key === cur.parent); if (cur) top = cur; }
      if (top.key === g.key) {
        cfg.projects[p.key] = cfg.projects[p.key] || {};
        if (!cfg.projects[p.key].theme) cfg.projects[p.key].theme = id;
      }
    }
  });
  saveConfig(cfg);
}
// Domaines = galaxies de projets. Il en existe toujours au moins un, et chaque thème appartient à un domaine.
function ensureDomains(cfg) {
  let changed = false;
  if (!cfg.domains.length) { cfg.domains.push({ id: 'd-projets', name: 'Projets' }); changed = true; }
  const ids = new Set(cfg.domains.map((d) => d.id));
  for (const t of cfg.themes || []) if (!ids.has(t.domain)) { t.domain = cfg.domains[0].id; changed = true; }
  if (changed) saveConfig(cfg);
}
// Rangement proposé par Claude (/galaxie:ranger) : { galaxies: [{ nom, themes: [{ nom, couleur?, projets: [chemins] }] }], masquer?: [chemins] }
// Sans rien effacer : une galaxie ou un thème qui porte déjà ce nom est réutilisé, ce qui n'est pas cité reste en place.
function applyPlan(cfg, plan, projects) {
  const byKey = new Map(projects.map((p) => [p.key, p]));
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const name40 = (v) => String(v || '').trim().slice(0, 40);
  const report = { galaxies_creees: [], themes_crees: [], projets_ranges: 0, projets_masques: 0, introuvables: [] };
  cfg.themes = cfg.themes || [];
  ensureDomains(cfg);
  const used = new Set(cfg.themes.map((t) => t.color));
  const nextColor = () => { const c = THEME_COLORS.find((x) => !used.has(x)) || THEME_COLORS[cfg.themes.length % THEME_COLORS.length]; used.add(c); return c; };
  const project = (p) => { const k = norm(String(p || '')); if (byKey.has(k)) return k; report.introuvables.push(String(p)); return null; };

  const galaxies = Array.isArray(plan.galaxies) ? plan.galaxies : [];
  galaxies.forEach((g, gi) => {
    const gName = name40(g.nom);
    if (!gName) return;
    let d = cfg.domains.find((x) => same(x.name, gName));
    if (!d) {
      d = { id: 'd' + newId().slice(1) + gi, name: gName };
      cfg.domains.push(d);
      report.galaxies_creees.push(gName);
    }
    for (const t of Array.isArray(g.themes) ? g.themes : []) {
      const tName = name40(t.nom);
      if (!tName) continue;
      let th = cfg.themes.find((x) => same(x.name, tName));
      if (!th) {
        th = { id: newId() + report.themes_crees.length, name: tName, color: VALID_COLOR.test(t.couleur || '') ? t.couleur : nextColor() };
        cfg.themes.push(th);
        report.themes_crees.push(tName);
      }
      th.domain = d.id;
      for (const p of Array.isArray(t.projets) ? t.projets : []) {
        const k = project(p);
        if (!k) continue;
        cfg.projects[k] = { ...(cfg.projects[k] || {}), theme: th.id };
        report.projets_ranges++;
      }
    }
  });
  const hidden = new Set(cfg.hidden.map(norm));
  for (const p of Array.isArray(plan.masquer) ? plan.masquer : []) {
    const k = project(p);
    if (!k || hidden.has(k) || byKey.get(k).core) continue;
    cfg.hidden.push(byKey.get(k).path);
    hidden.add(k);
    report.projets_masques++;
  }
  // La galaxie « Projets » par défaut, restée vide, disparaît (il en reste toujours au moins une)
  const def = cfg.domains.find((x) => x.id === 'd-projets');
  if (def && cfg.domains.length > 1 && !cfg.themes.some((t) => t.domain === def.id)) cfg.domains = cfg.domains.filter((x) => x !== def);
  return report;
}
function saveConfig(c) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), 'utf8');
}

// ---------- lecture des conversations ----------
const sessionCache = new Map();
const STR = '((?:[^"\\\\]|\\\\.)*)';
const unescapeJson = (s) => { try { return JSON.parse('"' + s + '"'); } catch { return s; } };
function lastMatch(txt, re) { let v = null; for (const m of txt.matchAll(re)) v = m[1]; return v; }

function cleanPrompt(t) {
  return t
    .replace(/<([a-z_-]+)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\[(Image|Pasted text) #\d+[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstPrompt(lines) {
  for (const line of lines) {
    if (!line.includes('"type":"user"') || line.includes('"isMeta":true') || line.includes('"tool_result"')) continue;
    try {
      const o = JSON.parse(line);
      if (o.type !== 'user' || !o.message) continue;
      const c = o.message.content;
      let t = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((x) => x.type === 'text') || {}).text : '';
      if (!t) continue;
      t = cleanPrompt(t);
      if (t && !t.startsWith('<')) return t;
    } catch { /* ligne illisible */ }
  }
  return null;
}

// Les outils lancés via Git Bash notent parfois les dossiers au format /c/Users/… : on les remet au format Windows
const nativePath = (p) => (IS_WIN && /^\/[a-zA-Z](\/|$)/.test(p) ? p[1].toUpperCase() + ':\\' + p.slice(3).replace(/\//g, '\\') : p);

function parseSession(file) {
  const st = fs.statSync(file);
  const cached = sessionCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.data;

  const txt = fs.readFileSync(file, 'utf8');
  const cwdRaw = (txt.match(new RegExp('"cwd":"' + STR + '"')) || [])[1];
  let data = null;
  if (cwdRaw) {
    const lines = txt.split('\n');
    const custom = lastMatch(txt, new RegExp('"customTitle":"' + STR + '"', 'g'));
    const ai = lastMatch(txt, new RegExp('"aiTitle":"' + STR + '"', 'g'));
    const summary = lastMatch(txt, new RegExp('"type":"summary","summary":"' + STR + '"', 'g'));
    let title = custom ? unescapeJson(custom) : ai ? unescapeJson(ai) : summary ? unescapeJson(summary) : null;
    if (!title) {
      const p = firstPrompt(lines);
      if (p) title = p.length > 70 ? p.slice(0, 67) + '…' : p;
    }
    if (title || lines.length > 4) {
      data = {
        id: path.basename(file, '.jsonl'),
        cwd: unescapeJson(cwdRaw),
        title: title || 'Conversation sans titre',
        updated: st.mtimeMs,
        size: lines.length,
        cwds: {},
      };
      // Nombre d'actions faites dans chaque dossier : sert à ranger la conversation sur le bon projet
      for (const m of txt.matchAll(new RegExp('"cwd":"' + STR + '"', 'g'))) {
        const c = nativePath(unescapeJson(m[1]));
        data.cwds[c] = (data.cwds[c] || 0) + 1;
      }
      data.uses = sessionUses(txt);
    }
  }
  sessionCache.set(file, { mtimeMs: st.mtimeMs, data });
  return data;
}

// Compétences utilisées dans une conversation : skills appelés, commandes tapées, outils MCP.
// Seuls des noms sont retenus, jamais le contenu des échanges.
function sessionUses(txt) {
  const u = new Set();
  // seulement les vrais appels (tool_use), pas la liste des outils mis à disposition
  const CALL = '"type":"tool_use","id":"[^"]*","name":';
  for (const m of txt.matchAll(new RegExp(CALL + '"Skill","input":\\{"skill":"([^"]{1,120})"', 'g'))) u.add('skill:' + m[1]);
  for (const m of txt.matchAll(/<command-name>\/([^<\s]{1,120})<\/command-name>/g)) u.add('skill:' + m[1]);
  for (const m of txt.matchAll(new RegExp(CALL + '"mcp__(.{1,120}?)__[^"]*"', 'g'))) u.add('mcp:' + m[1]);
  return [...u];
}

// Relie les noms vus dans les conversations aux compétences installées
function resolveUses(projects, caps) {
  const simple = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const skills = new Map(), plugins = new Map(), mcps = new Map(), connectors = new Map();
  for (const c of caps) {
    const k = simple(c.name.replace(/^\//, ''));
    if (c.cat === 'skill' && !skills.has(k)) skills.set(k, c.key);
    if (c.cat === 'plugin') plugins.set(k, c.key);
    if (c.cat === 'mcp') mcps.set(k, c.key);
    if (c.cat === 'connector') connectors.set(k, c.key);
  }
  const toCap = (u) => {
    const [kind, raw] = [u.slice(0, u.indexOf(':')), u.slice(u.indexOf(':') + 1)];
    if (kind === 'skill') {
      const i = raw.indexOf(':');
      return i > 0 ? plugins.get(simple(raw.slice(0, i))) : skills.get(simple(raw));
    }
    const s = simple(raw);
    if (s.startsWith('plugin_')) { for (const [n, key] of plugins) if (s.startsWith('plugin_' + n + '_')) return key; return null; }
    if (s.startsWith('claude_ai_')) return connectors.get(s.slice(10)) || null;
    return mcps.get(s) || null;
  };
  for (const p of projects) {
    const count = new Map();
    for (const raw of p.rawUses || []) {
      const seen = new Set();
      for (const u of raw) { const k = toCap(u); if (k && !seen.has(k)) { seen.add(k); count.set(k, (count.get(k) || 0) + 1); } }
    }
    p.uses = [...count].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
    delete p.rawUses;
  }
}

// ---------- cartographie ----------
function gather() {
  const cfg = loadConfig();
  const hidden = new Set(cfg.hidden.map(norm));
  const projects = new Map();

  const ensure = (p) => {
    const k = norm(p);
    if (!projects.has(k)) {
      let mtime = 0;
      try { const st = fs.statSync(p); if (!st.isDirectory()) return null; mtime = st.mtimeMs; } catch { return null; }
      projects.set(k, { key: k, path: path.resolve(p), name: path.basename(p) || p, sessions: [], dirMtime: mtime });
    }
    return projects.get(k);
  };

  const allSessions = [];
  let dirs = [];
  try { dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* pas d'historique */ }
  for (const d of dirs) {
    const full = path.join(CLAUDE_PROJECTS, d.name);
    let files = [];
    try { files = fs.readdirSync(full).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      let s;
      try { s = parseSession(path.join(full, f)); } catch { continue; }
      if (!s) continue;
      if (isTempPath(s.cwd)) continue;
      if (ensure(s.cwd)) allSessions.push(s);
    }
  }

  for (const root of cfg.scanRoots) {
    let ents = [];
    try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('.') || EXCLUDED.has(e.name.toLowerCase())) continue;
      ensure(path.join(root, e.name));
    }
  }

  const homeKey = norm(HOME);

  // Une conversation rejoint la planète du projet où elle a fait le plus d'actions
  // (et non celle où elle a commencé). Son dossier de départ est gardé pour pouvoir la reprendre.
  const exists = new Map();
  const isDir = (d) => { if (!exists.has(d)) { try { exists.set(d, fs.statSync(d).isDirectory()); } catch { exists.set(d, false); } } return exists.get(d); };
  const owner = (dir) => {
    let cur = path.resolve(dir);
    for (;;) {
      const k = norm(cur);
      if (projects.has(k) && !hidden.has(k)) return k;
      const up = path.dirname(cur);
      if (up === cur) return null;
      cur = up;
    }
  };
  for (const s of allSessions) {
    const origin = norm(s.cwd);
    const score = new Map();
    for (const [c, n] of Object.entries(s.cwds || {})) {
      if (isTempPath(c) || !isDir(c)) continue; // les dossiers disparus ne comptent pas
      const k = owner(c);
      if (k) score.set(k, (score.get(k) || 0) + n);
    }
    let best = hidden.has(origin) ? null : origin;
    let bestN = best ? score.get(origin) || 0 : -1;
    for (const [k, n] of score) if (n > bestN) { best = k; bestN = n; }
    if (!best) continue;
    const from = best !== origin ? (origin === homeKey ? 'Base (dossier perso)' : (projects.get(origin) || {}).name || path.basename(s.cwd)) : null;
    projects.get(best).sessions.push({ ...s, origin: s.cwd, from });
  }

  const list = [...projects.values()].filter((p) => !hidden.has(p.key));
  const keys = new Set(list.map((p) => p.key));
  const now = Date.now();

  const out = list.map((p) => {
    p.sessions.sort((a, b) => b.updated - a.updated);
    const lastActivity = Math.max(p.sessions[0] ? p.sessions[0].updated : 0, p.dirMtime);
    let parent = null;
    if (p.key !== homeKey) {
      let cur = path.dirname(p.path);
      while (cur && cur !== path.dirname(cur)) {
        const k = norm(cur);
        if (k === homeKey) break;
        if (keys.has(k)) { parent = k; break; }
        cur = path.dirname(cur);
      }
    }
    const meta = cfg.projects[p.key] || {};
    const auto = now - lastActivity < 21 * 864e5 ? 'en-cours' : 'en-pause';
    return {
      key: p.key,
      path: p.path,
      name: p.key === homeKey ? 'Base (dossier perso)' : p.name,
      core: p.key === homeKey,
      parent,
      lastActivity,
      status: STATUSES.includes(meta.status) ? meta.status : auto,
      statusAuto: !STATUSES.includes(meta.status),
      note: meta.note || '',
      url: meta.url || '',
      sessions: p.sessions.map(({ id, title, updated, size, origin, from }) => ({ id, title, updated, size, origin, from })),
      rawUses: p.sessions.map((s) => s.uses || []), // transformé en `uses` par resolveUses()
    };
  });

  if (!cfg.themes) seedThemes(cfg, out);
  ensureDomains(cfg);
  const themeIds = new Set(cfg.themes.map((t) => t.id));
  for (const p of out) {
    const t = (cfg.projects[p.key] || {}).theme;
    p.theme = themeIds.has(t) ? t : null;
  }

  const caps = withTexts(gatherCaps(out), cfg);
  resolveUses(out, caps);

  return {
    domains: cfg.domains,
    themes: cfg.themes,
    projects: out,
    caps,
    hasCode: !!CODE,
    hiddenCount: cfg.hidden.length,
    autostart: autostartEnabled(),
    appInstalled: !!findInstalledApp(),
    newProjectRoot: cfg.newProjectRoot,
    scanRoots: cfg.scanRoots,
    onboarded: cfg.onboarded,
    home: HOME,
    platform: process.platform,
  };
}

// ---------- compétences : skills, plugins, MCP, connecteurs ----------
function frontmatter(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8').slice(0, 6000);
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const out = {};
    let cur = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
      if (kv) {
        cur = kv[1];
        const v = kv[2].trim();
        out[cur] = /^[>|][-+]?$/.test(v) ? '' : v.replace(/^["']|["']$/g, '');
      } else if (cur && /^\s+\S/.test(line)) {
        out[cur] = (out[cur] ? out[cur] + ' ' : '') + line.trim(); // valeur YAML sur plusieurs lignes
      }
    }
    return out;
  } catch { return {}; }
}
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const listDirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const listFiles = (p, ext) => { try { return fs.readdirSync(p).filter((f) => f.endsWith(ext)); } catch { return []; } };

// Ne garde que l'adresse d'un serveur distant (jamais de jeton ni d'en-tête)
function safeTarget(v) {
  if (v.url) { try { const u = new URL(v.url); return u.host; } catch { return 'serveur distant'; } }
  if (v.command) {
    const pkg = (v.args || []).find((a) => typeof a === 'string' && !a.startsWith('-') && !/[=:]/.test(a.slice(1)) && a.length < 80);
    return [path.basename(v.command), pkg].filter(Boolean).join(' ');
  }
  return '';
}

let capPaths = new Map(); // clé de compétence -> dossier ouvrable
function gatherCaps(projects = []) {
  const caps = [];
  const paths = new Map();
  const CLAUDE = path.join(HOME, '.claude');

  // Skills personnels (y compris ceux synchronisés depuis claude.ai)
  const skillRoots = [path.join(CLAUDE, 'skills')];
  for (const root of skillRoots) {
    for (const d of listDirs(root)) {
      const dir = path.join(root, d);
      const sub = d === 'synced' ? listDirs(dir).map((x) => path.join(dir, x)) : [dir];
      for (const sd of sub) {
        const file = path.join(sd, 'SKILL.md');
        if (!fs.existsSync(file)) continue;
        const fm = frontmatter(file);
        const name = fm.name || path.basename(sd);
        const key = 'skill:' + norm(sd);
        paths.set(key, sd);
        caps.push({ key, cat: 'skill', name, description: fm.description || '', path: sd, updated: mtime(file), synced: d === 'synced', children: [] });
      }
    }
  }

  // Plugins installés
  const settings = readJson(path.join(CLAUDE, 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};
  const installed = (readJson(path.join(CLAUDE, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  for (const [id, entries] of Object.entries(installed)) {
    const e = Array.isArray(entries) ? entries[entries.length - 1] : entries;
    if (!e || !e.installPath) continue;
    const dir = e.installPath;
    const manifest = readJson(path.join(dir, '.claude-plugin', 'plugin.json')) || {};
    const [pname, market] = id.split('@');
    const children = [
      ...listDirs(path.join(dir, 'skills')).map((n) => ({ name: n, kind: 'skill', description: frontmatter(path.join(dir, 'skills', n, 'SKILL.md')).description || '' })),
      ...listFiles(path.join(dir, 'commands'), '.md').map((n) => ({ name: '/' + pname + ':' + n.replace(/\.md$/, ''), kind: 'commande', description: frontmatter(path.join(dir, 'commands', n)).description || '' })),
      ...listFiles(path.join(dir, 'agents'), '.md').map((n) => ({ name: n.replace(/\.md$/, ''), kind: 'agent', description: frontmatter(path.join(dir, 'agents', n)).description || '' })),
    ];
    const mcp = readJson(path.join(dir, '.mcp.json'));
    if (mcp) for (const n of Object.keys(mcp.mcpServers || mcp)) children.push({ name: n, kind: 'MCP' });
    const key = 'plugin:' + id;
    paths.set(key, dir);
    caps.push({ key, cat: 'plugin', name: manifest.name || pname, description: manifest.description || '', path: dir, detail: `${market} · v${e.version || '?'}`, enabled: enabled[id] !== false, updated: Date.parse(e.lastUpdated || e.installedAt) || mtime(dir), children });
  }

  // Serveurs MCP (globaux + par projet)
  const cj = readJson(path.join(HOME, '.claude.json')) || {};
  const byName = new Map();
  const projByKey = new Map(projects.map((p) => [p.key, p]));
  const projRef = (dir) => { const k = norm(dir); const p = projByKey.get(k); return { key: k, name: p ? p.name : (path.basename(dir) || dir) }; };
  // proj = projet où le serveur est déclaré, ou null s'il est disponible partout
  const addMcp = (name, v, proj) => {
    let c = byName.get(name);
    if (!c) {
      c = { key: 'mcp:' + name, cat: 'mcp', name, description: v.url ? 'Serveur distant (HTTP)' : 'Serveur local (lancé sur ta machine)', detail: safeTarget(v), projects: [], global: false, updated: 0, children: [] };
      byName.set(name, c); caps.push(c);
    }
    if (!proj) c.global = true;
    else if (!c.projects.some((x) => x.key === proj.key)) c.projects.push(proj);
    c.scope = c.global ? 'tous les projets' : (c.projects.length > 1 ? 'projets : ' : 'projet : ') + c.projects.map((x) => x.name).join(', ');
  };
  for (const [n, v] of Object.entries(cj.mcpServers || {})) addMcp(n, v, null);
  for (const [proj, pv] of Object.entries(cj.projects || {})) for (const [n, v] of Object.entries(pv.mcpServers || {})) addMcp(n, v, projRef(proj));

  // Compétences rangées dans un projet : .claude/skills, .claude/commands, .mcp.json
  for (const p of projects) {
    if (p.core) continue; // le dossier perso : ses compétences sont déjà celles de tout l'ordinateur
    const ref = { key: p.key, name: p.name };
    const sdir = path.join(p.path, '.claude', 'skills');
    for (const d of listDirs(sdir)) {
      const dir = path.join(sdir, d), file = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      const fm = frontmatter(file), key = 'skill:' + norm(dir);
      paths.set(key, dir);
      caps.push({ key, cat: 'skill', name: fm.name || d, description: fm.description || '', path: dir, updated: mtime(file), projects: [ref], scope: 'projet : ' + p.name, children: [] });
    }
    const cdir = path.join(p.path, '.claude', 'commands');
    for (const f of listFiles(cdir, '.md')) {
      const file = path.join(cdir, f), key = 'skill:' + norm(file);
      paths.set(key, cdir);
      caps.push({ key, cat: 'skill', command: true, name: '/' + f.replace(/\.md$/, ''), description: frontmatter(file).description || '', path: cdir, updated: mtime(file), projects: [ref], scope: 'projet : ' + p.name, children: [] });
    }
    const mj = readJson(path.join(p.path, '.mcp.json'));
    if (mj) for (const [n, v] of Object.entries(mj.mcpServers || {})) addMcp(n, v, ref);
  }

  // Connecteurs claude.ai
  for (const n of cj.claudeAiMcpEverConnected || []) {
    const name = String(n).replace(/^claude\.ai\s+/i, '');
    caps.push({ key: 'connector:' + name, cat: 'connector', name, description: 'Connecteur de ton compte claude.ai, disponible dans Claude Code.', detail: 'claude.ai', updated: 0, children: [] });
  }

  capPaths = paths;
  return caps;
}

// Descriptions en français : fichier descriptions.json, puis tes propres modifications (config)
const CATALOGUE_FILE = path.join(__dirname, 'catalogue.json');
const DESC_FILE = path.join(DATA_DIR, 'descriptions.json'); // écrit par /galaxie:decrire
const textKey = (c) => c.cat + ':' + c.name;
function withTexts(caps, cfg) {
  const base = { ...(readJson(CATALOGUE_FILE) || {}), ...(readJson(DESC_FILE) || {}) };
  const mine = cfg.capTexts || {};
  for (const c of caps) {
    const k = textKey(c);
    c.textKey = k;
    c.fr = { resume: '', quand: '', exemple: '', ...(base[k] || {}), ...(mine[k] || {}) };
    c.frCustom = !!mine[k];
  }
  return caps;
}

function findProject(p) {
  if (typeof p !== 'string' || !p) return null;
  const k = norm(p);
  return gather().projects.find((x) => x.key === k) || null;
}

// ---------- lancements ----------
function detached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...opts });
  child.on('error', (e) => console.error('Lancement impossible :', cmd, e.message));
  child.unref();
}

const asq = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; // chaîne AppleScript

// Ouvre la fenêtre « Choisir un dossier » du système et renvoie le chemin (ou null si annulé).
// Une seule fenêtre à la fois : un second clic réutilise celle qui est déjà ouverte.
let pickPending = null;
function pickFolder(title) {
  if (!pickPending) pickPending = pickFolderOnce(title).finally(() => { pickPending = null; });
  return pickPending;
}
function pickFolderOnce(title) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    const done = (err, out) => {
      const p = String(out || '').trim();
      if (p) return resolve(p.replace(/[\\/]+$/, '') || p);
      if (err && err.code === 'ENOENT') return reject(new Error('Sélecteur de dossier indisponible : tape le chemin à la main'));
      resolve(null); // annulé
    };
    const opts = { timeout: 10 * 60 * 1000, windowsHide: true, maxBuffer: 1 << 20 };
    if (IS_WIN) {
      const t = title.replace(/'/g, "''");
      // Le programme est lancé caché (pas de console noire). Windows applique cet ordre « caché »
      // à la première fenêtre affichée : on la « consomme » avec une fenêtre transparente, au premier plan,
      // qui sert ensuite de parent au sélecteur pour qu'il apparaisse devant la Galaxie.
      const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms;" +
        "[System.Windows.Forms.Application]::EnableVisualStyles();" +
        "$f=New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false; Opacity=0; StartPosition='CenterScreen'; Width=1; Height=1};" +
        "$f.Show(); $f.Hide(); $f.Show(); $f.Activate();" +
        "$d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='" + t + "'; $d.ShowNewFolderButton=$true;" +
        "if($d.ShowDialog($f) -eq 'OK'){[Console]::Out.Write($d.SelectedPath)}; $f.Close()";
      return execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], opts, done);
    }
    if (IS_MAC) return execFile('osascript', ['-e', `POSIX path of (choose folder with prompt ${asq(title)})`], opts, done);
    const zen = findOnPath(['zenity']);
    if (zen) return execFile(zen, ['--file-selection', '--directory', '--title=' + title], opts, done);
    const kd = findOnPath(['kdialog']);
    if (kd) return execFile(kd, ['--getexistingdirectory', HOME, '--title', title], opts, done);
    reject(new Error('Sélecteur de dossier indisponible : tape le chemin à la main'));
  });
}

const shq = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'"; // guillemets shell POSIX

// Environnement propre pour Claude : si la Galaxie a été démarrée depuis une session Claude Code,
// elle a hérité de ses marqueurs (CLAUDECODE, CLAUDE_CODE_*). Transmis tels quels, le nouveau Claude
// se croirait une sous-session et n'enregistrerait pas sa conversation.
function claudeEnv() {
  const env = { ...process.env };
  // Les commandes lancées par Claude reçoivent aussi NO_COLOR (pas de couleurs) et
  // GIT_TERMINAL_PROMPT=0 (pas de demande de mot de passe git) : à retirer pour une vraie session.
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) {
    for (const k of ['NO_COLOR', 'GIT_TERMINAL_PROMPT', 'CLAUDE_PID']) delete env[k];
  }
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'GALAXIE_CHILD' || /^CLAUDE_CODE_/i.test(k)) delete env[k];
  }
  return env;
}

const cmdq = (v) => '"' + String(v).replace(/"/g, '') + '"'; // guillemets cmd.exe

function launchClaude(dir, sessionId, title) {
  const cargs = sessionId ? ['--resume', sessionId] : [];
  const env = claudeEnv();
  if (IS_WIN) {
    const safeTitle = String(title || 'Claude').replace(/[;"]/g, ' ').slice(0, 60);
    // Tous les projets s'ouvrent comme onglets d'une même fenêtre « galaxie ».
    if (WT) return detached(WT, ['-w', 'galaxie', 'nt', '-d', dir, '--title', safeTitle, CLAUDE, ...cargs], { windowsHide: false, env });
    // « start » prend le premier argument entre guillemets pour le titre : sans guillemets,
    // il le prendrait pour le programme à lancer. On écrit donc la ligne nous-mêmes.
    const line = ['start', cmdq(safeTitle), '/D', cmdq(dir), cmdq(CLAUDE), ...cargs.map(cmdq)].join(' ');
    return detached('cmd.exe', ['/d', '/c', line], { windowsVerbatimArguments: true, env });
  }
  const line = `cd ${shq(dir)} && ${shq(CLAUDE)} ${cargs.map(shq).join(' ')}`;
  if (IS_MAC) {
    return detached('osascript', ['-e', `tell application "Terminal" to do script ${asq(line)}`, '-e', 'tell application "Terminal" to activate'], { env });
  }
  // Linux : premier terminal disponible
  const term = findOnPath(['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'xterm']);
  if (!term) throw new Error('Aucun terminal trouvé');
  const name = path.basename(term);
  if (name === 'gnome-terminal') return detached(term, ['--working-directory=' + dir, '--', CLAUDE, ...cargs], { env });
  if (name === 'konsole') return detached(term, ['--workdir', dir, '-e', CLAUDE, ...cargs], { env });
  return detached(term, ['-e', 'bash', '-lc', line], { env });
}

// Ouvre un dossier dans l'explorateur de fichiers du système
function openFolder(dir) {
  if (IS_WIN) return detached('explorer.exe', [dir], { windowsHide: false });
  return detached(IS_MAC ? 'open' : 'xdg-open', [dir]);
}

// Ouvre une adresse (page web ou lien claude://) avec l'application associée
function openUrl(url) {
  if (IS_WIN) return detached('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: false });
  return detached(IS_MAC ? 'open' : 'xdg-open', [url]);
}

// Ouvre la Galaxie dans sa propre fenêtre, sans barre d'adresse (mode application de Edge ou Chrome)
function findBrowserApp() {
  if (IS_WIN) {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const rel of ['Google\\Chrome\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe']) {
      for (const r of roots) { const f = path.join(r, rel); if (fs.existsSync(f)) return f; }
    }
    return null;
  }
  if (IS_MAC) {
    for (const a of ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium']) {
      const f = `/Applications/${a}.app/Contents/MacOS/${a}`;
      if (fs.existsSync(f)) return f;
    }
    return null;
  }
  return findOnPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']);
}
function openApp(url) {
  const installed = findInstalledApp();
  if (installed) return IS_WIN ? detached('explorer.exe', [installed], { windowsHide: false }) : detached('open', ['-a', installed]);
  const browser = findBrowserApp();
  if (!browser) return openUrl(url);
  detached(browser, ['--app=' + url, '--window-size=1440,900'], { windowsHide: false });
}

// ---------- application installée, lanceur, démarrage automatique ----------

// Lanceur stable dans ~/.galaxie : retrouve la version installée la plus récente du plugin
function writeLauncher() {
  const launcher = path.join(DATA_DIR, 'lancer.js');
  fs.writeFileSync(launcher, `// Lance la Galaxie (version installée la plus récente du plugin)
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
let server = ${JSON.stringify(__filename)};
try {
  const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const inst = JSON.parse(fs.readFileSync(path.join(home, 'plugins', 'installed_plugins.json'), 'utf8')).plugins || {};
  for (const [id, list] of Object.entries(inst)) {
    if (!id.startsWith('galaxie@')) continue;
    const e = Array.isArray(list) ? list[list.length - 1] : list;
    const f = path.join(e.installPath, 'app', 'server.js');
    if (fs.existsSync(f)) server = f;
  }
} catch {}
spawn(process.execPath, [server, ...process.argv.slice(2)], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
`);
  return launcher;
}

// Si la Galaxie a été installée comme application (Edge/Chrome), on retrouve son raccourci
function findInstalledApp() {
  try {
    if (IS_WIN) {
      // Chrome range ses applications dans un sous-dossier dont le nom dépend de la langue
      // (« Chrome Apps », « Applications Chrome »…) : on parcourt le menu Démarrer sur deux niveaux.
      const base = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const marker = Buffer.from('--app-id', 'utf16le');
      for (const dir of [base, ...listDirs(base).map((d) => path.join(base, d))]) {
        for (const f of listFiles(dir, '.lnk')) {
          if (!/^galaxie\b/i.test(f)) continue;
          const lnk = path.join(dir, f);
          if (fs.readFileSync(lnk).includes(marker)) return lnk;
        }
      }
    } else if (IS_MAC) {
      for (const dir of listDirs(path.join(HOME, 'Applications')).filter((d) => /apps|applications/i.test(d)).map((d) => path.join(HOME, 'Applications', d))) {
        for (const d of listDirs(dir)) if (/^galaxie\b/i.test(d) && d.endsWith('.app')) return path.join(dir, d);
      }
    }
  } catch { /* pas d'application installée */ }
  return null;
}

// Node utilisé par les raccourcis : l'installation standard si elle existe (elle survit aux mises
// à jour), sinon celui qui fait tourner la Galaxie en ce moment. /galaxie:installer vérifie qu'il existe toujours.
function stableNode() {
  const std = IS_WIN ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')]
    : IS_MAC ? ['/opt/homebrew/bin/node', '/usr/local/bin/node'] : ['/usr/bin/node', '/usr/local/bin/node'];
  return std.find((f) => fs.existsSync(f)) || process.execPath;
}

const findDesktop = () => [path.join(HOME, 'Desktop'), path.join(HOME, 'Bureau'), path.join(HOME, 'OneDrive', 'Desktop'), path.join(HOME, 'OneDrive', 'Bureau')].find((d) => fs.existsSync(d)) || HOME;

// Icônes Galaxie du bureau Windows : celle posée par Chrome à l'installation de l'application
// (elle ouvre la fenêtre sans réveiller le serveur), celles déjà passées par le lanceur, et Galaxie.lnk.
function winDesktopIcons(desktop) {
  const chrome = Buffer.from('--app-id', 'utf16le');
  const ours = ['Galaxie.vbs', 'lancer.js'].map((m) => Buffer.from(m, 'utf16le'));
  return listFiles(desktop, '.lnk').filter((f) => /^galaxie\b/i.test(f)).map((f) => {
    const file = path.join(desktop, f);
    let b = Buffer.alloc(0); try { b = fs.readFileSync(file); } catch { /* illisible */ }
    return { file, chrome: b.includes(chrome), ours: ours.some((m) => b.includes(m)) };
  }).filter((i) => i.chrome || i.ours || path.basename(i.file) === 'Galaxie.lnk');
}
function winShortcutTarget(lnk) {
  const pq = (t) => "'" + String(t).replace(/'/g, "''") + "'";
  try {
    const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${pq(lnk)});[Console]::OutputEncoding=[Text.Encoding]::UTF8;$s.TargetPath;$s.Arguments`], { encoding: 'utf8', windowsHide: true });
    const [target = '', argsLine = ''] = out.split(/\r?\n/);
    return { target: target.trim(), args: argsLine.trim() };
  } catch { return { target: '', args: '' }; }
}

// Raccourci Windows (.lnk) qui lance directement Node, fenêtre réduite.
// Pas de script .vbs : Windows Defender bloque les VBScript qui lancent un programme caché.
function winShortcut(lnk, args, { icon, desc = 'Mon univers Claude Code' } = {}) {
  const pq = (t) => "'" + String(t).replace(/'/g, "''") + "'"; // chaîne PowerShell
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${pq(lnk)});$s.TargetPath=${pq(stableNode())};$s.Arguments=${pq(args)};$s.WorkingDirectory=${pq(DATA_DIR)};$s.WindowStyle=7;${icon ? `$s.IconLocation=${pq(icon + ',0')};` : ''}$s.Description=${pq(desc)};$s.Save()`;
  require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore', windowsHide: true });
}

// Démarrage automatique à l'ouverture de session (serveur seul, sans ouvrir de fenêtre)
const WIN_STARTUP = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
function autostartPath() {
  if (IS_WIN) return path.join(WIN_STARTUP, 'Galaxie.lnk');
  if (IS_MAC) return path.join(HOME, 'Library', 'LaunchAgents', 'fr.galaxie.serveur.plist');
  return path.join(HOME, '.config', 'autostart', 'galaxie.desktop');
}
const autostartEnabled = () => fs.existsSync(autostartPath());
function setAutostart(on) {
  const f = autostartPath();
  if (IS_WIN) { try { fs.unlinkSync(path.join(WIN_STARTUP, 'Galaxie.vbs')); } catch { /* ancienne version absente */ } }
  if (!on) { try { fs.unlinkSync(f); } catch { /* déjà absent */ } return; }
  const launcher = writeLauncher();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (IS_WIN) {
    winShortcut(f, `"${launcher}" --no-open`, { desc: 'Galaxie (démarrage discret)' });
  } else if (IS_MAC) {
    const x = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>fr.galaxie.serveur</string>
  <key>ProgramArguments</key><array><string>${x(stableNode())}</string><string>${x(launcher)}</string><string>--no-open</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`);
  } else {
    fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Galaxie (serveur)\nExec="${stableNode()}" "${launcher}" --no-open\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`);
  }
}

const openBrowser = openApp;

function openInCode(dir) {
  if (IS_WIN) return detached('cmd.exe', ['/d', '/s', '/c', `""${CODE}" "${dir}""`], { windowsVerbatimArguments: true });
  if (CODE === 'open-vscode') return detached('open', ['-a', 'Visual Studio Code', dir]);
  return detached(CODE, [dir]);
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 65536) { reject(new Error('Requête trop grosse')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON invalide')); } });
  });
}

const VALID_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.\-']{0,59}$/u;

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/galaxy') return send(res, 200, gather());

  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' });
  // Bloque les requêtes venant d'autres sites (l'en-tête force un preflight CORS qu'on ne valide jamais).
  if (req.headers['x-galaxie'] !== '1') return send(res, 403, { error: 'Interdit' });
  const body = await readBody(req);

  if (url.pathname === '/api/launch') {
    const p = findProject(body.path);
    if (!p) return send(res, 404, { error: 'Projet introuvable' });
    let sessionId = null, dir = p.path;
    if (body.sessionId) {
      const s = p.sessions.find((x) => x.id === body.sessionId);
      if (!s) return send(res, 404, { error: 'Conversation introuvable' });
      sessionId = s.id;
      // Claude Code ne retrouve une conversation que depuis le dossier où elle a commencé
      if (s.origin && fs.existsSync(s.origin)) dir = s.origin;
    }
    if (body.app === 'desktop') {
      // Lien officiel : ouvre une nouvelle session Claude Code dans Claude Desktop, sur ce dossier
      const link = 'claude://code/new?folder=' + encodeURIComponent(p.path);
      openUrl(link);
      return send(res, 200, { ok: true });
    }
    try { launchClaude(dir, sessionId, p.name); } catch (e) { return send(res, 500, { error: e.message }); }
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/open' && body.cap) {
    if (!capPaths.has(String(body.cap))) gather();
    const dir = capPaths.get(String(body.cap));
    if (!dir) return send(res, 404, { error: 'Dossier introuvable' });
    openFolder(dir);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/open') {
    const p = findProject(body.path);
    if (!p) return send(res, 404, { error: 'Projet introuvable' });
    if (body.app === 'code') {
      if (!CODE) return send(res, 400, { error: 'VS Code introuvable' });
      openInCode(p.path);
    } else {
      openFolder(p.path);
    }
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/project') {
    const cfg = loadConfig();
    const k = norm(String(body.path || ''));
    const known = gather().projects.some((x) => x.key === k);
    if (!known) return send(res, 404, { error: 'Projet introuvable' });
    const meta = cfg.projects[k] || {};
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Statut inconnu' });
      meta.status = body.status;
    }
    if ('theme' in body) {
      if (body.theme !== null && !(cfg.themes || []).some((t) => t.id === body.theme)) return send(res, 400, { error: 'Thème inconnu' });
      meta.theme = body.theme;
    }
    if ('note' in body) meta.note = String(body.note).slice(0, 2000);
    if ('url' in body) {
      const u = String(body.url).trim();
      if (u && !/^https?:\/\/\S+$/i.test(u)) return send(res, 400, { error: 'Adresse invalide (elle doit commencer par https://)' });
      meta.url = u;
    }
    cfg.projects[k] = meta;
    if (body.hidden === true && !cfg.hidden.map(norm).includes(k)) cfg.hidden.push(path.resolve(body.path));
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/theme') {
    const cfg = loadConfig();
    cfg.themes = cfg.themes || [];
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : null;
    const color = typeof body.color === 'string' && VALID_COLOR.test(body.color) ? body.color : null;
    ensureDomains(cfg);
    if ('domain' in body && !cfg.domains.some((d) => d.id === body.domain)) return send(res, 400, { error: 'Galaxie inconnue' });
    if (body.action === 'create') {
      if (!name) return send(res, 400, { error: 'Donne un nom au thème' });
      const id = newId();
      cfg.themes.push({ id, name, color: color || THEME_COLORS[cfg.themes.length % THEME_COLORS.length], domain: body.domain || cfg.domains[0].id });
      saveConfig(cfg);
      return send(res, 200, { ok: true, id });
    }
    const t = cfg.themes.find((x) => x.id === body.id);
    if (!t) return send(res, 404, { error: 'Thème introuvable' });
    if (body.action === 'update') {
      if (name) t.name = name;
      if (color) t.color = color;
      if (body.domain) t.domain = body.domain;
    } else if (body.action === 'delete') {
      cfg.themes = cfg.themes.filter((x) => x.id !== t.id);
      for (const m of Object.values(cfg.projects)) if (m.theme === t.id) m.theme = null;
    } else return send(res, 400, { error: 'Action inconnue' });
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  // Galaxies de projets (domaines) : créer, renommer, supprimer
  if (url.pathname === '/api/domain') {
    const cfg = loadConfig();
    cfg.themes = cfg.themes || [];
    ensureDomains(cfg);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : null;
    if (body.action === 'create') {
      if (!name) return send(res, 400, { error: 'Donne un nom à la galaxie' });
      const id = 'd' + newId().slice(1);
      cfg.domains.push({ id, name });
      saveConfig(cfg);
      return send(res, 200, { ok: true, id });
    }
    const d = cfg.domains.find((x) => x.id === body.id);
    if (!d) return send(res, 404, { error: 'Galaxie introuvable' });
    if (body.action === 'update') {
      if (name) d.name = name;
    } else if (body.action === 'delete') {
      if (cfg.domains.length < 2) return send(res, 400, { error: 'Il faut garder au moins une galaxie de projets' });
      cfg.domains = cfg.domains.filter((x) => x.id !== d.id);
      for (const t of cfg.themes) if (t.domain === d.id) t.domain = cfg.domains[0].id; // ses thèmes rejoignent la première galaxie
    } else return send(res, 400, { error: 'Action inconnue' });
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/captext') {
    const k = String(body.key || '');
    if (!gather().caps.some((c) => textKey(c) === k)) return send(res, 404, { error: 'Compétence introuvable' });
    const cfg = loadConfig();
    cfg.capTexts = cfg.capTexts || {};
    if (body.reset) delete cfg.capTexts[k];
    else cfg.capTexts[k] = {
      resume: String(body.resume || '').slice(0, 600),
      quand: String(body.quand || '').slice(0, 600),
      exemple: String(body.exemple || '').slice(0, 300),
    };
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/pick-folder') {
    try { return send(res, 200, { path: await pickFolder(String(body.title || 'Choisis un dossier')) }); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }

  if (url.pathname === '/api/settings') {
    const cfg = loadConfig();
    const roots = Array.isArray(body.scanRoots) ? body.scanRoots.map((r) => String(r).trim()).filter(Boolean) : cfg.scanRoots;
    const newRoot = body.newProjectRoot ? String(body.newProjectRoot).trim() : cfg.newProjectRoot;
    for (const r of [...roots, newRoot]) {
      try { if (!fs.statSync(r).isDirectory()) throw 0; } catch { return send(res, 400, { error: 'Dossier introuvable : ' + r }); }
    }
    cfg.scanRoots = roots.map((r) => path.resolve(r));
    cfg.newProjectRoot = path.resolve(newRoot);
    if (body.onboarded === true) cfg.onboarded = true;
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/open-tab') {
    // Onglet normal (avec barre d'adresse) : c'est là que le navigateur propose « Installer »
    const browser = findBrowserApp();
    if (browser) detached(browser, [APP_URL], { windowsHide: false }); else openUrl(APP_URL);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/autostart') {
    try { setAutostart(body.on === true); } catch (e) { return send(res, 500, { error: 'Réglage impossible : ' + e.message }); }
    return send(res, 200, { ok: true, autostart: autostartEnabled() });
  }

  if (url.pathname === '/api/unhide-all') {
    const cfg = loadConfig();
    cfg.hidden = [];
    saveConfig(cfg);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === '/api/create') {
    const name = String(body.name || '').trim();
    if (!VALID_NAME.test(name)) return send(res, 400, { error: 'Nom invalide : lettres, chiffres, espaces, - _ . (60 caractères max)' });
    const cfg = loadConfig();
    const dir = path.join(cfg.newProjectRoot, name);
    if (fs.existsSync(dir)) return send(res, 409, { error: 'Un dossier porte déjà ce nom' });
    try { fs.mkdirSync(dir); } catch (e) { return send(res, 400, { error: 'Création impossible : ' + e.message }); }
    const theme = (cfg.themes || []).some((t) => t.id === body.theme) ? body.theme : null;
    cfg.projects[norm(dir)] = { status: 'en-cours', theme };
    saveConfig(cfg);
    if (body.launch !== false) { try { launchClaude(dir, null, name); } catch { /* le dossier est créé quand même */ } }
    return send(res, 200, { ok: true, key: norm(dir) });
  }

  return send(res, 404, { error: 'Route inconnue' });
}

const server = http.createServer(async (req, res) => {
  // Protection contre le DNS rebinding : seul l'hôte local est accepté.
  const host = req.headers.host || '';
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, `http://${host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// Chargé par les tests (tests/ à la racine du dépôt) : on expose la lecture des conversations
// sans lancer le serveur ni aucune commande.
if (require.main !== module) {
  module.exports = { parseSession, sessionUses, resolveUses, gather, cleanPrompt, applyPlan, loadConfig, saveConfig };
  return;
}

const APP_URL = `http://${HOST}:${PORT}/`;
const args = process.argv.slice(2);

// Liste des compétences (utilisée par /galaxie:decrire)
if (args.includes('--list-caps')) {
  const onlyMissing = args.includes('--missing');
  const caps = gather().caps
    .filter((c) => !onlyMissing || !c.fr.resume)
    .map((c) => ({ key: c.textKey, famille: c.cat, nom: c.name, description_origine: c.description || '', detail: c.detail || '', contenu: c.children.map((x) => x.name) }));
  process.stdout.write(JSON.stringify({ fichier_descriptions: DESC_FILE, competences: caps }, null, 2) + '\n');
  process.exit(0);
}

// Projets et rangement actuel (utilisé par /galaxie:ranger pour proposer des galaxies et des thèmes)
if (args.includes('--list-projects')) {
  const data = gather();
  const theme = new Map(data.themes.map((t) => [t.id, t]));
  const domain = new Map(data.domains.map((d) => [d.id, d.name]));
  const byKey = new Map(data.projects.map((p) => [p.key, p]));
  const projets = [...data.projects].sort((a, b) => b.lastActivity - a.lastActivity).map((p) => ({
    chemin: p.path,
    nom: p.name,
    dossier_perso: p.core || undefined,
    dans: p.parent ? byKey.get(p.parent)?.name : undefined,
    theme: p.theme ? theme.get(p.theme).name : null,
    galaxie: p.theme ? domain.get(theme.get(p.theme).domain) : null,
    conversations: p.sessions.length,
    derniere_activite: p.lastActivity ? new Date(p.lastActivity).toISOString().slice(0, 10) : null,
    exemples_de_conversations: [...new Set(p.sessions.map((s) => String(s.title || '').slice(0, 80)))].filter((t) => t && t !== 'Conversation sans titre').slice(0, 3),
  }));
  const galaxies = data.domains.map((d) => ({
    nom: d.name,
    themes: data.themes.filter((t) => t.domain === d.id).map((t) => ({ nom: t.name, projets: data.projects.filter((p) => p.theme === t.id).length })),
  }));
  process.stdout.write(JSON.stringify({ galaxies, sans_theme: projets.filter((p) => !p.theme && !p.dossier_perso).length, projets }, null, 2) + '\n');
  process.exit(0);
}

// Applique un rangement (utilisé par /galaxie:ranger) : --organize <fichier.json>
if (args.includes('--organize')) {
  const file = args[args.indexOf('--organize') + 1];
  let plan;
  try { plan = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('Plan illisible : ' + e.message); process.exit(1); }
  const projects = gather().projects;
  const cfg = loadConfig();
  const backup = path.join(DATA_DIR, 'config.avant-rangement.json');
  try { fs.copyFileSync(CONFIG_FILE, backup); } catch { /* pas encore de configuration */ }
  const report = applyPlan(cfg, plan, projects);
  saveConfig(cfg);
  process.stdout.write(JSON.stringify({ ...report, sauvegarde: fs.existsSync(backup) ? backup : null }, null, 2) + '\n');
  process.exit(0);
}

// Raccourci sur le bureau (utilisé par /galaxie:raccourci)
if (args.includes('--shortcut')) {
  const launcher = writeLauncher();
  // Copie de l'icône hors du plugin (son dossier change à chaque mise à jour)
  for (const f of ['icon.ico', 'icon-512.png']) { try { fs.copyFileSync(path.join(PUBLIC_DIR, 'icons', f), path.join(DATA_DIR, f)); } catch { /* icône par défaut */ } }
  const desktop = findDesktop();
  let made;
  if (IS_WIN) {
    try { fs.unlinkSync(path.join(DATA_DIR, 'Galaxie.vbs')); } catch { /* ancienne version : bloquée par Windows Defender */ }
    // Quand la Galaxie est installée comme application, Chrome pose sa propre icône sur le bureau :
    // elle ouvre la fenêtre sans réveiller le serveur (page « endormie »). On la fait passer par le
    // lanceur, en gardant son nom et sa place, plutôt que d'ajouter une deuxième icône.
    const icons = winDesktopIcons(desktop).map((i) => i.file);
    const targets = icons.length ? icons : [path.join(desktop, 'Galaxie.lnk')];
    for (const lnk of targets) winShortcut(lnk, `"${launcher}"`, { icon: path.join(DATA_DIR, 'icon.ico') });
    made = targets.join(', ');
  } else if (IS_MAC) {
    made = path.join(desktop, 'Galaxie.command');
    fs.writeFileSync(made, `#!/bin/bash\n"${stableNode()}" "${launcher}"\nosascript -e 'tell application "Terminal" to close front window' >/dev/null 2>&1 &\n`, { mode: 0o755 });
  } else {
    const apps = path.join(HOME, '.local', 'share', 'applications');
    fs.mkdirSync(apps, { recursive: true });
    const entry = `[Desktop Entry]\nType=Application\nName=Galaxie\nComment=Mon univers Claude Code\nExec="${stableNode()}" "${launcher}"\nIcon=${path.join(DATA_DIR, 'icon-512.png')}\nTerminal=false\n`;
    fs.writeFileSync(path.join(apps, 'galaxie.desktop'), entry, { mode: 0o755 });
    made = path.join(desktop, 'galaxie.desktop');
    fs.writeFileSync(made, entry, { mode: 0o755 });
  }
  console.log('Raccourci créé : ' + made);
  process.exit(0);
}

// Démarrage automatique (utilisé par /galaxie:installer) : --autostart on | off
if (args.includes('--autostart')) {
  const on = args[args.indexOf('--autostart') + 1] !== 'off';
  setAutostart(on);
  console.log(autostartEnabled() ? 'Démarrage automatique activé : ' + autostartPath() : 'Démarrage automatique désactivé');
  process.exit(0);
}

// État de l'installation (utilisé par /galaxie:installer pour savoir quelles étapes sont faites)
if (args.includes('--status')) {
  (async () => {
    const running = await new Promise((done) => {
      const r = http.get({ host: HOST, port: PORT, path: '/', timeout: 2000 }, (x) => { x.resume(); done(x.statusCode === 200); });
      r.on('error', () => done(false));
      r.on('timeout', () => { r.destroy(); done(false); });
    });
    const data = gather();
    const desktop = findDesktop();
    const launcher = path.join(DATA_DIR, 'lancer.js');
    let icone;
    if (IS_WIN) {
      const icons = winDesktopIcons(desktop).map((i) => {
        if (!i.ours) return { fichier: i.file, etat: 'a-reparer' }; // icône de Chrome : n'allume pas le serveur
        const t = winShortcutTarget(i.file);
        const ok = fs.existsSync(t.target) && t.args.includes('lancer.js') && fs.existsSync(launcher);
        return { fichier: i.file, etat: ok ? 'ok' : 'a-reparer', node: t.target };
      });
      icone = { etat: !icons.length ? 'absente' : icons.every((i) => i.etat === 'ok') ? 'ok' : 'a-reparer', icones: icons };
    } else {
      const f = path.join(desktop, IS_MAC ? 'Galaxie.command' : 'galaxie.desktop');
      let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { /* absente */ }
      const node = (txt.match(/"([^"]*node[^"]*)"/) || [])[1] || '';
      icone = { etat: !txt ? 'absente' : fs.existsSync(node) && fs.existsSync(launcher) ? 'ok' : 'a-reparer', fichier: f, node };
    }
    const missing = data.caps.filter((c) => !c.fr.resume).length;
    process.stdout.write(JSON.stringify({
      systeme: process.platform,
      node: { chemin: process.execPath, version: process.version, pour_les_raccourcis: stableNode() },
      galaxie_lancee: running,
      adresse: APP_URL,
      bienvenue_validee: data.onboarded,
      application_installee: IS_WIN || IS_MAC ? data.appInstalled : null, // null : impossible à vérifier sous Linux
      icone_bureau: icone,
      demarrage_auto: data.autostart,
      projets: data.projects.length,
      conversations: data.projects.reduce((n, p) => n + p.sessions.length, 0),
      rangement: { galaxies: data.domains.length, themes: data.themes.length, projets_sans_theme: data.projects.filter((p) => !p.theme && !p.core).length },
      competences: { total: data.caps.length, sans_description: missing },
    }, null, 2) + '\n');
    process.exit(0);
  })();
  return;
}

// Par défaut, le serveur se détache pour continuer à tourner après la fin de la session Claude
if (!args.includes('--foreground') && !process.env.GALAXIE_CHILD) {
  const child = spawn(process.execPath, [__filename, ...args, '--foreground'], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, GALAXIE_CHILD: '1' } });
  child.unref();
  console.log('Galaxie ouverte sur ' + APP_URL);
  setTimeout(() => process.exit(0), 300);
} else {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') { if (!args.includes('--no-open')) openBrowser(APP_URL); setTimeout(() => process.exit(0), 500); }
    else { console.error(e); process.exit(1); }
  });
  server.listen(PORT, HOST, () => {
    console.log('Galaxie en orbite sur ' + APP_URL);
    if (!args.includes('--no-open')) openBrowser(APP_URL);
  });
}
