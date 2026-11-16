'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const memory = require('../plugins/galaxie/app/memory');

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galaxie-memory-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('la lecture seule ne crée aucun fichier', (t) => {
  const dir = project(t);
  assert.equal(memory.read(dir).enabled, false);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('activation répétée : préserver les consignes et la mémoire existantes', (t) => {
  const dir = project(t);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Consignes existantes\n');
  const first = memory.enable(dir, 'Projet', 'Note initiale');
  const second = memory.enable(dir, 'Projet', 'Ne doit pas remplacer');
  assert.equal(first.text, second.text);
  assert.match(first.text, /Note initiale/);
  for (const name of ['CLAUDE.md', 'AGENTS.md']) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.equal(text.split('<!-- galaxie-memoire -->').length, 2);
  }
  assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').startsWith('# Consignes existantes\n'));
});

test('refuser une édition périmée après modification par un autre assistant', (t) => {
  const dir = project(t);
  const first = memory.enable(dir, 'Projet');
  fs.appendFileSync(first.file, '\nTravail de Claude\n');
  assert.throws(() => memory.save(dir, 'Travail de Codex', first.revision), { status: 409 });
  assert.match(memory.read(dir).text, /Travail de Claude/);
});

test('une sauvegarde conserve la version précédente et change la révision', (t) => {
  const dir = project(t);
  const first = memory.enable(dir, 'Projet');
  const next = memory.save(dir, first.text + '\nÉtape terminée\n', first.revision);
  assert.notEqual(first.revision, next.revision);
  assert.equal(fs.readFileSync(first.file + '.precedent', 'utf8'), first.text);
});

test('refuser une sauvegarde sans activation et une mémoire trop longue', (t) => {
  const dir = project(t);
  assert.throws(() => memory.save(dir, 'Texte', memory.read(dir).revision), /Active/);
  const first = memory.enable(dir, 'Projet');
  assert.throws(() => memory.save(dir, 'é'.repeat(25000), first.revision), /48 Ko/);
  assert.equal(memory.read(dir).text, first.text);
});

test('dans un dépôt git, la mémoire et les fichiers créés restent locaux', (t) => {
  const dir = project(t);
  fs.mkdirSync(path.join(dir, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Consignes suivies par git\n');
  memory.enable(dir, 'Projet');
  memory.enable(dir, 'Projet');
  const exclude = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8').split('\n');
  assert.ok(exclude.includes('/.galaxie/'));
  assert.ok(exclude.includes('/AGENTS.md'));
  assert.ok(!exclude.includes('/CLAUDE.md'));
  assert.equal(exclude.filter((l) => l === '/.galaxie/').length, 1);
});

test('jamais de mémoire dans le dossier personnel', () => {
  assert.equal(memory.allowed(os.homedir()), false);
  assert.throws(() => memory.enable(os.homedir(), 'Base'), /dossier personnel/);
});

test('mémoire dans tous les projets : seulement celles qui manquent', (t) => {
  const a = project(t), b = project(t);
  const first = memory.enable(a, 'A');
  memory.save(a, first.text + '\nTravail en cours\n', first.revision);
  const created = memory.enableMissing([{ path: a, name: 'A' }, { path: b, name: 'B', note: 'Note B' }, { path: os.homedir(), name: 'Base' }]);
  assert.equal(created, 1);
  assert.match(memory.read(a).text, /Travail en cours/);
  assert.match(memory.read(b).text, /Note B/);
});
