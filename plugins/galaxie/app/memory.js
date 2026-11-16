'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const revision = (text) => crypto.createHash('sha256').update(text).digest('hex');

function files(dir) {
  const root = fs.realpathSync(dir);
  const folder = path.join(root, '.galaxie');
  for (const file of [folder, path.join(folder, 'MEMOIRE.md'), path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md')]) {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('La mémoire ne peut pas utiliser de lien symbolique');
  }
  return { root, folder, file: path.join(folder, 'MEMOIRE.md') };
}

// Le dossier personnel et la racine d'un disque sont exclus : leurs CLAUDE.md et
// AGENTS.md seraient lus dans tous les projets qu'ils contiennent.
function allowed(dir) {
  const root = path.resolve(dir);
  const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  return !same(root, path.resolve(os.homedir())) && !same(root, path.parse(root).root);
}

// Dans un dépôt git, la mémoire et les fichiers de consignes créés par la Galaxie restent
// sur cet ordinateur : ils sont ajoutés à .git/info/exclude (local, jamais publié).
function excludeFromGit(root, names) {
  const git = path.join(root, '.git');
  try { if (!fs.statSync(git).isDirectory()) return; } catch { return; }
  const file = path.join(git, 'info', 'exclude');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = current.split(/\r?\n/);
  const missing = names.filter((n) => !lines.includes(n));
  if (!missing.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, sep + '# Galaxie : mémoire commune\n' + missing.join('\n') + '\n', 'utf8');
}

function read(dir) {
  const f = files(dir);
  const text = fs.existsSync(f.file) ? fs.readFileSync(f.file, 'utf8') : '';
  return { enabled: fs.existsSync(f.file), allowed: allowed(f.root), text, revision: revision(text), file: f.file };
}

function enable(dir, name, note = '') {
  const f = files(dir);
  if (!allowed(f.root)) throw new Error('Pas de mémoire commune dans ton dossier personnel : elle serait lue par tous tes projets');
  const ignored = ['/.galaxie/'];
  fs.mkdirSync(f.folder, { recursive: true });
  if (!fs.existsSync(f.file)) fs.writeFileSync(f.file,
    `# Mémoire commune : ${String(name).replace(/[\r\n]/g, ' ')}\n\n` +
    `## Objectif\nÀ préciser.\n\n## État actuel\n${note || 'Mémoire initialisée. Aucun historique de conversation importé.'}\n\n` +
    '## Décisions validées\nAucune décision consignée.\n\n## Prochaines étapes\nÀ préciser.\n\n## Vérifications et limites\nÀ compléter après le travail.\n\n' +
    `## Journal\n- ${new Date().toISOString()} : création de la mémoire commune.\n`, { encoding: 'utf8', flag: 'wx' });
  const marker = '<!-- galaxie-memoire -->';
  const instructions = `\n\n${marker}\n## Mémoire commune Galaxie\n\n` +
    'Ces consignes concernent uniquement le projet contenant ce fichier de consignes.\n' +
    'Si tu travailles dans un sous-projet ayant sa propre mémoire, utilise celle du sous-projet.\n' +
    'Au début du travail, lis .galaxie/MEMOIRE.md dans ce projet. Claude Code, Codex et ChatGPT Work partagent ce même fichier.\n' +
    'Après chaque étape significative et avant ta réponse finale, mets à jour son état, les décisions explicitement validées par l’utilisateur, les prochaines étapes et les vérifications. Ajoute au journal la date et ton nom.\n' +
    'Relis le fichier juste avant de le modifier pour conserver le travail récent des autres assistants. Ne supprime pas le journal existant. Signale les contradictions au lieu de les résoudre par supposition.\n' +
    'Distingue les propositions des décisions validées. Ne copie aucun secret ni historique intégral. Respecte les autres consignes du projet. Si le dossier est inaccessible, indique que la mémoire n’a pas été mise à jour.\n' +
    '<!-- /galaxie-memoire -->\n';
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(f.root, name);
    const exists = fs.existsSync(file);
    const previous = exists ? fs.readFileSync(file, 'utf8') : '';
    if (!previous.includes(marker)) fs.appendFileSync(file, exists ? instructions : instructions.trimStart(), 'utf8');
    if (!exists) ignored.push('/' + name);
  }
  excludeFromGit(f.root, ignored);
  return read(dir);
}

function save(dir, text, expected) {
  const current = read(dir);
  if (!current.enabled) throw new Error('Active d’abord la mémoire commune');
  if (expected !== current.revision) {
    const err = new Error('La mémoire a changé. Recharge-la avant d’enregistrer pour conserver les modifications récentes.');
    err.status = 409;
    throw err;
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 48000) throw new Error('Mémoire trop longue (48 Ko maximum)');
  // Conserver la version précédente avant toute édition depuis l’interface.
  fs.copyFileSync(current.file, current.file + '.precedent');
  fs.writeFileSync(current.file, text, 'utf8');
  return read(dir);
}

// Mémoire dans tous les projets (réglage « memoryAll ») : active celle qui manque.
// Rapide quand tout est déjà en place : un simple test d'existence par projet.
function enableMissing(projects) {
  let created = 0;
  for (const p of projects) {
    try {
      if (fs.existsSync(path.join(p.path, '.galaxie', 'MEMOIRE.md')) || !allowed(p.path)) continue;
      enable(p.path, p.name, p.note);
      created++;
    } catch { /* dossier protégé ou en lecture seule : on passe au suivant */ }
  }
  return created;
}

module.exports = { read, enable, save, allowed, enableMissing };
