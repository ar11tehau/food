// Food : interface (sans framework). Routes dans le hash :
//   #/            recherche          #/aliment/<code>?g=150   fiche aliment
//   #/nutriments  liste              #/nutriment/<clé>        fiche nutriment
//   #/comparer    comparateur        #/assiette               repas en cours et repas enregistrés
//   #/profil      profil (repères)
// Le profil, le comparateur et les assiettes restent sur l'appareil (localStorage).
'use strict';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Stockage local ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(`food.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`food.${k}`, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
let profil = store.get('profil', null);
let comparer = store.get('comparer', []);
let assiette = store.get('assiette', []);
let repas = store.get('repas', []);
let recents = store.get('recents', []);

// ---------- API ----------
const cache = new Map();
async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`/api/${path}`).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`);
    return d;
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}
let META;
const NUT = {};
const reperesPath = () => {
  const p = { ...META.profil, ...profil };
  return `reperes?sexe=${p.sexe}&grossesse=${p.grossesse ? 1 : 0}&poids=${p.poids}&kcal=${p.kcal}`;
};
const getReperes = () => api(reperesPath());

// ---------- Formatage ----------
const nf = (n, d) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });
function fmt(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  return a >= 100 ? nf(n, 0) : a >= 10 ? nf(n, 1) : a >= 1 ? nf(n, 2) : a >= 0.01 ? nf(n, 3) : a === 0 ? '0' : nf(n, 4);
}
// Valeur brute Ciqual (nombre, « tr », « <0.5 ») → nombre utilisable dans les calculs.
const num = (v) => (v == null ? null : typeof v === 'number' ? v : v === 'tr' ? 0 : Number(String(v).slice(1)) / 2);
function fmtBrut(v, k = 1) {
  if (v == null) return '<span class="nd" title="Non renseigné dans Ciqual">–</span>';
  if (v === 'tr') return 'traces';
  if (typeof v === 'string') return `&lt; ${fmt(Number(v.slice(1)) * k)}`;
  return fmt(v * k);
}
const unite = (n) => ` ${n.unit}`;
const pctTxt = (p) => (p == null ? '' : p < 1 && p > 0 ? '< 1 %' : `${nf(p, 0)} %`);

function gauge(n, val, rep) {
  if (!rep || val == null || !rep.valeur) return '';
  const p = (val / rep.valeur) * 100;
  const cls = rep.type === 'max' ? (p >= 100 ? 'max over' : 'max') : '';
  const titre = rep.type === 'max' ? 'de la limite' : 'du repère';
  return `<div class="bar"><div class="gauge ${cls}"><span style="width:${Math.min(p, 100).toFixed(1)}%"></span></div>`
    + `<span class="pct" title="${titre} journalier">${pctTxt(p)}</span></div>`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function badges() {
  document.getElementById('badge-comparer').textContent = comparer.length || '';
  document.getElementById('badge-assiette').textContent = assiette.length || '';
}
const typeLabel = { rnp: 'référence (RNP)', as: 'apport satisfaisant', max: 'limite à ne pas dépasser', cible: 'objectif indicatif' };
const profilTxt = () => {
  const p = { ...META.profil, ...profil };
  return `${p.grossesse ? 'grossesse' : p.sexe === 'H' ? 'homme' : 'femme'}, ${p.poids} kg, ${p.kcal} kcal`;
};

// ---------- Recherche ----------
let rechercheQ = '';
let rechercheGrp = '';
async function vueRecherche() {
  $app.innerHTML = `
    <form class="search" role="search" onsubmit="return false">
      <input id="q" type="search" autocomplete="off" placeholder="Un aliment : lentilles, saumon, comté…" value="${esc(rechercheQ)}" aria-label="Rechercher un aliment">
    </form>
    <div class="filters">
      <select id="grp" aria-label="Groupe d'aliments"><option value="">Tous les groupes</option>
        ${META.groupes.map((g) => `<option value="${g.code}" ${g.code === rechercheGrp ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}
      </select>
    </div>
    <div id="res"></div>`;
  const q = document.getElementById('q');
  const grp = document.getElementById('grp');
  let t;
  const go = () => { clearTimeout(t); t = setTimeout(() => resultats(q.value, grp.value), 120); };
  q.addEventListener('input', go);
  grp.addEventListener('change', go);
  if (!matchMedia('(pointer: coarse)').matches || !rechercheQ) q.focus({ preventScroll: true });
  resultats(q.value, grp.value);
}

async function resultats(q, grp) {
  rechercheQ = q; rechercheGrp = grp;
  const res = document.getElementById('res');
  if (!res) return;
  if (!q.trim()) {
    res.innerHTML = accueil();
    return;
  }
  const liste = await api(`recherche?q=${encodeURIComponent(q)}${grp ? `&grp=${grp}` : ''}&limit=60`).catch(() => null);
  if (!document.getElementById('res') || q !== rechercheQ) return;
  if (!liste) { res.innerHTML = '<p class="empty">Hors ligne : recherche indisponible.</p>'; return; }
  res.innerHTML = liste.length
    ? `<div class="card"><ul class="list">${liste.map(ligneAliment).join('')}</ul></div>`
    : `<p class="empty">Aucun aliment pour « ${esc(q)} ». Essayez un mot plus court ou au singulier.</p>`;
}

const ligneAliment = (a) => `<li><a href="#/aliment/${a.code}"><span class="grow"><span class="nom">${esc(a.nom)}</span>
  <span class="sub">${esc(a.groupe || '')}</span></span><span class="val">${a.kcal == null ? '–' : `${fmt(a.kcal)} kcal`}</span></a></li>`;

function accueil() {
  const cles = ['prot', 'fibres', 'fer', 'calcium', 'magnesium', 'iode', 'vitd', 'vitc', 'b9', 'b12', 'dha', 'sel'];
  return `
    ${recents.length ? `<h2>Consultés récemment</h2><div class="card"><ul class="list">${recents.map(ligneAliment).join('')}</ul></div>` : ''}
    <h2>Où trouver…</h2>
    <div class="chips">${cles.map((k) => `<a class="chip" href="#/nutriment/${k}">${esc(NUT[k].label)}</a>`).join('')}
      <a class="chip ghost" href="#/nutriments">Tous les nutriments →</a></div>
    <p class="note">${esc(META.source)}. ${META.aliments.toLocaleString('fr-FR')} aliments. Repères journaliers pour un adulte
      (${esc(profilTxt())}, <a href="#/profil">modifier</a>). Informations générales, pas un avis médical.</p>`;
}

// ---------- Fiche aliment ----------
function lignesNutriments(valeurs, k, rep, opts = {}) {
  return META.categories.map((c) => {
    const nuts = META.nutriments.filter((n) => n.cat === c.key && (opts.tout || valeurs[n.key] != null));
    if (!nuts.length) return '';
    const open = c.key === 'macros' || c.key === 'mineraux' || c.key === 'vitamines';
    return `<details class="cat card" ${open ? 'open' : ''}><summary>${esc(c.label)}</summary>
      ${nuts.map((n) => {
        const v = valeurs[n.key];
        const enfant = n.parent && n.cat !== 'macros' && NUT[n.parent].cat === c.key;
        return `<a class="nut ${enfant ? 'child' : ''}" href="#/nutriment/${n.key}"><span class="lbl">${esc(n.label)}</span>
          <span class="v">${fmtBrut(v, k)}${v == null ? '' : unite(n)}</span>${gauge(n, v == null ? null : num(v) * k, rep[n.key])}</a>`;
      }).join('')}</details>`;
  }).join('');
}

function resumeEnergie(v, k, rep) {
  const kcal = num(v.kcal);
  const e = { prot: (num(v.prot) || 0) * 4, gluc: (num(v.gluc) || 0) * 4, lip: (num(v.lip) || 0) * 9, fib: (num(v.fibres) || 0) * 2 };
  const tot = e.prot + e.gluc + e.lip + e.fib || 1;
  const part = (x) => (x / tot) * 100;
  return `<div class="card">
    <div class="energie"><span class="big">${kcal == null ? '–' : fmt(kcal * k)}</span><span>kcal</span>
      ${rep.kcal && kcal != null ? `<span class="muted small">${pctTxt((kcal * k * 100) / rep.kcal.valeur)} des besoins du jour</span>` : ''}</div>
    <div class="split" title="Origine des calories">
      <span style="width:${part(e.prot)}%;background:var(--prot)"></span><span style="width:${part(e.gluc)}%;background:var(--gluc)"></span>
      <span style="width:${part(e.lip)}%;background:var(--lip)"></span><span style="width:${part(e.fib)}%;background:var(--fib)"></span></div>
    <div class="legend">
      <span><i style="background:var(--prot)"></i>Protéines ${fmtBrut(v.prot, k)} g · ${nf(part(e.prot), 0)} %</span>
      <span><i style="background:var(--gluc)"></i>Glucides ${fmtBrut(v.gluc, k)} g · ${nf(part(e.gluc), 0)} %</span>
      <span><i style="background:var(--lip)"></i>Lipides ${fmtBrut(v.lip, k)} g · ${nf(part(e.lip), 0)} %</span>
      <span><i style="background:var(--fib)"></i>Fibres ${fmtBrut(v.fibres, k)} g</span>
    </div></div>`;
}

// Points forts : ≥ 15 % du repère pour la portion (« source de »), ≥ 30 % (« riche en ») ; à surveiller : seuils « élevé »
// du code couleur britannique pour 100 g (sel 1,5 g, AG saturés 5 g, sucres 22,5 g) ou plus de 30 % d'une limite.
function pointsForts(v, k, rep) {
  const forts = [];
  const vigilance = [];
  for (const n of META.nutriments) {
    const r = rep[n.key];
    const x = num(v[n.key]);
    if (!r || x == null || !r.valeur || n.key === 'kcal') continue;
    const p = (x * k * 100) / r.valeur;
    if (r.type === 'max') { if (p >= 30) vigilance.push([n, p]); } else if (r.type !== 'cible' && !n.parent && p >= 15) forts.push([n, p]);
  }
  const seuils = { sel: 1.5, ags: 5, sucres: 22.5 };
  for (const [key, s] of Object.entries(seuils)) {
    if (num(v[key]) >= s && !vigilance.some(([n]) => n.key === key)) vigilance.push([NUT[key], (num(v[key]) * k * 100) / rep[key].valeur]);
  }
  forts.sort((a, b) => b[1] - a[1]);
  const chip = ([n, p], cls) => `<a class="chip ${cls}" href="#/nutriment/${n.key}">${esc(n.label)} · ${pctTxt(p)}</a>`;
  if (!forts.length && !vigilance.length) return '';
  return `<div class="card">
    ${forts.length ? `<h3>Points forts</h3><div class="chips">${forts.map((f) => chip(f, f[1] >= 30 ? '' : 'ghost')).join('')}</div>` : ''}
    ${vigilance.length ? `<h3>À surveiller</h3><div class="chips">${vigilance.map((f) => chip(f, f[1] >= 100 ? 'bad' : 'warn')).join('')}</div>` : ''}
    <p class="small muted">En % du repère journalier pour la portion choisie.</p></div>`;
}

const PORTIONS = [30, 50, 100, 150, 200, 250];
async function vueAliment(code, params) {
  const g = Math.min(Math.max(Number(params.get('g')) || 100, 1), 2000);
  const [a, rep] = await Promise.all([api(`aliment/${code}`), getReperes()]);
  const k = g / 100;
  recents = [{ code: a.code, nom: a.nom, groupe: a.groupes.at(-1)?.nom, kcal: num(a.valeurs.kcal) },
    ...recents.filter((r) => r.code !== a.code)].slice(0, 8);
  store.set('recents', recents);
  document.title = `${a.nom} · Food`;
  const dansComparer = comparer.includes(a.code);
  $app.innerHTML = `
    <p class="small muted">${a.groupes.map((x) => esc(x.nom)).join(' › ')}</p>
    <h1>${esc(a.nom)}</h1>
    ${a.nom_sci ? `<p class="small muted"><i>${esc(a.nom_sci)}</i></p>` : ''}
    <div class="card portion">
      <span>Pour</span>
      ${PORTIONS.map((p) => `<button class="chip ${p === g ? 'on' : 'ghost'}" data-g="${p}">${p} g</button>`).join('')}
      <input type="number" id="g" min="1" max="2000" inputmode="decimal" value="${g}" aria-label="Quantité en grammes"> g
    </div>
    <div class="actions">
      <button class="btn" id="add-assiette">+ Assiette (${g} g)</button>
      <button class="btn light" id="add-comparer">${dansComparer ? '✓ Dans le comparateur' : '+ Comparer'}</button>
    </div>
    ${resumeEnergie(a.valeurs, k, rep)}
    ${pointsForts(a.valeurs, k, rep)}
    ${lignesNutriments(a.valeurs, k, rep)}
    <p class="small muted">« – » : valeur non mesurée dans Ciqual (${a.renseignes} constituants renseignés sur ${META.nutriments.length}).
      Les pourcentages se rapportent aux repères journaliers du profil (${esc(profilTxt())}).</p>
    ${a.semblables.length ? `<h2>Dans le même groupe</h2><div class="card"><ul class="list">${a.semblables.slice(0, 12).map(ligneAliment).join('')}</ul></div>` : ''}`;

  const setG = (v) => { location.replace(`#/aliment/${code}${Number(v) === 100 ? '' : `?g=${Number(v)}`}`); };
  $app.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => setG(b.dataset.g)));
  const gi = document.getElementById('g');
  gi.addEventListener('change', () => { if (gi.value > 0) setG(gi.value); });
  document.getElementById('add-assiette').addEventListener('click', () => {
    assiette.push({ code: a.code, g }); store.set('assiette', assiette); badges();
    toast(`${a.nom.split(',')[0]} ajouté à l'assiette`);
  });
  document.getElementById('add-comparer').addEventListener('click', (e) => {
    if (comparer.includes(a.code)) { location.hash = '#/comparer'; return; }
    if (comparer.length >= 4) comparer.shift();
    comparer.push(a.code); store.set('comparer', comparer); badges();
    e.target.textContent = '✓ Dans le comparateur';
    toast(comparer.length > 1 ? `${comparer.length} aliments à comparer` : 'Ajoutez un 2e aliment pour comparer');
  });
}

// ---------- Nutriments ----------
async function vueNutriments() {
  document.title = 'Nutriments · Food';
  $app.innerHTML = `<h1>Nutriments</h1><p class="muted">À quoi sert chaque nutriment, que se passe-t-il en cas de manque ou d'excès, et où le trouver.</p>
    ${META.categories.map((c) => `<h2>${esc(c.label)}</h2><div class="card"><ul class="list">
      ${META.nutriments.filter((n) => n.cat === c.key).map((n) => `<li><a href="#/nutriment/${n.key}"><span class="grow">
        <span class="nom">${n.parent && NUT[n.parent].cat === c.key ? '<span class="muted">↳ </span>' : ''}${esc(n.label)}</span>
        ${n.resume ? `<span class="sub">${esc(n.resume.length > 110 ? `${n.resume.slice(0, 108)}…` : n.resume)}</span>` : ''}</span></a></li>`).join('')}
    </ul></div>`).join('')}`;
}

let classementOpts = { par: 'g', grp: '', tout: false };
async function vueNutriment(key) {
  const o = classementOpts;
  const [n, rep] = await Promise.all([
    api(`nutriment/${key}?par=${o.par}&limit=40${o.grp ? `&grp=${o.grp}` : ''}${o.tout ? '&tout=1' : ''}`), getReperes()]);
  const r = rep[key];
  const f = n.fiche || {};
  document.title = `${n.label} · Food`;
  const bloc = (cle, titre) => (f[cle] ? `<div class="bloc ${cle}"><h3>${titre}</h3><p>${esc(f[cle])}</p></div>` : '');
  const titreClassement = r?.type === 'max' ? 'Aliments qui en contiennent le plus' : 'Meilleures sources';
  $app.innerHTML = `
    ${n.parent ? `<p class="small"><a href="#/nutriment/${n.parent.key}">← ${esc(n.parent.label)}</a></p>` : ''}
    <h1>${esc(n.label)}</h1>
    ${f.resume ? `<p>${esc(f.resume)}</p>` : ''}
    ${r ? `<div class="card repere"><span>Repère : <b>${fmt(r.valeur)}${unite(n)}</b> par jour</span>
      <span class="muted">${typeLabel[r.type]}${r.ul ? ` · limite de sécurité ${fmt(r.ul)}${unite(n)}` : ''}</span>
      <span class="muted small">Profil : ${esc(profilTxt())} · <a href="#/profil">modifier</a></span></div>` : ''}
    ${n.enfants.length ? `<div class="chips">${n.enfants.map((c) => `<a class="chip ghost" href="#/nutriment/${c.key}">${esc(c.label)}</a>`).join('')}</div>` : ''}
    <div class="fiche">
      ${bloc('role', 'À quoi ça sert')}${bloc('manque', 'En cas de manque')}${bloc('exces', 'En cas d\'excès')}${bloc('conseils', 'Repères pratiques')}
      ${f.grossesse ? `<div class="bloc grossesse"><h3>Grossesse</h3><p>${esc(f.grossesse)}</p></div>` : ''}
    </div>
    <h2>${titreClassement}</h2>
    <div class="filters">
      <span class="seg"><button data-par="g" class="${o.par === 'g' ? 'on' : ''}">pour 100 g</button><button data-par="kcal" class="${o.par === 'kcal' ? 'on' : ''}">pour 100 kcal</button></span>
      <select id="cgrp" aria-label="Groupe"><option value="">Tous les groupes</option>
        ${META.groupes.map((g) => `<option value="${g.code}" ${g.code === o.grp ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="ctout" ${o.tout ? 'checked' : ''}> épices, herbes, algues, produits infantiles</label>
    </div>
    <p class="small muted">${o.par === 'kcal' ? 'Pour 100 kcal : les aliments qui en apportent le plus sans trop de calories (densité nutritionnelle).' : 'Teneur pour 100 g ; % du repère pour 100 g.'}</p>
    <div class="card"><ul class="list">${n.classement.map((a, i) => `<li><a href="#/aliment/${a.code}">
      <span class="rank">${i + 1}</span><span class="grow"><span class="nom">${esc(a.nom)}</span><span class="sub">${esc(a.groupe || '')}
      ${o.par === 'kcal' ? ` · ${fmt(num(a.brut))}${unite(n)} / 100 g` : ''}</span></span>
      <span class="val">${o.par === 'kcal' ? fmt(a.v) : fmtBrut(a.brut)}${unite(n)}${r?.valeur && o.par === 'g' ? `<br><span class="small muted">${pctTxt((a.v * 100) / r.valeur)}</span>` : ''}</span></a></li>`).join('')
      || '<li class="empty">Aucune donnée.</li>'}</ul></div>
    <p class="note">Fiche de vulgarisation rédigée d'après l'Anses, l'EFSA et l'OMS ; elle ne remplace pas l'avis d'un médecin ou d'un diététicien.
      Classement calculé sur la table Ciqual.</p>`;
  $app.querySelectorAll('[data-par]').forEach((b) => b.addEventListener('click', () => { classementOpts.par = b.dataset.par; render(); }));
  document.getElementById('cgrp').addEventListener('change', (e) => { classementOpts.grp = e.target.value; render(); });
  document.getElementById('ctout').addEventListener('change', (e) => { classementOpts.tout = e.target.checked; render(); });
}

// ---------- Comparateur ----------
async function vueComparer() {
  document.title = 'Comparer · Food';
  if (!comparer.length) {
    $app.innerHTML = `<h1>Comparer</h1><p class="empty">Aucun aliment à comparer.<br>Ouvrez un aliment puis touchez « + Comparer » (jusqu'à 4).</p>
      <p class="center"><a class="btn" href="#/">Rechercher un aliment</a></p>`;
    return;
  }
  const [liste, rep] = await Promise.all([api(`aliments?codes=${comparer.join(',')}`), getReperes()]);
  const cats = META.categories.map((c) => {
    const nuts = META.nutriments.filter((n) => n.cat === c.key && liste.some((a) => a.valeurs[n.key] != null));
    if (!nuts.length) return '';
    return `<tr class="cat"><td colspan="${liste.length + 1}">${esc(c.label)}</td></tr>${nuts.map((n) => {
      const vals = liste.map((a) => num(a.valeurs[n.key]));
      const defined = vals.filter((x) => x != null);
      const best = defined.length > 1 ? Math.max(...defined) : null;
      const isMax = rep[n.key]?.type === 'max' || ['ags', 'cholesterol', 'sodium', 'sucres'].includes(n.key);
      return `<tr><td><a href="#/nutriment/${n.key}">${esc(n.label)}</a> <span class="muted small">${esc(n.unit)}</span></td>${liste.map((a, i) => {
        const cls = best != null && vals[i] === best && best > 0 ? (isMax ? 'worst-max' : 'best') : '';
        const r = rep[n.key];
        return `<td class="${cls}">${fmtBrut(a.valeurs[n.key])}${r?.valeur && vals[i] != null ? `<br><span class="small muted">${pctTxt((vals[i] * 100) / r.valeur)}</span>` : ''}</td>`;
      }).join('')}</tr>`;
    }).join('')}`;
  }).join('');
  $app.innerHTML = `<h1>Comparer</h1><p class="small muted">Pour 100 g. En vert la valeur la plus élevée, en rouge pour ce qu'il vaut mieux limiter.</p>
    <div class="table-wrap"><table class="cmp"><thead><tr><th></th>${liste.map((a) => `<th><a href="#/aliment/${a.code}">${esc(a.nom)}</a><br>
      <button class="iconbtn" data-retirer="${a.code}" aria-label="Retirer ${esc(a.nom)}">✕</button></th>`).join('')}</tr></thead>
      <tbody>${cats}</tbody></table></div>
    <div class="actions"><a class="btn light" href="#/">+ Ajouter un aliment</a><button class="btn danger" id="vider">Tout retirer</button></div>`;
  $app.querySelectorAll('[data-retirer]').forEach((b) => b.addEventListener('click', () => {
    comparer = comparer.filter((c) => c !== Number(b.dataset.retirer)); store.set('comparer', comparer); badges(); render();
  }));
  document.getElementById('vider').addEventListener('click', () => { comparer = []; store.set('comparer', comparer); badges(); render(); });
}

// ---------- Assiette ----------
async function vueAssiette() {
  document.title = 'Assiette · Food';
  const codes = [...new Set(assiette.map((i) => i.code))];
  const [liste, rep] = await Promise.all([codes.length ? api(`aliments?codes=${codes.join(',')}`) : [], getReperes()]);
  const byCode = Object.fromEntries(liste.map((a) => [a.code, a]));
  const totaux = {};
  for (const it of assiette) {
    const a = byCode[it.code];
    if (!a) continue;
    for (const n of META.nutriments) {
      const v = num(a.valeurs[n.key]);
      if (v != null) totaux[n.key] = (totaux[n.key] || 0) + (v * it.g) / 100;
    }
  }
  const poids = assiette.reduce((s, i) => s + i.g, 0);
  $app.innerHTML = `<h1>Assiette</h1>
    <p class="small muted">Additionnez les aliments d'un repas ou d'une journée pour voir ce qu'ils apportent ensemble.</p>
    <div class="card">
      ${assiette.length ? assiette.map((it, i) => `<div class="item"><span class="grow"><a href="#/aliment/${it.code}?g=${it.g}">${esc(byCode[it.code]?.nom || `Aliment ${it.code}`)}</a>
        <span class="sub small muted">${byCode[it.code] ? `${fmt((num(byCode[it.code].valeurs.kcal) || 0) * it.g / 100)} kcal` : ''}</span></span>
        <input type="number" min="1" max="2000" inputmode="decimal" value="${it.g}" data-i="${i}" aria-label="Grammes"> g
        <button class="iconbtn" data-del="${i}" aria-label="Retirer">✕</button></div>`).join('')
        : '<p class="empty">Assiette vide. Ajoutez des aliments depuis leur fiche, ou ci-dessous.</p>'}
      <form class="search" id="add-form" role="search" onsubmit="return false" style="margin-top:10px">
        <input id="aq" type="search" autocomplete="off" placeholder="Ajouter un aliment…" aria-label="Ajouter un aliment"></form>
      <ul class="list" id="ares"></ul>
    </div>
    ${assiette.length ? `
      <div class="actions"><button class="btn" id="save">Enregistrer ce repas</button><button class="btn danger" id="clear">Vider</button></div>
      <h2>Total (${fmt(poids)} g)</h2>
      ${resumeEnergie(totaux, 1, rep)}
      ${pointsForts(totaux, 1, rep)}
      ${lignesNutriments(totaux, 1, rep)}
      <p class="small muted">Les constituants non mesurés dans Ciqual comptent pour zéro : les totaux de micronutriments peuvent être sous-estimés.</p>` : ''}
    ${repas.length ? `<h2>Repas enregistrés</h2><div class="grid2">${repas.map((r, i) => `<div class="tile">
      <b>${esc(r.nom)}</b><small>${r.items.length} aliment${r.items.length > 1 ? 's' : ''}</small>
      <div class="actions"><button class="btn small" data-load="${i}">Charger</button><button class="btn small danger" data-rm="${i}">Supprimer</button></div></div>`).join('')}</div>` : ''}`;

  const save = () => { store.set('assiette', assiette); badges(); };
  $app.querySelectorAll('[data-i]').forEach((inp) => inp.addEventListener('change', () => {
    const v = Number(inp.value); if (v > 0) { assiette[inp.dataset.i].g = Math.min(v, 2000); save(); render(); }
  }));
  $app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { assiette.splice(Number(b.dataset.del), 1); save(); render(); }));
  document.getElementById('clear')?.addEventListener('click', () => { if (confirm('Vider l\'assiette ?')) { assiette = []; save(); render(); } });
  document.getElementById('save')?.addEventListener('click', () => {
    const nom = prompt('Nom du repas', `Repas du ${new Date().toLocaleDateString('fr-FR')}`);
    if (!nom) return;
    repas.unshift({ nom: nom.slice(0, 60), items: assiette.map((i) => ({ ...i })) }); store.set('repas', repas.slice(0, 50)); render(); toast('Repas enregistré');
  });
  $app.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => {
    assiette = repas[b.dataset.load].items.map((i) => ({ ...i })); save(); render(); scrollTo(0, 0);
  }));
  $app.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm(`Supprimer « ${repas[b.dataset.rm].nom} » ?`)) return;
    repas.splice(Number(b.dataset.rm), 1); store.set('repas', repas); render();
  }));
  const aq = document.getElementById('aq');
  const ares = document.getElementById('ares');
  let t;
  aq.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = aq.value.trim();
      if (!q) { ares.innerHTML = ''; return; }
      const l = await api(`recherche?q=${encodeURIComponent(q)}&limit=8`).catch(() => []);
      if (aq.value.trim() !== q) return;
      ares.innerHTML = l.map((a) => `<li><div class="row"><span class="grow"><span class="nom">${esc(a.nom)}</span><span class="sub">${a.kcal == null ? '' : `${fmt(a.kcal)} kcal / 100 g`}</span></span>
        <button class="btn small" data-add="${a.code}">+ 100 g</button></div></li>`).join('') || '<li class="empty">Aucun résultat</li>';
      ares.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        assiette.push({ code: Number(b.dataset.add), g: 100 }); save(); render();
      }));
    }, 150);
  });
}

// ---------- Profil ----------
async function vueProfil() {
  document.title = 'Profil · Food';
  const p = { ...META.profil, ...profil };
  const suggestion = () => {
    const sexe = document.querySelector('[name=sexe]:checked').value;
    const g = document.getElementById('pg').checked;
    return (sexe === 'H' ? 2500 : 2000) + (g ? 250 : 0);
  };
  $app.innerHTML = `<h1>Profil</h1>
    <p class="muted">Sert à calculer les pourcentages des repères journaliers. Il reste sur cet appareil.</p>
    <div class="card">
      <div class="form-row"><b>Je suis</b>
        <label><input type="radio" name="sexe" value="F" ${p.sexe !== 'H' ? 'checked' : ''}> une femme</label>
        <label><input type="radio" name="sexe" value="H" ${p.sexe === 'H' ? 'checked' : ''}> un homme</label></div>
      <div class="form-row"><label><input type="checkbox" id="pg" ${p.grossesse ? 'checked' : ''}> Enceinte (repères du 2e trimestre)</label></div>
      <div class="form-row"><label>Poids <input type="number" id="pp" min="25" max="250" value="${p.poids}"> kg</label>
        <span class="small muted">pour le repère en protéines (0,83 g/kg)</span></div>
      <div class="form-row"><label>Énergie <input type="number" id="pk" min="800" max="6000" step="50" value="${p.kcal}"> kcal/jour</label>
        <button class="btn small light" id="sugg">Valeur courante</button></div>
      <p class="small muted">Ordre de grandeur pour un adulte moyennement actif : 2 000 kcal (femme), 2 500 kcal (homme), +250 kcal en milieu de grossesse.</p>
      <div class="actions"><button class="btn" id="ok">Enregistrer</button></div>
    </div>
    <p class="note">Repères : Anses 2021 (vitamines et minéraux), EFSA, OMS (sel, sucres). Chiffres arrondis pour un adulte en bonne santé ;
      les besoins d'un enfant, d'une personne âgée ou malade sont différents.</p>`;
  document.getElementById('sugg').addEventListener('click', () => { document.getElementById('pk').value = suggestion(); });
  document.getElementById('ok').addEventListener('click', () => {
    profil = {
      sexe: document.querySelector('[name=sexe]:checked').value,
      grossesse: document.getElementById('pg').checked,
      poids: Math.min(Math.max(Number(document.getElementById('pp').value) || 60, 25), 250),
      kcal: Math.min(Math.max(Number(document.getElementById('pk').value) || 2000, 800), 6000),
    };
    if (profil.grossesse) profil.sexe = 'F';
    store.set('profil', profil);
    toast('Profil enregistré');
    history.back();
  });
}

// ---------- Routeur ----------
async function render() {
  const [route, query] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query || '');
  const parts = route.split('/').filter(Boolean);
  const tab = { nutriments: 'nutriments', nutriment: 'nutriments', comparer: 'comparer', assiette: 'assiette' }[parts[0]] || (parts[0] ? '' : 'recherche');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  try {
    if (!META) {
      META = await api('meta');
      for (const n of META.nutriments) NUT[n.key] = n;
    }
    switch (parts[0]) {
      case undefined: document.title = 'Food : ce que contient votre assiette'; await vueRecherche(); break;
      case 'aliment': await vueAliment(Number(parts[1]), params); break;
      case 'nutriments': await vueNutriments(); break;
      case 'nutriment': await vueNutriment(parts[1]); break;
      case 'comparer': await vueComparer(); break;
      case 'assiette': await vueAssiette(); break;
      case 'profil': await vueProfil(); break;
      default: location.replace('#/');
    }
  } catch (e) {
    $app.innerHTML = `<p class="empty">${esc(navigator.onLine ? e.message : 'Hors ligne : cette page n\'a pas encore été consultée sur cet appareil.')}</p>
      <p class="center"><a class="btn light" href="#/">Accueil</a></p>`;
  }
}

let lastRoute = '';
window.addEventListener('hashchange', () => {
  const route = location.hash.split('?')[0];
  render().then(() => { if (route !== lastRoute) scrollTo(0, 0); lastRoute = route; });
});
lastRoute = location.hash.split('?')[0];
badges();
render();
