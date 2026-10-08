// Food : intérêt nutritionnel des aliments (table Ciqual de l'Anses). Serveur HTTP sans dépendance (Node 22.13 ou plus).
//   PORT (3310), HOST (127.0.0.1), FOOD_DB (data/ciqual.db)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { open, norm } = require('./db');
const { CATEGORIES, NUTRIMENTS, BY_KEY, PROFIL_DEFAUT, reperes } = require('./nutriments');
const FICHES = require('./fiches');

const PORT = Number(process.env.PORT) || 3310;
const HOST = process.env.HOST || '127.0.0.1';
const db = open(process.env.FOOD_DB || path.join(__dirname, '../data/ciqual.db'));
const PUBLIC = path.join(__dirname, '../public');

const GROUPES = Object.fromEntries(db.prepare('SELECT code, nom FROM groupes').all().map((g) => [g.code, g.nom]));
const SOURCE = db.prepare("SELECT v FROM meta WHERE k = 'source'").get().v;
const NB_ALIMENTS = db.prepare('SELECT count(*) AS n FROM aliments').get().n;
const ENFANTS = Object.fromEntries(NUTRIMENTS.map((n) => [n.key, NUTRIMENTS.filter((c) => c.parent === n.key).map((c) => c.key)]));
// Épices, herbes, algues, sels, aliments diététiques et infantiles : très concentrés ou enrichis, ils écrasent les classements.
const HORS_CLASSEMENT = ['1004', '1005', '1006', '1007', '1008', '11'];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const META = {
  source: SOURCE,
  aliments: NB_ALIMENTS,
  categories: CATEGORIES.map(([key, label]) => ({ key, label })),
  nutriments: NUTRIMENTS.map((n) => ({ key: n.key, label: n.label, unit: n.unit, cat: n.cat, parent: n.parent,
    type: n.ref?.type || null, fiche: !!FICHES[n.key]?.role, resume: FICHES[n.key]?.resume || null })),
  groupes: Object.entries(GROUPES).filter(([c]) => c.length === 2).map(([code, nom]) => ({ code, nom })),
  profil: PROFIL_DEFAUT,
};

const chaine = (a) => [a.grp, a.ssgrp, a.sssgrp].filter((c) => c && GROUPES[c]).map((c) => ({ code: c, nom: GROUPES[c] }));
const resume = (a) => ({ code: a.code, nom: a.nom, groupe: GROUPES[a.sssgrp] || GROUPES[a.ssgrp] || GROUPES[a.grp] || null,
  kcal: a.kcal, prot: a.prot, gluc: a.gluc, lip: a.lip });
const fiche = (a) => ({ code: a.code, nom: a.nom, nom_sci: a.nom_sci, groupes: chaine(a), renseignes: a.renseignes, valeurs: JSON.parse(a.brut) });

const qAliment = db.prepare('SELECT * FROM aliments WHERE code = ?');
const qSemblables = db.prepare('SELECT * FROM aliments WHERE sssgrp = ? AND code <> ? ORDER BY nom LIMIT 40');

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

// Aliments les plus riches en un nutriment, pour 100 g ou pour 100 kcal (densité).
function classement(key, { par, grp, tout, limit }) {
  const col = `"${key}"`;
  const val = par === 'kcal' ? `${col} * 100.0 / kcal` : col;
  const where = [`${col} IS NOT NULL`, `${col} > 0`];
  const args = [];
  if (par === 'kcal') where.push('kcal >= 20');
  if (grp) { where.push('grp = ?'); args.push(grp); }
  if (!tout) where.push(`grp NOT IN (${HORS_CLASSEMENT.map(() => '?').join()}) AND coalesce(ssgrp, '') NOT IN (${HORS_CLASSEMENT.map(() => '?').join()})`), args.push(...HORS_CLASSEMENT, ...HORS_CLASSEMENT);
  return db.prepare(`SELECT *, ${val} AS v FROM aliments WHERE ${where.join(' AND ')} ORDER BY v DESC LIMIT ?`)
    .all(...args, limit).map((a) => ({ ...resume(a), v: a.v, brut: JSON.parse(a.brut)[key] }));
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
      const opts = { par: q.get('par') === 'kcal' ? 'kcal' : 'g', grp: q.get('grp') || null, tout: q.get('tout') === '1', limit: int('limit', 30, 100) };
      return { key: n.key, label: n.label, unit: n.unit, cat: n.cat, type: n.ref?.type || null,
        parent: n.parent ? { key: n.parent, label: BY_KEY[n.parent].label } : null,
        enfants: ENFANTS[n.key].map((k) => ({ key: k, label: BY_KEY[k].label })),
        fiche: FICHES[n.key] || null, classement: classement(n.key, opts), ...opts };
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
