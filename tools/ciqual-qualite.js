#!/usr/bin/env node
// Fichiers XML Ciqual (composition + sources) → data/ciqual-qualite.json : pour chaque valeur, l'indice de confiance
// de l'Anses (A très fiable … D peu fiable) et la référence d'où elle vient.
//
//   node tools/ciqual-qualite.js [source/ciqual-compo-2025.xml] [source/ciqual-sources-2025.xml]
//
// Les XML (≈ 70 Mo) restent en local. Sortie : { sources: { code: citation }, aliments: { code: [conf, [source, …]] } }
// avec conf = une lettre par nutriment Ciqual de server/nutriments.js (« . » si rien), dans le même ordre.
const fs = require('node:fs');
const path = require('node:path');
const { CIQUAL: NUTRIMENTS } = require('../server/nutriments');

const compo = process.argv[2] || path.join(__dirname, '../source/ciqual-compo-2025.xml');
const sourcesXml = process.argv[3] || path.join(__dirname, '../source/ciqual-sources-2025.xml');
const dest = path.join(__dirname, '../data/ciqual-qualite.json');

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const tag = (b, t) => { const m = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(b); return m ? decode(m[1].trim()) : null; };
const idx = Object.fromEntries(NUTRIMENTS.map((n, i) => [n.ciqual, i]));

const aliments = {};
const utilisees = new Set();
for (const m of fs.readFileSync(compo, 'utf8').matchAll(/<COMPO>([\s\S]*?)<\/COMPO>/g)) {
  const i = idx[tag(m[1], 'const_code')];
  if (i == null) continue;
  const code = tag(m[1], 'alim_code');
  const a = (aliments[code] ||= [Array(NUTRIMENTS.length).fill('.'), Array(NUTRIMENTS.length).fill(0)]);
  const conf = tag(m[1], 'code_confiance');
  const src = Number(tag(m[1], 'source_code')) || 0;
  if (conf && /^[A-D]$/.test(conf)) a[0][i] = conf;
  a[1][i] = src;
  if (src) utilisees.add(src);
}
const sources = {};
for (const m of fs.readFileSync(sourcesXml, 'utf8').matchAll(/<SOURCES>([\s\S]*?)<\/SOURCES>/g)) {
  const code = Number(tag(m[1], 'source_code'));
  const cit = tag(m[1], 'ref_citation');
  if (utilisees.has(code) && cit) sources[code] = cit.replace(/\s+/g, ' ');
}
for (const a of Object.values(aliments)) {
  a[0] = a[0].join('');
  a[1] = a[1].map((s) => (sources[s] ? s : 0));
  while (a[1].length && a[1].at(-1) === 0) a[1].pop();
}
fs.writeFileSync(dest, JSON.stringify({ nutriments: NUTRIMENTS.map((n) => n.key), sources, aliments }).replace(/\],"(\d+)":\[/g, '],\n"$1":['));
console.log(`${Object.keys(aliments).length} aliments, ${Object.keys(sources).length} références → ${dest} (${Math.round(fs.statSync(dest).size / 1024)} Ko)`);
