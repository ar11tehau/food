// Démarre le serveur sur une base temporaire et vérifie les routes principales.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const FICHES = require('../server/fiches');
const { NUTRIMENTS } = require('../server/nutriments');

const PORT = 3399;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'food-'));
let srv;
const get = async (p) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

before(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '../server/index.js')],
    { env: { ...process.env, PORT, FOOD_DB: path.join(dir, 'ciqual.db') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok) => srv.stdout.on('data', (d) => { if (/Food sur/.test(d)) ok(); }));
});
after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('chaque nutriment a au moins un résumé', () => {
  for (const n of NUTRIMENTS) assert.ok(FICHES[n.key]?.resume, `fiche manquante : ${n.key}`);
});

test('health et meta', async () => {
  assert.strictEqual((await get('/api/health')).body.aliments, 3484);
  const m = (await get('/api/meta')).body;
  assert.strictEqual(m.nutriments.length, NUTRIMENTS.length);
  assert.ok(m.groupes.length >= 10);
});

test('recherche sans accents et au pluriel', async () => {
  const r = (await get('/api/recherche?q=lentilles%20corail')).body;
  assert.ok(r.length > 0 && r.every((a) => /lentille/i.test(a.nom) && /corail/i.test(a.nom)));
  const p = (await get('/api/recherche?q=pate%20de%20foie')).body;
  assert.ok(p.some((a) => /Pâté de foie/i.test(a.nom)));
});

test('fiche aliment et repères', async () => {
  const a = (await get('/api/aliment/13039')).body;
  assert.match(a.nom, /^Pomme/);
  assert.ok(a.valeurs.kcal > 40 && a.valeurs.kcal < 70);
  assert.strictEqual((await get('/api/aliment/1')).status, 404);
  const r = (await get('/api/reperes?sexe=H&poids=80&kcal=2500')).body;
  assert.strictEqual(r.prot.valeur, 66);
  assert.strictEqual(r.fer.valeur, 11);
  assert.strictEqual((await get('/api/reperes?sexe=F&grossesse=1')).body.b9.valeur, 600);
});

test('classement des sources', async () => {
  const n = (await get('/api/nutriment/vitc?limit=5')).body;
  assert.strictEqual(n.classement.length, 5);
  assert.ok(n.classement[0].v >= n.classement[4].v);
  const k = (await get('/api/nutriment/fer?par=kcal&grp=02')).body;
  assert.ok(k.classement.every((a) => a.kcal >= 20));
  assert.strictEqual((await get('/api/nutriment/inconnu')).status, 404);
});

test('fichiers statiques et routes inconnues', async () => {
  assert.match((await get('/')).body, /<title>Food/);
  for (const p of ['/../server/index.js', '/%2e%2e/server/index.js', '/..%2fserver%2findex.js']) {
    assert.doesNotMatch(String((await get(p)).body), /require\(/, p); // jamais de fichier hors de public/
  }
  assert.strictEqual((await get('/api/rien')).status, 404);
});
