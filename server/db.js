// Base SQLite en lecture seule, construite à partir des fichiers de data/ (module node:sqlite intégré à Node, sans dépendance) :
//   ciqual.json          composition Ciqual (Anses)
//   ciqual-qualite.json  indice de confiance et référence de chaque valeur Ciqual
//   portions.json        portion habituelle (étude INCA3, Anses)
//   acides-amines.json   profils d'acides aminés (USDA) rattachés aux aliments
// Reconstruite automatiquement quand un fichier ou la liste des nutriments change (empreinte gardée dans la table meta).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { NUTRIMENTS } = require('./nutriments');
const { scorePortion, indiceChimique } = require('./score');
const { unite } = require('./unites');

const DATA = path.join(__dirname, '../data');
const FICHIERS = ['ciqual.json', 'ciqual-qualite.json', 'portions.json', 'acides-amines.json'];
const VERSION = 6; // à incrémenter quand le schéma ou un calcul change

// « Pâté de foie » → « pate de foie » : recherche sans accents ni majuscules.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9%]+/g, ' ').trim();

// Valeur numérique d'une cellule : « traces » → 0 ; « < 0,5 » → la moitié du seuil.
const num = (v) => (v == null ? null : typeof v === 'number' ? v : v === 'tr' ? 0 : Number(v.slice(1)) / 2);
const arrondi = (n) => (n == null ? null : Number(n.toPrecision(3)));

function build(db, d) {
  const cols = NUTRIMENTS.map((n) => `"${n.key}" REAL`).join(', ');
  db.exec(`
    CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE groupes (code TEXT PRIMARY KEY, nom TEXT NOT NULL);
    CREATE TABLE sources (code INTEGER PRIMARY KEY, citation TEXT NOT NULL);
    CREATE TABLE profils_aa (cle TEXT PRIMARY KEY, libelle TEXT NOT NULL, estime INTEGER NOT NULL);
    CREATE TABLE aliments (code INTEGER PRIMARY KEY, nom TEXT NOT NULL, nom_norm TEXT NOT NULL, nom_sci TEXT,
      grp TEXT, ssgrp TEXT, sssgrp TEXT, renseignes INTEGER, brut TEXT NOT NULL, qualite TEXT,
      portion REAL, portion_src TEXT, aa_profil TEXT, score REAL, score_lettre TEXT, score_detail TEXT,
      indice_prot INTEGER, limitant TEXT, ${cols});
  `);
  const keys = d.ciqual.nutriments;
  const ciq = NUTRIMENTS.filter((n) => n.col != null);
  const order = ciq.map((n) => keys.indexOf(n.key));
  if (order.includes(-1) || d.qualite.nutriments.join() !== ciq.map((n) => n.key).join()) {
    throw new Error('data/ ne correspond pas à server/nutriments.js : relancer tools/ciqual-json.js et tools/ciqual-qualite.js');
  }
  const AA = d.aa.acides_amines;
  db.exec('BEGIN');
  const ig = db.prepare('INSERT INTO groupes VALUES (?, ?)');
  for (const [c, n] of Object.entries(d.ciqual.groupes)) ig.run(c, n);
  const is = db.prepare('INSERT INTO sources VALUES (?, ?)');
  for (const [c, t] of Object.entries(d.qualite.sources)) is.run(Number(c), t);
  const ip = db.prepare('INSERT INTO profils_aa VALUES (?, ?, ?)');
  for (const [c, [lib]] of Object.entries(d.aa.profils)) ip.run(c, lib, c.startsWith('g') ? 1 : 0);

  const ia = db.prepare(`INSERT INTO aliments VALUES (${Array(18 + NUTRIMENTS.length).fill('?').join(', ')})`);
  for (const [code, nom, grp, ssgrp, sssgrp, sci, vals] of d.ciqual.aliments) {
    const brut = {};
    ciq.forEach((n, i) => { const v = vals[order[i]]; if (v != null) brut[n.key] = v; });
    const v = Object.fromEntries(Object.entries(brut).map(([k, x]) => [k, num(x)]));
    // Acides aminés : profil (mg/g de protéines) × protéines Ciqual.
    const cle = d.aa.aliments[code];
    const aa = {};
    if (cle && v.prot != null) {
      d.aa.profils[cle][1].forEach((mgParG, i) => { if (mgParG != null) aa[AA[i]] = arrondi(mgParG * v.prot); });
      Object.assign(brut, aa); Object.assign(v, aa);
    }
    // Qualité : { clé: [confiance, code source] } pour les valeurs renseignées.
    const q = d.qualite.aliments[code];
    const qualite = {};
    if (q) ciq.forEach((n, i) => { if (brut[n.key] != null && (q[0][i] !== '.' || q[1][i])) qualite[n.key] = [q[0][i] === '.' ? null : q[0][i], q[1][i] || null]; });
    let [portion, portionSrc] = d.portions.portions[code] || [100, null];
    // Aliments qui se comptent : portion arrondie à un nombre entier d'unités (1 pot, 3 œufs) ; au moins une.
    const u = unite(norm(nom));
    if (u) portion = Math.max(1, Math.round(portion / u.g)) * u.g;
    const s = scorePortion(v, portion, sssgrp);
    const ic = Object.keys(aa).length ? indiceChimique(aa, v.prot) : null;
    ia.run(code, nom, norm(nom), sci, grp, ssgrp, sssgrp, Object.keys(brut).length - Object.keys(aa).length, JSON.stringify(brut),
      JSON.stringify(qualite), portion, portionSrc, cle || null, s.points, s.lettre, JSON.stringify(s.detail),
      ic?.indice ?? null, ic?.limitant ?? null, ...NUTRIMENTS.map((n) => v[n.key] ?? null));
  }
  const im = db.prepare('INSERT INTO meta VALUES (?, ?)');
  im.run('source', d.ciqual.source);
  im.run('source_portions', d.portions.source);
  im.run('source_aa', d.aa.source);
  db.exec('COMMIT');
}

function open(file) {
  const raws = FICHIERS.map((f) => fs.readFileSync(path.join(DATA, f)));
  const h = crypto.createHash('sha256').update(String(VERSION)).update(NUTRIMENTS.map((n) => n.key).join());
  for (const r of raws) h.update(r);
  const empreinte = h.digest('hex').slice(0, 16);
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
    const [ciqual, qualite, portions, aa] = raws.map((r) => JSON.parse(r));
    build(nouvelle, { ciqual, qualite, portions, aa });
    nouvelle.prepare('INSERT INTO meta VALUES (?, ?)').run('empreinte', empreinte);
    nouvelle.close();
    fs.renameSync(tmp, file);
    db = new DatabaseSync(file);
    console.log(`Base construite (${empreinte})`);
  }
  return db;
}

module.exports = { open, norm, num };
