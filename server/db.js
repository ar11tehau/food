// Base SQLite en lecture seule, construite à partir de data/ciqual.json (module node:sqlite intégré à Node, sans dépendance).
// Reconstruite automatiquement quand le JSON ou la liste des nutriments change (empreinte gardée dans la table meta).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { NUTRIMENTS } = require('./nutriments');

const JSON_FILE = path.join(__dirname, '../data/ciqual.json');

// « Pâté de foie » → « pate de foie » : recherche sans accents ni majuscules.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9%]+/g, ' ').trim();

// Valeur numérique d'une cellule : « traces » → 0 ; « < 0,5 » → la moitié du seuil.
const num = (v) => (v == null ? null : typeof v === 'number' ? v : v === 'tr' ? 0 : Number(v.slice(1)) / 2);

function build(db, data, empreinte) {
  const cols = NUTRIMENTS.map((n) => `"${n.key}" REAL`).join(', ');
  db.exec(`
    DROP TABLE IF EXISTS aliments; DROP TABLE IF EXISTS groupes; DROP TABLE IF EXISTS meta;
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE groupes (code TEXT PRIMARY KEY, nom TEXT NOT NULL);
    CREATE TABLE aliments (code INTEGER PRIMARY KEY, nom TEXT NOT NULL, nom_norm TEXT NOT NULL, nom_sci TEXT,
      grp TEXT, ssgrp TEXT, sssgrp TEXT, renseignes INTEGER, brut TEXT NOT NULL, ${cols});
  `);
  const keys = data.nutriments;
  const order = NUTRIMENTS.map((n) => keys.indexOf(n.key));
  if (order.includes(-1)) throw new Error('data/ciqual.json ne correspond pas à server/nutriments.js : relancer tools/ciqual-json.js');
  db.exec('BEGIN');
  const ig = db.prepare('INSERT INTO groupes VALUES (?, ?)');
  for (const [c, n] of Object.entries(data.groupes)) ig.run(c, n);
  const ia = db.prepare(`INSERT INTO aliments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NUTRIMENTS.map(() => '?').join(', ')})`);
  for (const [code, nom, grp, ssgrp, sssgrp, sci, vals] of data.aliments) {
    const v = order.map((i) => vals[i]);
    const brut = Object.fromEntries(NUTRIMENTS.map((n, i) => [n.key, v[i]]).filter(([, x]) => x != null));
    ia.run(code, nom, norm(nom), sci, grp, ssgrp, sssgrp, Object.keys(brut).length, JSON.stringify(brut), ...v.map(num));
  }
  db.prepare('INSERT INTO meta VALUES (?, ?), (?, ?)').run('empreinte', empreinte, 'source', data.source);
  db.exec('COMMIT');
}

function open(file) {
  const raw = fs.readFileSync(JSON_FILE);
  const empreinte = crypto.createHash('sha256').update(raw).update(NUTRIMENTS.map((n) => n.key).join()).digest('hex').slice(0, 16);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = new DatabaseSync(file);
  let ok = false;
  try { ok = db.prepare("SELECT v FROM meta WHERE k = 'empreinte'").get()?.v === empreinte; } catch { /* base vide */ }
  if (!ok) {
    // Construction dans un fichier à côté puis remplacement : la base en service n'est jamais à moitié écrite.
    db.close();
    const tmp = `${file}.tmp`;
    fs.rmSync(tmp, { force: true });
    const nouvelle = new DatabaseSync(tmp);
    build(nouvelle, JSON.parse(raw), empreinte);
    nouvelle.close();
    fs.renameSync(tmp, file);
    db = new DatabaseSync(file);
    console.log(`Base Ciqual construite (${empreinte})`);
  }
  return db;
}

module.exports = { open, norm };
