// Food : intérêt nutritionnel des aliments (table Ciqual de l'Anses). Serveur HTTP sans dépendance (Node 22.13 ou plus).
//   PORT (3310), HOST (127.0.0.1), FOOD_DB (data/ciqual.db)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { open, norm } = require('./db');
const { CATEGORIES, NUTRIMENTS, BY_KEY, PROFIL_DEFAUT, reperes } = require('./nutriments');
const FICHES = require('./fiches');
const { R, ASSIMILATION, REFS_PAR_CAT, REFS_PAR_CLE } = require('./assimilation');
const { POSITIFS, NEGATIFS, REF: REF_SCORE, SEUILS, REFERENCE_AA, LABEL_AA, indiceChimique } = require('./score');

const PORT = Number(process.env.PORT) || 3310;
const HOST = process.env.HOST || '127.0.0.1';
const db = open(process.env.FOOD_DB || path.join(__dirname, '../data/ciqual.db'));
const PUBLIC = path.join(__dirname, '../public');

const GROUPES = Object.fromEntries(db.prepare('SELECT code, nom FROM groupes').all().map((g) => [g.code, g.nom]));
const META_DB = Object.fromEntries(db.prepare('SELECT k, v FROM meta').all().map((m) => [m.k, m.v]));
const PROFILS_AA = Object.fromEntries(db.prepare('SELECT cle, libelle, estime FROM profils_aa').all().map((p) => [p.cle, p]));
const qSource = db.prepare('SELECT citation FROM sources WHERE code = ?');
const NB_ALIMENTS = db.prepare('SELECT count(*) AS n FROM aliments').get().n;
const ENFANTS = Object.fromEntries(NUTRIMENTS.map((n) => [n.key, NUTRIMENTS.filter((c) => c.parent === n.key).map((c) => c.key)]));
// Épices, herbes, algues, sels, aliments diététiques et infantiles : très concentrés ou enrichis, ils écrasent les classements.
const HORS_CLASSEMENT = ['1004', '1005', '1006', '1007', '1008', '11'];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Sources des données, affichées dans l'appli.
const SOURCES = {
  ciqual: { titre: 'Composition des aliments', texte: META_DB.source, liens: [R.ciqual, ['Jeu de données (doi:10.57745/RDMHWY)', 'https://doi.org/10.57745/RDMHWY']] },
  confiance: { titre: 'Indice de confiance', texte: "Pour chaque valeur, l'Anses attribue un code de A (très fiable : analyses récentes et nombreuses) à D (peu fiable : estimation, recette, autre pays). La référence d'origine de la valeur est indiquée.", liens: [R.ciqual] },
  portions: { titre: 'Portions habituelles', texte: `${META_DB.source_portions}. Les aliments INCA3 ont été rapprochés des aliments Ciqual par leur composition et leur nom ; à défaut, portion estimée à partir des aliments voisins du même groupe.`, liens: [['Anses, étude INCA3 (data.gouv.fr)', 'https://www.data.gouv.fr/fr/datasets/donnees-de-consommations-et-habitudes-alimentaires-de-letude-inca-3/']] },
  aa: { titre: 'Acides aminés', texte: `Ciqual ne publie pas les acides aminés. ${META_DB.source_aa} : soit le profil d'un aliment équivalent, soit (« estimé ») la moyenne des aliments reconnus du même groupe.`, liens: [R.usda] },
  reperes: { titre: 'Repères journaliers', texte: 'Adultes en bonne santé : Anses 2021 (vitamines et minéraux), Anses 2011 et 2016 (lipides, glucides, protéines, fibres), EFSA, OMS (sel, sucres, acides aminés). Chiffres arrondis.', liens: [R.anses2021, R.anses2016, R.anses2011, R.efsa, R.omsSel, R.oms2007] },
  score: { titre: 'Score de la portion', texte: "Inspiré de l'indice NRF (Nutrient Rich Foods). Une portion qui apporte E % des calories du jour devrait apporter au moins E % de chaque nutriment : bonus pour les 16 nutriments à favoriser au-delà de E, malus pour les AG saturés, les sucres libres (estimés) et le sodium au-delà de E. Lettres par quintiles des ~750 aliments les plus consommés (A = 20 % les meilleurs). Ce n'est pas le Nutri-Score.", liens: [['Fulgoni, Keast, Drewnowski (2009), Nutrient-Rich Foods Index, J. Nutr.', 'https://doi.org/10.3945/jn.108.101360']] },
  qualiteProt: { titre: 'Qualité des protéines', texte: "Indice chimique : pour chaque acide aminé indispensable, quantité par gramme de protéines comparée au profil de référence FAO/OMS de l'adulte ; le plus bas donne l'indice et l'acide aminé « limitant ». Ne tient pas compte de la digestibilité (environ 95 % pour les protéines animales, 75 à 90 % pour les végétales).", liens: [R.fao2013, R.oms2007] },
};

const META = {
  source: META_DB.source,
  aliments: NB_ALIMENTS,
  categories: CATEGORIES.map(([key, label]) => ({ key, label })),
  nutriments: NUTRIMENTS.map((n) => ({ key: n.key, label: n.label, unit: n.unit, cat: n.cat, parent: n.parent, essentiel: n.essentiel,
    type: n.ref?.type || null, fiche: !!FICHES[n.key]?.role, resume: FICHES[n.key]?.resume || null })),
  groupes: Object.entries(GROUPES).filter(([c]) => c.length === 2).map(([code, nom]) => ({ code, nom })),
  profil: PROFIL_DEFAUT,
  sources: SOURCES,
  score: { positifs: POSITIFS, negatifs: NEGATIFS, ref: REF_SCORE, seuils: SEUILS },
  aa: { reference: REFERENCE_AA, labels: LABEL_AA },
};

const chaine = (a) => [a.grp, a.ssgrp, a.sssgrp].filter((c) => c && GROUPES[c]).map((c) => ({ code: c, nom: GROUPES[c] }));
const resume = (a) => ({ code: a.code, nom: a.nom, groupe: GROUPES[a.sssgrp] || GROUPES[a.ssgrp] || GROUPES[a.grp] || null,
  kcal: a.kcal, prot: a.prot, gluc: a.gluc, lip: a.lip, portion: a.portion, score: a.score_lettre });
function fiche(a) {
  const qualite = JSON.parse(a.qualite || '{}');
  const codes = [...new Set(Object.values(qualite).map((q) => q[1]).filter(Boolean))];
  const v = JSON.parse(a.brut);
  const p = a.aa_profil && PROFILS_AA[a.aa_profil];
  return {
    code: a.code, nom: a.nom, nom_sci: a.nom_sci, groupes: chaine(a), renseignes: a.renseignes, valeurs: v, qualite,
    references: Object.fromEntries(codes.map((c) => [c, qSource.get(c)?.citation])),
    portion: { g: a.portion, origine: a.portion_src }, // a : aliment INCA3 rapproché, v : variante, g : groupe, null : par défaut
    score: { points: a.score, lettre: a.score_lettre, detail: JSON.parse(a.score_detail) },
    aa: p ? { source: p.libelle, estime: !!p.estime, qualite: indiceChimique(v, typeof v.prot === 'number' ? v.prot : a.prot) } : null,
  };
}

const qAliment = db.prepare('SELECT * FROM aliments WHERE code = ?');
const qSemblables = db.prepare('SELECT * FROM aliments WHERE sssgrp = ? AND code <> ? ORDER BY score DESC LIMIT 40');

// Recherche par mots, sans accents ; « pommes » trouve « pomme ». Les noms qui commencent par le premier mot passent devant.
function recherche(q, grp, limit) {
  const mots = norm(q).split(' ').filter(Boolean).slice(0, 6).map((m) => (m.length > 3 ? m.replace(/[sx]$/, '') : m));
  if (!mots.length) return [];
  const where = mots.map(() => "(' ' || nom_norm) LIKE ?");
  const args = mots.map((m) => `% ${m}%`);
  if (grp) { where.push('grp = ?'); args.push(grp); }
  const rows = db.prepare(`SELECT * FROM aliments WHERE ${where.join(' AND ')}
    ORDER BY (nom_norm LIKE ?) DESC, (instr(nom_norm, ',') = 0 OR instr(nom_norm, ?) < instr(nom_norm, ',')) DESC, length(nom) LIMIT ?`)
    .all(...args, `${mots[0]}%`, mots[0], limit);
  return rows.map(resume);
}

// Aliments les plus riches en un nutriment : pour 100 g, pour 100 kcal (densité) ou pour la portion habituelle.
function classement(key, { par, grp, tout, limit }) {
  const col = `"${key}"`;
  const val = par === 'kcal' ? `${col} * 100.0 / kcal` : par === 'portion' ? `${col} * portion / 100.0` : col;
  const where = [`${col} IS NOT NULL`, `${col} > 0`];
  const args = [];
  if (par === 'kcal') where.push('kcal >= 20');
  if (par === 'portion') where.push("portion_src IN ('a', 'v')"); // portions estimées par groupe : trop incertaines pour classer
  if (grp) { where.push('grp = ?'); args.push(grp); }
  if (!tout) {
    const ph = HORS_CLASSEMENT.map(() => '?').join();
    where.push(`grp NOT IN (${ph}) AND coalesce(ssgrp, '') NOT IN (${ph})`);
    args.push(...HORS_CLASSEMENT, ...HORS_CLASSEMENT);
  }
  return db.prepare(`SELECT *, ${val} AS v FROM aliments WHERE ${where.join(' AND ')} ORDER BY v DESC LIMIT ?`)
    .all(...args, limit).map((a) => ({ ...resume(a), v: a.v, brut: JSON.parse(a.brut)[key], aaEstime: !!PROFILS_AA[a.aa_profil]?.estime }));
}

// Meilleurs scores de portion, éventuellement dans un groupe.
function meilleurs(grp, limit) {
  const args = [];
  let where = "portion_src IN ('a', 'v')";
  if (grp) { where += ' AND grp = ?'; args.push(grp); }
  return db.prepare(`SELECT * FROM aliments WHERE ${where} ORDER BY score DESC LIMIT ?`).all(...args, limit).map((a) => ({ ...resume(a), points: a.score }));
}

function refsNutriment(n) {
  const l = [...(REFS_PAR_CLE[n.key] || REFS_PAR_CAT[n.cat] || [])];
  if (!l.includes(R.ciqual)) l.push(R.ciqual);
  return l.map(([titre, url]) => ({ titre, url }));
}

function api(url) {
  const p = url.pathname.slice(5).split('/');
  const q = url.searchParams;
  const int = (k, d, max) => Math.min(Math.max(Number.parseInt(q.get(k), 10) || d, 1), max);
  switch (p[0]) {
    case 'health': return { ok: true, aliments: NB_ALIMENTS };
    case 'meta': return META;
    case 'reperes': {
      const kcal = Number(q.get('kcal')); const poids = Number(q.get('poids'));
      return reperes({ sexe: q.get('sexe') === 'H' ? 'H' : 'F', grossesse: q.get('grossesse') === '1',
        kcal: kcal >= 800 && kcal <= 6000 ? kcal : undefined, poids: poids >= 25 && poids <= 250 ? poids : undefined });
    }
    case 'recherche': return recherche(String(q.get('q') || '').slice(0, 100), q.get('grp'), int('limit', 40, 100));
    case 'meilleurs': return meilleurs(q.get('grp'), int('limit', 30, 100));
    case 'aliment': {
      const a = qAliment.get(Number(p[1]));
      if (!a) throw new HttpError(404, 'Aliment inconnu');
      return { ...fiche(a), semblables: a.sssgrp ? qSemblables.all(a.sssgrp, a.code).map(resume) : [] };
    }
    case 'aliments': {
      const codes = String(q.get('codes') || '').split(',').map(Number).filter(Number.isInteger).slice(0, 40);
      return codes.map((c) => qAliment.get(c)).filter(Boolean).map(fiche);
    }
    case 'nutriment': {
      const n = BY_KEY[p[1]];
      if (!n) throw new HttpError(404, 'Nutriment inconnu');
      const par = ['kcal', 'portion'].includes(q.get('par')) ? q.get('par') : 'g';
      const opts = { par, grp: q.get('grp') || null, tout: q.get('tout') === '1', limit: int('limit', 30, 100) };
      return { key: n.key, label: n.label, unit: n.unit, cat: n.cat, type: n.ref?.type || null, essentiel: n.essentiel,
        parent: n.parent ? { key: n.parent, label: BY_KEY[n.parent].label } : null,
        enfants: ENFANTS[n.key].map((k) => ({ key: k, label: BY_KEY[k].label })),
        fiche: FICHES[n.key] || null, assimilation: ASSIMILATION[n.key] || null, references: refsNutriment(n),
        classement: classement(n.key, opts), ...opts };
    }
    default: throw new HttpError(404, 'Route inconnue');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(req, res, status, body, type, headers = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers };
  if (buf.length > 1024 && /json|text|javascript|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function statique(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return send(req, res, 403, 'Interdit', 'text/plain');
  if (pathname === '/' || !path.extname(file)) file = path.join(PUBLIC, 'index.html'); // routes de l'appli (#…) et liens directs
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(req, res, 404, 'Introuvable', 'text/plain');
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    const longue = /^\/icon|^\/apple-touch/.test(pathname);
    send(req, res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream',
      { ETag: etag, 'Cache-Control': longue ? 'public, max-age=604800' : 'no-cache' });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Méthode non permise', 'text/plain');
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return statique(req, res, url.pathname);
  try {
    send(req, res, 200, JSON.stringify(api(url)), 'application/json; charset=utf-8',
      { 'Cache-Control': url.pathname === '/api/health' ? 'no-store' : 'public, max-age=3600' });
  } catch (e) {
    if (!e.status) console.error(e);
    send(req, res, e.status || 500, JSON.stringify({ error: e.status ? e.message : 'Erreur interne' }), 'application/json; charset=utf-8');
  }
});

server.listen(PORT, HOST, () => console.log(`Food sur http://${HOST}:${PORT} (${NB_ALIMENTS} aliments)`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
