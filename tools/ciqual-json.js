#!/usr/bin/env node
// Table Ciqual (Anses) → data/ciqual.json (commité, lu par le serveur pour construire sa base SQLite).
//
//   node tools/ciqual-json.js [source/ciqual-2025.xlsx] [data/ciqual.json]
//
// Source : Anses, Table de composition nutritionnelle des aliments Ciqual 2025 (licence ouverte Etalab 2.0),
// https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY ; https://ciqual.anses.fr
// Lecture du .xlsx sans bibliothèque (unzip + XML).
//
// Valeurs : nombre ; null si non renseigné (« - ») ; « tr » pour traces ; « <0.5 » pour « inférieur à ».
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { NUTRIMENTS } = require('../server/nutriments');

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const colIndex = (ref) => ref.replace(/\d+/g, '').split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const clean = (s) => (s == null ? null : String(s).replace(/\s*\r?\n\s*/g, ' ').replace(/\s+/g, ' ').trim() || null);

function readXlsx(file) {
  const unzip = (part) => execFileSync('unzip', ['-p', file, part], { maxBuffer: 1 << 29 }).toString('utf8');
  const strings = [...unzip('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const rows = [];
  for (const row of unzip('xl/worksheets/sheet1.xml').matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const out = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '');
      if (!v) continue;
      out[colIndex(c[1])] = /t="s"/.test(c[2]) ? strings[Number(v[1])] : /t="str"/.test(c[2]) ? decode(v[1]) : Number(v[1]);
    }
    rows.push(out);
  }
  return rows;
}

function cell(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const t = String(v).trim();
  if (!t || t === '-') return null;
  if (/^traces?$/i.test(t)) return 'tr';
  const lt = /^<\s*([\d.,]+)/.exec(t);
  if (lt) return `<${Number(lt[1].replace(',', '.'))}`;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const src = process.argv[2] || path.join(__dirname, '../source/ciqual-2025.xlsx');
const dest = process.argv[3] || path.join(__dirname, '../data/ciqual.json');
const rows = readXlsx(src);
const head = rows[0];
if (head[6] !== 'alim_code' || !/kcal/.test(head[10]) || !/B12/.test(head[82])) throw new Error('Colonnes inattendues : vérifier la version du fichier Ciqual');

const groupes = {};
const aliments = [];
for (const r of rows.slice(1)) {
  if (!r[6]) continue;
  for (const [ci, ni] of [[0, 3], [1, 4], [2, 5]]) if (r[ci] && clean(r[ni]) && clean(r[ni]) !== '-' && !groupes[r[ci]]) groupes[r[ci]] = clean(r[ni]);
  aliments.push([Number(r[6]), clean(r[7]), r[0] || null, r[1] || null, r[2] || null, clean(r[8]), NUTRIMENTS.map((n) => cell(r[n.col]))]);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
const out = {
  source: 'Anses, Table de composition nutritionnelle des aliments Ciqual 2025 (licence ouverte Etalab 2.0), valeurs pour 100 g',
  fichier: path.basename(src),
  nutriments: NUTRIMENTS.map((n) => n.key),
  groupes,
  aliments,
};
fs.writeFileSync(dest, JSON.stringify(out).replace(/\],\[(\d)/g, '],\n[$1'));
console.log(`${aliments.length} aliments, ${Object.keys(groupes).length} groupes → ${dest} (${Math.round(fs.statSync(dest).size / 1024)} Ko)`);
