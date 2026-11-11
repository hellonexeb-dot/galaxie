// Tests de la lecture des conversations Claude Code (la partie la plus fragile :
// elle dépend du format des fichiers .jsonl écrits par Claude Code).
//
// Lancer depuis la racine du dépôt :   node --test tests/
//
// Tout se passe dans un dossier temporaire : le vrai profil (~/.claude, ~/.galaxie)
// n'est jamais lu ni modifié.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- un faux ordinateur, isolé ----------
const ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'galaxie-test-')));
const HOME = path.join(ROOT, 'home');
const WORK = path.join(ROOT, 'work');
const CLAUDE = path.join(HOME, '.claude');
const SESSIONS = path.join(CLAUDE, 'projects', 'fixtures');
const SYSTMP = path.join(ROOT, 'systmp');
for (const d of [HOME, WORK, SESSIONS, SYSTMP]) fs.mkdirSync(d, { recursive: true });

// Le serveur lit ces variables à son chargement : on les règle avant de le charger.
Object.assign(process.env, {
  HOME, USERPROFILE: HOME,
  CLAUDE_CONFIG_DIR: CLAUDE,
  GALAXIE_HOME: path.join(ROOT, 'data'),
  TEMP: SYSTMP, TMP: SYSTMP, TMPDIR: SYSTMP, // le dossier de test ne doit pas passer pour un dossier temporaire
  APPDATA: path.join(HOME, 'AppData', 'Roaming'),
});
const srv = require('../plugins/galaxie/app/server.js');

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

// ---------- fabrication de conversations ----------
let n = 0;
const user = (cwd, text) => ({ type: 'user', cwd, message: { role: 'user', content: text } });
const action = (cwd, ...content) => ({ type: 'assistant', cwd, message: { role: 'assistant', content: content.length ? content : [{ type: 'text', text: 'ok' }] } });
const toolUse = (name, input = {}) => ({ type: 'tool_use', id: 'toolu_' + ++n, name, input });

function writeSession(lines, id = 'sess-' + ++n) {
  const file = path.join(SESSIONS, id + '.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}
const project = (name) => { const p = path.join(WORK, name); fs.mkdirSync(p, { recursive: true }); return p; };

// =====================================================================
// Titre d'une conversation
// =====================================================================
test('titre : le titre choisi par l’utilisateur passe avant tout', () => {
  const cwd = project('titres');
  const s = srv.parseSession(writeSession([
    user(cwd, 'Bonjour'),
    { type: 'summary', summary: 'Résumé automatique' },
    { type: 'ai-title', aiTitle: 'Titre de l’IA' },
    { type: 'custom-title', customTitle: 'Mon « vrai » titre' },
  ]));
  assert.equal(s.title, 'Mon « vrai » titre');
});

test('titre : puis le titre de l’IA, puis le résumé', () => {
  const cwd = project('titres');
  assert.equal(srv.parseSession(writeSession([user(cwd, 'x'), { type: 'summary', summary: 'Résumé' }, { type: 'ai-title', aiTitle: 'Titre IA' }])).title, 'Titre IA');
  assert.equal(srv.parseSession(writeSession([user(cwd, 'x'), { type: 'summary', summary: 'Résumé seul' }])).title, 'Résumé seul');
});

test('titre : à défaut, la première vraie demande, sans les balises techniques', () => {
  const cwd = project('titres');
  const s = srv.parseSession(writeSession([
    { type: 'user', cwd, isMeta: true, message: { role: 'user', content: 'message système' } },
    user(cwd, '<command-name>/clear</command-name>'),
    user(cwd, [{ type: 'text', text: 'Crée-moi une page [Image #1] avec <b-x>caché</b-x> un formulaire de contact' }]),
  ]));
  assert.equal(s.title, 'Crée-moi une page avec un formulaire de contact');
});

test('titre : une longue demande est raccourcie à 70 caractères', () => {
  const s = srv.parseSession(writeSession([user(project('titres'), 'a'.repeat(200))]));
  assert.equal(s.title.length, 68);
  assert.ok(s.title.endsWith('…'));
});

test('une conversation vide est ignorée, un fichier sans dossier aussi', () => {
  assert.equal(srv.parseSession(writeSession([{ type: 'user', cwd: project('vide'), isMeta: true, message: { content: 'x' } }])), null);
  assert.equal(srv.parseSession(writeSession([{ type: 'summary', summary: 'pas de cwd' }])), null);
});

test('les dossiers sont comptés : un par action', () => {
  const a = project('compte-a'), b = project('compte-b');
  const s = srv.parseSession(writeSession([user(a, 'go'), action(a), action(b), action(b), action(b)]));
  assert.equal(s.cwd, a);
  assert.deepEqual(s.cwds, { [a]: 2, [b]: 3 });
});

test('les dossiers au format Git Bash (/c/Users/…) sont remis au format Windows', { skip: process.platform !== 'win32' }, () => {
  const s = srv.parseSession(writeSession([user(project('bash'), 'go'), action('/c/Users/quelquun/projet')]));
  assert.ok(s.cwds['C:\\Users\\quelquun\\projet']);
});

// =====================================================================
// Compétences utilisées
// =====================================================================
test('compétences : skills appelés, commandes tapées et outils MCP sont reconnus', () => {
  const txt = [
    action('/x', toolUse('Skill', { skill: 'brand-voice' })),
    action('/x', toolUse('Skill', { skill: 'ottho:brief' })),
    user('/x', '<command-name>/galaxie:ouvrir</command-name>'),
    action('/x', toolUse('mcp__claude_ai_Gmail__search_threads', { q: 'x' })),
    action('/x', toolUse('mcp__plugin_airtable_airtable__list_bases')),
    action('/x', toolUse('mcp__supabase__list_tables')),
    action('/x', toolUse('Read', { file_path: '/x' })),
  ].map((l) => JSON.stringify(l)).join('\n');
  assert.deepEqual(srv.sessionUses(txt).sort(), [
    'mcp:claude_ai_Gmail', 'mcp:plugin_airtable_airtable', 'mcp:supabase',
    'skill:brand-voice', 'skill:galaxie:ouvrir', 'skill:ottho:brief',
  ]);
});

test('compétences : les outils seulement proposés à Claude ne comptent pas', () => {
  // Claude Code liste les outils disponibles dans la conversation : ce n'est pas une utilisation
  const txt = JSON.stringify({ type: 'attachment', surfacedDefinitions: [{ name: 'mcp__vercel__deploy' }, { name: 'Skill', input: { skill: 'pdf' } }] });
  assert.deepEqual(srv.sessionUses(txt), []);
});

test('compétences : les noms vus sont reliés aux compétences installées, comptés par conversation', () => {
  const caps = [
    { key: 'k-voice', cat: 'skill', name: 'brand-voice' },
    { key: 'k-ottho', cat: 'plugin', name: 'ottho' },
    { key: 'k-airtable', cat: 'plugin', name: 'airtable' },
    { key: 'k-gmail', cat: 'connector', name: 'Gmail' },
    { key: 'k-supa', cat: 'mcp', name: 'supabase' },
  ];
  const projects = [{ rawUses: [
    ['skill:brand-voice', 'skill:ottho:brief', 'skill:ottho:build'], // deux skills du même plugin = 1 conversation
    ['skill:brand-voice', 'mcp:claude_ai_Gmail', 'mcp:plugin_airtable_airtable', 'mcp:supabase'],
    ['skill:inconnu', 'mcp:serveur_absent'],
  ] }];
  srv.resolveUses(projects, caps);
  const byKey = Object.fromEntries(projects[0].uses.map((u) => [u.key, u.n]));
  assert.deepEqual(byKey, { 'k-voice': 2, 'k-ottho': 1, 'k-gmail': 1, 'k-airtable': 1, 'k-supa': 1 });
  assert.equal(projects[0].uses[0].key, 'k-voice', 'la plus utilisée en premier');
  assert.equal(projects[0].rawUses, undefined);
});

// =====================================================================
// Rangement d'une conversation sur une planète
// =====================================================================
test('rangement : chaque conversation va sur le projet où elle a fait le plus d’actions', () => {
  fs.rmSync(SESSIONS, { recursive: true, force: true }); fs.mkdirSync(SESSIONS, { recursive: true });
  const a = project('alpha'), b = project('beta'), bSrc = path.join(b, 'src');
  fs.mkdirSync(bSrc, { recursive: true });
  const gone = path.join(WORK, 'disparu'); // n'existe pas
  const tmp = path.join(SYSTMP, 'brouillon'); fs.mkdirSync(tmp, { recursive: true });

  writeSession([user(b, 'Projet beta'), action(b)], 'beta-chez-soi');
  writeSession([user(a, 'Commencée dans alpha'), action(a), action(b), action(b), action(b)], 'partie-vers-beta');
  writeSession([user(a, 'Sous-dossier'), action(bSrc), action(bSrc)], 'sous-dossier');
  writeSession([user(a, 'Dossier disparu'), action(a), action(gone), action(gone), action(gone), action(gone)], 'reste-alpha');
  writeSession([user(tmp, 'Brouillon'), action(tmp)], 'temporaire');

  const data = srv.gather();
  const byName = Object.fromEntries(data.projects.map((p) => [p.name, p]));
  const ids = (p) => p.sessions.map((s) => s.id).sort();

  assert.deepEqual(Object.keys(byName).sort(), ['alpha', 'beta'], 'pas de planète pour un dossier temporaire');
  assert.deepEqual(ids(byName.beta), ['beta-chez-soi', 'partie-vers-beta', 'sous-dossier']);
  assert.deepEqual(ids(byName.alpha), ['reste-alpha']);

  const moved = byName.beta.sessions.find((s) => s.id === 'partie-vers-beta');
  assert.equal(moved.origin, a, '« Reprendre » doit relancer depuis le dossier de départ');
  assert.equal(moved.from, 'alpha');
  assert.equal(byName.beta.sessions.find((s) => s.id === 'beta-chez-soi').from, null);
});

test('rangement : aucun fichier de Claude n’est modifié', () => {
  const before = fs.readdirSync(SESSIONS).map((f) => [f, fs.statSync(path.join(SESSIONS, f)).mtimeMs]);
  srv.gather();
  const after = fs.readdirSync(SESSIONS).map((f) => [f, fs.statSync(path.join(SESSIONS, f)).mtimeMs]);
  assert.deepEqual(after, before);
});
