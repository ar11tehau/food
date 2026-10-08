// Food : interface (sans framework). Routes (le serveur rend aussi chaque page, pour les moteurs de recherche) :
//   /             recherche          /aliment/<code>-<nom>?g=150   fiche aliment
//   /nutriments   liste              /nutriment/<clé>              fiche nutriment
//   /comparer     comparateur        /assiette                     repas en cours et repas enregistrés
//   /profil       profil (repères)   /meilleurs[/<groupe>], /sources
// Le profil, le comparateur et les assiettes restent sur l'appareil (localStorage).
'use strict';

const $app = document.getElementById('app');
// « Pâté de foie, 100 % porc » → « pate-de-foie-100-porc » (même calcul dans server/pages.js).
function slug(nom) {
  const t = String(nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).join('-');
  return t.length > 70 ? t.slice(0, 71).replace(/-[^-]*$/, '') : t;
}
const lienAliment = (code, nom) => `/aliment/${code}${nom ? `-${slug(nom)}` : ''}`;
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
  return `reperes?sexe=${p.sexe}&grossesse=${p.grossesse ? 1 : 0}&poids=${p.poids}&kcal=${p.kcal}${p.age ? `&age=${p.age}` : ''}`;
};
const getReperes = () => api(reperesPath());
// Affichage par défaut des fiches et classements : « portion » (habituelle) ou « 100g ».
const par100g = () => profil?.affichage === '100g';

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
// Équivalent en nombre : « ≈ 3 œufs », « ≈ ½ avocat », « ≈ 1,5 banane ».
function enUnites(g, u) {
  if (!u || !g) return '';
  const n = g / u.g;
  if (n < 0.2) return '';
  const x = n < 1 ? Math.max(0.25, Math.round(n * 4) / 4) : n < 3 ? Math.round(n * 2) / 2 : Math.round(n);
  const txt = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[x] || nf(x, 1);
  return `${txt} ${x >= 2 ? u.pluriel : u.nom}`;
}
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
const typeLabel = { rnp: 'référence (RNP)', as: 'apport satisfaisant', max: 'limite à ne pas dépasser', cible: 'objectif indicatif', bm: 'besoin moyen (OMS)' };
const profilTxt = () => {
  const p = { ...META.profil, ...profil };
  return `${p.grossesse ? 'grossesse' : p.sexe === 'H' ? 'homme' : 'femme'}, ${p.poids} kg, ${p.kcal} kcal`;
};

// ---------- Recherche ----------
let rechercheQ = '';
let rechercheGrp = '';
async function vueRecherche() {
  $app.innerHTML = `
    <h1 class="accroche">Valeurs nutritionnelles des aliments</h1>
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
    ? `<div class="card"><ul class="list">${liste.map((a) => ligneAliment(a, true)).join('')}</ul></div>`
    : `<p class="empty">Aucun aliment pour « ${esc(q)} ». Essayez un mot plus court ou au singulier.</p>`;
}

const ligneAliment = (a, actions) => `<li${actions ? ' class="act"' : ''}><a href="${lienAliment(a.code, a.nom)}">${scoreBadge(a.score)}<span class="grow"><span class="nom">${esc(a.nom)}</span>
  <span class="sub">${esc(a.groupe || '')}${a.portion ? ` · portion ${fmt(a.portion)} g${a.unite ? ` (≈ ${esc(enUnites(a.portion, a.unite))})` : ''}` : ''}</span></span><span class="val">${a.kcal == null ? '–' : `${fmt(a.kcal)} kcal`}<br><span class="small muted">/ 100 g</span></span></a>${actions ? boutonsAliment(a) : ''}</li>`;
// Boutons « comparer » et « assiette » d'une ligne de résultat : ajoutent, ou retirent si l'aliment y est déjà.
const boutonsAliment = (a) => {
  const c = comparer.includes(a.code);
  const s = assiette.some((x) => x.code === a.code);
  return `<span class="acts"><button class="ib ${c ? 'on' : ''}" data-cmp="${a.code}" title="${c ? 'Retirer du comparateur' : 'Ajouter au comparateur'}" aria-pressed="${c}">⇄</button>`
    + `<button class="ib ${s ? 'on' : ''}" data-ass="${a.code}" data-portion="${a.portion || 100}" title="${s ? "Retirer de l'assiette" : "Ajouter à l'assiette"}" aria-pressed="${s}">◍</button></span>`;
};
// Délégation : un seul écouteur pour toutes les listes de la page.
$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmp], [data-ass]');
  if (!b || !b.classList.contains('ib')) return;
  e.preventDefault();
  const code = Number(b.dataset.cmp || b.dataset.ass);
  const nom = b.closest('li').querySelector('.nom').textContent.split(',')[0];
  if (b.dataset.cmp) {
    if (comparer.includes(code)) { comparer = comparer.filter((x) => x !== code); toast(`${nom} retiré du comparateur`); }
    else {
      if (comparer.length >= 4) comparer.shift();
      comparer.push(code);
      toast(comparer.length > 1 ? `${comparer.length} aliments à comparer` : 'Ajoutez un 2e aliment pour comparer');
    }
    store.set('comparer', comparer);
  } else {
    if (assiette.some((x) => x.code === code)) { assiette = assiette.filter((x) => x.code !== code); toast(`${nom} retiré de l'assiette`); }
    else { assiette.push({ code, g: Number(b.dataset.portion) }); toast(`${nom} ajouté à l'assiette (${fmt(Number(b.dataset.portion))} g)`); }
    store.set('assiette', assiette);
  }
  badges();
  // Met à jour l'état de tous les boutons de la page (l'aliment peut apparaître deux fois, ou le comparateur être décalé).
  $app.querySelectorAll('li.act').forEach((li) => {
    const x = li.querySelector('[data-cmp]');
    const c = comparer.includes(Number(x.dataset.cmp));
    const y = li.querySelector('[data-ass]');
    const v = assiette.some((i) => i.code === Number(y.dataset.ass));
    x.classList.toggle('on', c); x.setAttribute('aria-pressed', c); x.title = c ? 'Retirer du comparateur' : 'Ajouter au comparateur';
    y.classList.toggle('on', v); y.setAttribute('aria-pressed', v); y.title = v ? "Retirer de l'assiette" : "Ajouter à l'assiette";
  });
});

function accueil() {
  const cles = ['prot', 'fibres', 'fer', 'calcium', 'magnesium', 'iode', 'vitd', 'vitc', 'b9', 'b12', 'dha', 'leu', 'lys', 'sel'];
  return `
    ${recents.length ? `<h2>Consultés récemment</h2><div class="card"><ul class="list">${recents.map((a) => ligneAliment(a, true)).join('')}</ul></div>` : ''}
    <h2>Où trouver…</h2>
    <div class="chips">${cles.map((k) => `<a class="chip" href="/nutriment/${k}">${esc(NUT[k].label)}</a>`).join('')}
      <a class="chip ghost" href="/nutriments">Tous les nutriments →</a></div>
    <h2>Les portions les plus intéressantes</h2>
    <div class="chips"><a class="chip" href="/meilleurs">Tous les aliments</a>${META.groupes.filter((g) => !['10', '11', '06'].includes(g.code))
      .map((g) => `<a class="chip ghost" href="/meilleurs/${g.code}">${esc(g.nom)}</a>`).join('')}</div>
    <p class="note">${esc(META.source)} ; portions : Anses INCA3 ; acides aminés : USDA. ${META.aliments.toLocaleString('fr-FR')} aliments.
      Repères pour un adulte (${esc(profilTxt())}, <a href="/profil">modifier</a>). <a href="/sources">Sources et méthodes</a>.
      Vos données restent sur cet appareil, rien n'est conservé sur le serveur. Informations générales, pas un avis médical.</p>`;
}

// ---------- Fiche aliment ----------
function lignesNutriments(valeurs, k, rep, opts = {}) {
  return META.categories.map((c) => {
    const nuts = META.nutriments.filter((n) => n.cat === c.key && (opts.tout || valeurs[n.key] != null));
    if (!nuts.length) return '';
    const open = c.key === 'macros' || c.key === 'mineraux' || c.key === 'vitamines';
    const aaNote = c.key === 'acidesamines' && opts.aa
      ? `<p class="small muted">${opts.aa.estime ? '<b>Estimation</b> d\'après le profil moyen du groupe' : 'D\'après le profil USDA'} « ${esc(opts.aa.source)} », appliqué aux protéines de Ciqual. Indispensables en gras.
        L'indice chimique (sous « Protéines ») compare chaque acide aminé indispensable, par gramme de protéines, au profil de référence FAO/OMS :
        le plus en retrait (le « limitant ») fixe la part des protéines réellement utilisable pour fabriquer celles du corps.</p>` : '';
    return `<details class="cat card" ${open ? 'open' : ''}><summary>${esc(c.label)}</summary>${aaNote}
      ${nuts.map((n) => {
        const v = valeurs[n.key];
        const enfant = n.parent && n.cat !== 'macros' && NUT[n.parent].cat === c.key;
        const conf = opts.qualite?.[n.key]?.[0];
        const lbl = n.essentiel ? `<b>${esc(n.label)}</b>` : esc(n.label);
        return `<a class="nut ${enfant ? 'child' : ''}" href="/nutriment/${n.key}"><span class="lbl">${lbl}${conf ? ` <span class="conf c${conf}" title="Fiabilité Anses : ${CONF[conf]}">${conf}</span>` : ''}</span>
          <span class="v">${fmtBrut(v, k)}${v == null ? '' : unite(n)}</span>${gauge(n, v == null ? null : num(v) * k, rep[n.key])}</a>`
          + (n.key === 'prot' && c.key === 'macros' ? ligneQualiteProt(opts.aa, num(v) * k) : '');
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
// Points faibles (même principe que le score) : nutriments à favoriser dont la portion couvre moins de la moitié de sa
// part des calories du jour ; seulement si la portion pèse au moins 5 % des calories, et jamais pour une valeur non mesurée.
function pointsForts(v, k, rep) {
  const forts = [];
  const vigilance = [];
  const e = ((num(v.kcal) || 0) * k * 100) / (rep.kcal?.valeur || META.score.ref.kcal);
  const faibles = e < 5 ? [] : META.score.positifs.map((key) => {
    const x = num(v[key]);
    return x == null || !rep[key]?.valeur ? null : [NUT[key], (x * k * 100) / rep[key].valeur];
  }).filter((f) => f && f[1] < e / 2).sort((a, b) => a[1] - b[1]).slice(0, 6);
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
  const chip = ([n, p], cls) => `<a class="chip ${cls}" href="/nutriment/${n.key}">${esc(n.label)} · ${pctTxt(p)}</a>`;
  if (!forts.length && !vigilance.length && !faibles.length) return '';
  return `<div class="card">
    ${forts.length ? `<h3>Points forts</h3><div class="chips">${forts.map((f) => chip(f, f[1] >= 30 ? '' : 'ghost')).join('')}</div>` : ''}
    ${faibles.length ? `<h3>Points faibles</h3><p class="small muted">Peu présents pour ${pctTxt(e)} des calories du jour :</p>
      <div class="chips">${faibles.map((f) => chip(f, 'ghost')).join('')}</div>` : ''}
    ${vigilance.length ? `<h3>À surveiller</h3><div class="chips">${vigilance.map((f) => chip(f, f[1] >= 100 ? 'bad' : 'warn')).join('')}</div>` : ''}
    <p class="small muted">En % du repère journalier pour la portion choisie.</p></div>`;
}

const PORTIONS = [30, 50, 100, 150, 200, 250];
const ORIGINE_PORTION = { a: 'portion médiane des adultes (étude INCA3)', v: 'portion médiane d\'aliments semblables (INCA3)', g: 'portion estimée pour ce groupe d\'aliments' };
const scoreBadge = (l, cls = '') => (l ? `<span class="score s${l} ${cls}" title="Score de la portion habituelle">${l}</span>` : '');
const LIB_SCORE = { sucreslibres: 'Sucres libres (estimés)' };
const libScore = (k) => LIB_SCORE[k] || NUT[k]?.label || k;

function carteScore(a) {
  const s = a.score;
  const plus = s.detail.filter(([, p]) => p > 0).sort((x, y) => y[1] - x[1]);
  const moins = s.detail.filter(([, p]) => p < 0).sort((x, y) => x[1] - y[1]);
  const e = Math.round(((num(a.valeurs.kcal) || 0) * a.portion.g) / META.score.ref.kcal);
  const chip = ([k, p], cls) => `<span class="chip ${cls}">${esc(libScore(k))} ${p > 0 ? '' : '−'}${Math.abs(p)} %</span>`;
  return `<div class="card score-card">
    <div class="score-head">${scoreBadge(s.lettre, 'big')}<div><b>Score de la portion habituelle (${fmt(a.portion.g)} g${a.unite ? `, ≈ ${esc(enUnites(a.portion.g, a.unite))}` : ''})</b>
      <p class="small muted">${esc(ORIGINE_PORTION[a.portion.origine] || 'portion par défaut')} · ${e} % des calories du jour · ${nf(s.points, 1)} points</p></div></div>
    ${plus.length ? `<p class="small">Apporte (en % du repère) :</p><div class="chips">${plus.slice(0, 8).map((x) => chip(x, x[1] >= e ? '' : 'ghost')).join('')}</div>` : ''}
    ${moins.some(([, p]) => p < 0) ? `<p class="small">À limiter (en % de la limite du jour) :</p><div class="chips">${moins.map((x) => chip(x, -x[1] > e ? 'warn' : 'ghost')).join('')}</div>` : ''}
    <p class="small muted">Un nutriment compte en bonus s'il dépasse la part de calories de la portion (${e} %).
      <a href="/sources">Comment est calculé le score ?</a></p></div>`;
}

// Qualité des protéines, en sous-ligne de « Protéines » : seulement si la quantité choisie en apporte au moins 3 g.
function ligneQualiteProt(aa, prot) {
  const q = aa?.qualite;
  if (!q || !(prot >= 3)) return '';
  const lim = q.limitant ? (NUT[q.limitant] ? `<a href="/nutriment/${q.limitant}">${esc(q.limitantLabel)}</a>` : esc(q.limitantLabel)) : null;
  const cls = q.indice >= 100 ? '' : q.indice >= 75 ? 'max' : 'max over';
  const conseil = q.limitant === 'lys' ? ' Associer des légumineuses ou des produits animaux.'
    : q.limitant === 'soufres' ? ' Associer des céréales, des oléagineux ou des produits animaux.' : '';
  return `<div class="nut child"><span class="lbl">Qualité (indice chimique)${q.indice >= 100 ? ' · complètes' : ''}</span><span class="v">${q.indice} %</span>
    <div class="bar"><div class="gauge ${cls}"><span style="width:${q.indice}%"></span></div><span class="pct"></span></div>
    <span class="small muted" style="grid-column:1/-1">${lim ? `Limitant : ${lim}.${conseil}` : 'Tous les acides aminés indispensables sont au niveau de référence.'}
      <a href="/sources">Comment est-ce calculé ?</a></span></div>`;
}

const CONF = { A: 'très fiable', B: 'fiable', C: 'moins fiable', D: 'peu fiable (estimation)' };
function carteSources(a) {
  const lignes = META.nutriments.filter((n) => a.qualite[n.key]).map((n) => {
    const [c, src] = a.qualite[n.key];
    return `<li><span class="conf c${c || 'x'}">${c || '?'}</span> ${esc(n.label)} : <span class="muted">${esc(a.references[src] || 'source non précisée')}</span></li>`;
  });
  const nb = Object.values(a.qualite).reduce((m, [c]) => ({ ...m, [c || '?']: (m[c || '?'] || 0) + 1 }), {});
  return `<details class="card cat"><summary>Sources et fiabilité des valeurs</summary>
    <p class="small">Indice de confiance de l'Anses : ${['A', 'B', 'C', 'D'].map((c) => `<span class="conf c${c}">${c}</span> ${CONF[c]} (${nb[c] || 0})`).join(' · ')}.</p>
    <ul class="sources">${lignes.join('')}</ul>
    ${a.aa ? `<p class="small">Acides aminés : profil USDA FoodData Central « ${esc(a.aa.source)} »${a.aa.estime ? ' (estimation par groupe)' : ''} appliqué aux protéines Ciqual.</p>` : ''}
    <p class="small">Portion : ${esc(ORIGINE_PORTION[a.portion.origine] || 'par défaut, 100 g')}. <a href="/sources">Toutes les sources</a></p></details>`;
}

async function vueAliment(code, params) {
  const [a, rep] = await Promise.all([api(`aliment/${code}`), getReperes()]);
  const gDefaut = par100g() ? 100 : a.portion.g || 100;
  const g = Math.min(Math.max(Number(params.get('g')) || gDefaut, 1), 2000);
  const k = g / 100;
  recents = [{ code: a.code, nom: a.nom, groupe: a.groupes.at(-1)?.nom, kcal: num(a.valeurs.kcal), portion: a.portion.g, unite: a.unite, score: a.score.lettre },
    ...recents.filter((r) => r.code !== a.code)].slice(0, 8);
  store.set('recents', recents);
  document.title = `${a.nom} : valeurs nutritionnelles · Food`;
  const dansComparer = comparer.includes(a.code);
  $app.innerHTML = `
    <p class="small muted">${a.groupes.map((x) => esc(x.nom)).join(' › ')}</p>
    <h1>${esc(a.nom)}</h1>
    ${a.nom_sci ? `<p class="small muted"><i>${esc(a.nom_sci)}</i></p>` : ''}
    <div class="card portion">
      <span>Pour</span>
      ${a.portion.g ? `<button class="chip ${a.portion.g === g ? 'on' : 'ghost'}" data-g="${a.portion.g}" title="${esc(ORIGINE_PORTION[a.portion.origine] || '')}">portion ${fmt(a.portion.g)} g${a.unite ? ` · ≈ ${esc(enUnites(a.portion.g, a.unite))}` : ''}</button>` : ''}
      ${a.unite ? [1, 2, 3].map((n) => n * a.unite.g).filter((x) => x !== a.portion.g).map((x) => `<button class="chip ${x === g ? 'on' : 'ghost'}" data-g="${x}">${esc(enUnites(x, a.unite))} (${fmt(x)} g)</button>`).join('') : ''}
      ${PORTIONS.filter((p) => p !== a.portion.g).map((p) => `<button class="chip ${p === g ? 'on' : 'ghost'}" data-g="${p}">${p} g</button>`).join('')}
      <input type="number" id="g" min="1" max="2000" inputmode="decimal" value="${g}" aria-label="Quantité en grammes"> g
    </div>
    <div class="actions">
      <button class="btn" id="add-assiette">+ Assiette (${fmt(g)} g)</button>
      <button class="btn light" id="add-comparer">${dansComparer ? '✓ Dans le comparateur' : '+ Comparer'}</button>
    </div>
    ${carteScore(a)}
    ${resumeEnergie(a.valeurs, k, rep)}
    ${pointsForts(a.valeurs, k, rep)}
    ${lignesNutriments(a.valeurs, k, rep, { qualite: a.qualite, aa: a.aa })}
    <p class="small muted">« – » : valeur non mesurée dans Ciqual (${a.renseignes} constituants renseignés). La petite lettre indique la fiabilité de la valeur (A à D).
      Les pourcentages se rapportent aux repères journaliers du profil (${esc(profilTxt())}).</p>
    ${carteSources(a)}
    ${a.semblables.length ? `<h2>Dans le même groupe</h2><div class="card"><ul class="list">${a.semblables.slice(0, 12).map(ligneAliment).join('')}</ul></div>` : ''}`;

  const setG = (v) => { go(`${lienAliment(a.code, a.nom)}${Number(v) === gDefaut ? '' : `?g=${Number(v)}`}`, true); };
  $app.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => setG(b.dataset.g)));
  const gi = document.getElementById('g');
  gi.addEventListener('change', () => { if (gi.value > 0) setG(gi.value); });
  document.getElementById('add-assiette').addEventListener('click', () => {
    assiette.push({ code: a.code, g }); store.set('assiette', assiette); badges();
    toast(`${a.nom.split(',')[0]} ajouté à l'assiette`);
  });
  document.getElementById('add-comparer').addEventListener('click', (e) => {
    if (comparer.includes(a.code)) { go('/comparer'); return; }
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
      ${META.nutriments.filter((n) => n.cat === c.key).map((n) => `<li><a href="/nutriment/${n.key}"><span class="grow">
        <span class="nom">${n.parent && NUT[n.parent].cat === c.key ? '<span class="muted">↳ </span>' : ''}${esc(n.label)}</span>
        ${n.resume ? `<span class="sub">${esc(n.resume.length > 110 ? `${n.resume.slice(0, 108)}…` : n.resume)}</span>` : ''}</span></a></li>`).join('')}
    </ul></div>`).join('')}`;
}

let classementOpts = { par: par100g() ? 'g' : 'portion', grp: '', tout: false };
async function vueNutriment(key) {
  const o = classementOpts;
  const [n, rep] = await Promise.all([
    api(`nutriment/${key}?par=${o.par}&limit=40${o.grp ? `&grp=${o.grp}` : ''}${o.tout ? '&tout=1' : ''}`), getReperes()]);
  const r = rep[key];
  const f = n.fiche || {};
  document.title = `${n.label} : rôle, besoins et aliments les plus riches · Food`;
  const bloc = (cle, titre) => (f[cle] ? `<div class="bloc ${cle}"><h3>${titre}</h3><p>${esc(f[cle])}</p></div>` : '');
  const titreClassement = r?.type === 'max' ? 'Aliments qui en contiennent le plus' : 'Meilleures sources';
  $app.innerHTML = `
    ${n.parent ? `<p class="small"><a href="/nutriment/${n.parent.key}">← ${esc(n.parent.label)}</a></p>` : ''}
    <h1>${esc(n.label)}</h1>
    ${f.resume ? `<p>${esc(f.resume)}</p>` : ''}
    ${r ? `<div class="card repere"><span>Repère : <b>${fmt(r.valeur)}${unite(n)}</b> par jour</span>
      <span class="muted">${typeLabel[r.type]}${r.ul ? ` · limite de sécurité ${fmt(r.ul)}${unite(n)}` : ''}</span>
      <span class="muted small">Profil : ${esc(profilTxt())} · <a href="/profil">modifier</a></span></div>` : ''}
    ${n.enfants.length ? `<div class="chips">${n.enfants.map((c) => `<a class="chip ghost" href="/nutriment/${c.key}">${esc(c.label)}</a>`).join('')}</div>` : ''}
    <div class="fiche">
      ${bloc('role', 'À quoi ça sert')}${bloc('manque', 'En cas de manque')}${bloc('exces', 'En cas d\'excès')}${bloc('conseils', 'Repères pratiques')}
      ${f.grossesse ? `<div class="bloc grossesse"><h3>Grossesse</h3><p>${esc(f.grossesse)}</p></div>` : ''}
      ${n.assimilation ? `<div class="bloc assimilation"><h3>Assimilation</h3>
        ${n.assimilation.aide ? `<p><b class="ok">Ce qui aide :</b> ${esc(n.assimilation.aide)}</p>` : ''}
        ${n.assimilation.freine ? `<p><b class="ko">Ce qui freine :</b> ${esc(n.assimilation.freine)}</p>` : ''}</div>` : ''}
    </div>
    <h2>${titreClassement}</h2>
    <div class="filters">
      <span class="seg"><button data-par="portion" class="${o.par === 'portion' ? 'on' : ''}">par portion</button><button data-par="g" class="${o.par === 'g' ? 'on' : ''}">pour 100 g</button><button data-par="kcal" class="${o.par === 'kcal' ? 'on' : ''}">pour 100 kcal</button></span>
      <select id="cgrp" aria-label="Groupe"><option value="">Tous les groupes</option>
        ${META.groupes.map((g) => `<option value="${g.code}" ${g.code === o.grp ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}</select>
      <label class="small"><input type="checkbox" id="ctout" ${o.tout ? 'checked' : ''}> épices, herbes, algues, produits infantiles</label>
    </div>
    <p class="small muted">${{ kcal: 'Pour 100 kcal : les aliments qui en apportent le plus sans trop de calories (densité nutritionnelle).',
      portion: 'Pour la portion habituellement mangée par les adultes (INCA3) : ce qu\'apporte vraiment l\'aliment dans un repas. Seuls les aliments dont la portion vient de l\'étude sont classés.',
      g: 'Teneur pour 100 g ; % du repère pour 100 g.' }[o.par]}</p>
    <div class="card"><ul class="list">${n.classement.map((a, i) => `<li><a href="${lienAliment(a.code, a.nom)}${o.par === 'g' ? '?g=100' : o.par === 'portion' && a.portion ? `?g=${a.portion}` : ''}">
      <span class="rank">${i + 1}</span><span class="grow"><span class="nom">${esc(a.nom)}${a.aaEstime && n.cat === 'acidesamines' ? ' <span class="muted small">(estimé)</span>' : ''}</span>
      <span class="sub">${esc(a.groupe || '')}${o.par === 'kcal' ? ` · ${fmt(num(a.brut))}${unite(n)} / 100 g` : ''}${o.par === 'portion' ? ` · portion ${fmt(a.portion)} g${a.unite ? ` (≈ ${esc(enUnites(a.portion, a.unite))})` : ''}` : ''}</span></span>
      <span class="val">${o.par === 'g' ? fmtBrut(a.brut) : fmt(a.v)}${unite(n)}${r?.valeur && o.par !== 'kcal' ? `<br><span class="small muted">${pctTxt((a.v * 100) / r.valeur)}</span>` : ''}</span></a></li>`).join('')
      || '<li class="empty">Aucune donnée.</li>'}</ul></div>
    <h2>Références</h2>
    <ul class="sources small">${n.references.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre)}</a></li>`).join('')}</ul>
    <p class="note">Fiche de vulgarisation rédigée d'après ces références ; elle ne remplace pas l'avis d'un médecin ou d'un diététicien.
      Classement calculé sur la table Ciqual${n.cat === 'acidesamines' ? ' et les profils USDA' : ''}. <a href="/sources">Toutes les sources</a></p>`;
  $app.querySelectorAll('[data-par]').forEach((b) => b.addEventListener('click', () => { classementOpts.par = b.dataset.par; render(); }));
  document.getElementById('cgrp').addEventListener('change', (e) => { classementOpts.grp = e.target.value; render(); });
  document.getElementById('ctout').addEventListener('change', (e) => { classementOpts.tout = e.target.checked; render(); });
}

// ---------- Meilleures portions ----------
async function vueMeilleurs(grp) {
  const g = META.groupes.find((x) => x.code === grp);
  document.title = 'Meilleures portions · Food';
  const liste = await api(`meilleurs?limit=60${g ? `&grp=${g.code}` : ''}`);
  $app.innerHTML = `<h1>Les portions les plus intéressantes</h1>
    <p class="muted">${g ? esc(g.nom) : 'Tous les aliments'} · classés par le score de leur portion habituelle (aliments dont la portion vient de l'étude INCA3).</p>
    <div class="filters"><select id="mgrp" aria-label="Groupe"><option value="">Tous les groupes</option>
      ${META.groupes.map((x) => `<option value="${x.code}" ${x.code === grp ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></div>
    <div class="card"><ul class="list">${liste.map(ligneAliment).join('') || '<li class="empty">Aucun aliment.</li>'}</ul></div>
    <p class="note"><a href="/sources">Comment est calculé le score ?</a></p>`;
  document.getElementById('mgrp').addEventListener('change', (e) => { go(e.target.value ? `/meilleurs/${e.target.value}` : '/meilleurs'); });
}

// ---------- Sources ----------
async function vueSources() {
  document.title = 'Sources · Food';
  $app.innerHTML = `<h1>Sources et méthodes</h1>
    ${Object.values(META.sources).map((x) => `<div class="card"><h3>${esc(x.titre)}</h3><p class="small">${esc(x.texte)}</p>
      <ul class="sources small">${x.liens.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join('')}</ul></div>`).join('')}
    <div class="card"><h3>Score : lettres</h3><p class="small">${META.score.seuils.map(([l, s]) => `${scoreBadge(l)} ≥ ${nf(s, 1)} points`).join(' · ')} · ${scoreBadge('E')} en dessous.</p>
      <p class="small">À favoriser : ${META.score.positifs.map((k) => esc(libScore(k))).join(', ')}.<br>À limiter : ${META.score.negatifs.map((k) => esc(libScore(k))).join(', ')}.
      Repères du score : femme adulte, 2 000 kcal (identiques pour tous, quel que soit le profil).</p></div>
    <p class="note">Code source : <a href="https://github.com/ar11tehau/food" target="_blank" rel="noopener">github.com/ar11tehau/food</a>. Fiches nutriments : vulgarisation, pas un avis médical.</p>`;
}

// ---------- Comparateur ----------
async function vueComparer() {
  document.title = 'Comparer · Food';
  if (!comparer.length) {
    $app.innerHTML = `<h1>Comparer</h1><p class="empty">Aucun aliment à comparer.<br>Ouvrez un aliment puis touchez « + Comparer » (jusqu'à 4).</p>
      <p class="center"><a class="btn" href="/">Rechercher un aliment</a></p>`;
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
      return `<tr><td><a href="/nutriment/${n.key}">${esc(n.label)}</a> <span class="muted small">${esc(n.unit)}</span></td>${liste.map((a, i) => {
        const cls = best != null && vals[i] === best && best > 0 ? (isMax ? 'worst-max' : 'best') : '';
        const r = rep[n.key];
        return `<td class="${cls}">${fmtBrut(a.valeurs[n.key])}${r?.valeur && vals[i] != null ? `<br><span class="small muted">${pctTxt((vals[i] * 100) / r.valeur)}</span>` : ''}</td>`;
      }).join('')}</tr>`;
    }).join('')}`;
  }).join('');
  $app.innerHTML = `<h1>Comparer</h1><p class="small muted">Pour 100 g. En vert la valeur la plus élevée, en rouge pour ce qu'il vaut mieux limiter.</p>
    <div class="table-wrap"><table class="cmp"><thead><tr><th></th>${liste.map((a) => `<th><a href="${lienAliment(a.code, a.nom)}">${esc(a.nom)}</a><br>
      <button class="iconbtn" data-retirer="${a.code}" aria-label="Retirer ${esc(a.nom)}">✕</button></th>`).join('')}</tr></thead>
      <tbody><tr class="cat"><td colspan="${liste.length + 1}">Synthèse</td></tr>
        <tr><td><a href="/sources">Score de la portion</a></td>${liste.map((a) => `<td>${scoreBadge(a.score.lettre)}</td>`).join('')}</tr>
        <tr><td>Portion habituelle</td>${liste.map((a) => `<td>${a.portion.g ? `${fmt(a.portion.g)} g` : '–'}</td>`).join('')}</tr>
        <tr><td><a href="/sources">Qualité des protéines</a></td>${liste.map((a) => `<td>${a.aa?.qualite ? `${a.aa.qualite.indice} %${a.aa.qualite.limitantLabel ? `<br><span class="small muted">${esc(a.aa.qualite.limitantLabel)}</span>` : ''}` : '–'}</td>`).join('')}</tr>
        ${cats}</tbody></table></div>
    <div class="actions"><a class="btn light" href="/">+ Ajouter un aliment</a><button class="btn danger" id="vider">Tout retirer</button></div>`;
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
      ${assiette.length ? assiette.map((it, i) => `<div class="item"><span class="grow"><a href="${lienAliment(it.code, byCode[it.code]?.nom)}?g=${it.g}">${esc(byCode[it.code]?.nom || `Aliment ${it.code}`)}</a>
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
      ${proteinesRepas(totaux, assiette.map((it) => byCode[it.code]).filter(Boolean))}
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

// Indice chimique d'un mélange (même calcul que server/score.js) : montre la complémentarité des protéines.
function indiceChimique(v) {
  const prot = v.prot;
  if (!prot || prot < 0.5 || v.lys == null) return null;
  const g = (k) => (num(v[k]) || 0) / prot;
  const parG = { his: g('his'), ile: g('ile'), leu: g('leu'), lys: g('lys'), soufres: g('met') + g('cys'),
    aromatiques: g('phe') + g('tyr'), thr: g('thr'), trp: g('trp'), val: g('val') };
  const [k, r] = Object.entries(META.aa.reference).map(([x, ref]) => [x, parG[x] / ref]).sort((a, b) => a[1] - b[1])[0];
  return { indice: Math.min(100, Math.round(r * 100)), limitantLabel: r < 1 ? (META.aa.labels[k] || NUT[k].label.toLowerCase()) : null };
}

function proteinesRepas(totaux, aliments) {
  const q = indiceChimique(totaux);
  if (!q) return '';
  const seuls = aliments.filter((a) => a.aa?.qualite && num(a.valeurs.prot) >= 2);
  const estime = aliments.some((a) => a.aa?.estime);
  return `<div class="card"><h3>Qualité des protéines du repas</h3>
    <div class="nut" style="border:0"><span class="lbl">Indice chimique ${q.indice >= 100 ? '· protéines complètes' : ''}</span><span class="v">${q.indice} %</span>
      <div class="bar"><div class="gauge ${q.indice >= 100 ? '' : q.indice >= 75 ? 'max' : 'max over'}"><span style="width:${q.indice}%"></span></div><span class="pct"></span></div></div>
    <p class="small">${q.limitantLabel ? `Acide aminé limitant : ${esc(q.limitantLabel)}.` : 'Les acides aminés indispensables du repas atteignent le profil de référence.'}</p>
    ${seuls.length > 1 ? `<p class="small muted">Séparément : ${[...new Map(seuls.map((a) => [a.code, a])).values()].map((a) => `${esc(a.nom.split(',')[0])} ${a.aa.qualite.indice} %`).join(' · ')}.
      Associer des aliments aux acides aminés limitants différents (céréales + légumineuses) améliore l'ensemble.</p>` : ''}
    ${estime ? '<p class="small muted">Certains profils sont estimés d\'après le groupe d\'aliments.</p>' : ''}</div>`;
}

// ---------- Profil ----------
// Dépense énergétique : métabolisme de base (Mifflin-St Jeor, 1990) × niveau d'activité physique (NAP, Anses 2016),
// +250 kcal au 2e trimestre de grossesse (EFSA).
const ACTIVITES = [[1.4, 'Sédentaire', 'travail assis, peu de marche, pas de sport'],
  [1.6, 'Peu actif', 'travail assis et 30 à 60 min de marche par jour, ou un peu de sport'],
  [1.8, 'Actif', 'travail debout ou physique, ou sport régulier plusieurs fois par semaine'],
  [2.0, 'Très actif', 'travail très physique ou entraînement sportif quotidien']];
const metabolismeBase = (p) => Math.round(10 * p.poids + 6.25 * p.taille - 5 * p.age + (p.sexe === 'H' ? 5 : -161));
const depenseTotale = (p) => Math.round((metabolismeBase(p) * p.activite + (p.grossesse ? 250 : 0)) / 10) * 10;

async function vueProfil() {
  document.title = 'Profil · Food';
  const p = { age: 40, taille: p0Taille(), activite: 1.6, ...META.profil, ...profil };
  function p0Taille() { return profil?.sexe === 'H' ? 175 : 163; }
  $app.innerHTML = `<h1>Profil</h1>
    <p class="muted">Sert à calculer les pourcentages des repères journaliers.</p>
    <div class="card">
      <div class="form-row"><b>Je suis</b>
        <label><input type="radio" name="sexe" value="F" ${p.sexe !== 'H' ? 'checked' : ''}> une femme</label>
        <label><input type="radio" name="sexe" value="H" ${p.sexe === 'H' ? 'checked' : ''}> un homme</label></div>
      <div class="form-row"><label><input type="checkbox" id="pg" ${p.grossesse ? 'checked' : ''}> Enceinte (repères du 2e trimestre)</label></div>
      <div class="form-row">
        <label>Âge <input type="number" id="pa" min="18" max="110" value="${p.age}"> ans</label>
        <label>Taille <input type="number" id="pt" min="120" max="220" value="${p.taille}"> cm</label>
        <label>Poids <input type="number" id="pp" min="25" max="250" value="${p.poids}"> kg</label></div>
      <div class="form-row"><label>Activité <select id="pact">${ACTIVITES.map(([v, l]) => `<option value="${v}" ${v === Number(p.activite) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="small muted" id="pact-desc"></span></div>
      <div class="form-row"><span id="calc"></span></div>
      <div class="form-row"><label>Énergie retenue <input type="number" id="pk" min="800" max="6000" step="10" value="${p.kcal}"> kcal/jour</label>
        <span class="small muted">calculée ci-dessus, modifiable</span></div>
      <div class="form-row"><b>Afficher les aliments</b>
        <label><input type="radio" name="affichage" value="portion" ${p.affichage !== '100g' ? 'checked' : ''}> par portion habituelle</label>
        <label><input type="radio" name="affichage" value="100g" ${p.affichage === '100g' ? 'checked' : ''}> pour 100 g</label></div>
      <div class="actions"><button class="btn" id="ok">Enregistrer</button></div>
    </div>
    <div class="card"><h3>Vos données restent sur votre appareil</h3>
      <p class="small">Le profil, les aliments consultés, le comparateur et les assiettes sont enregistrés uniquement dans ce navigateur
        (stockage local). Pas de compte, pas de cookie, pas de mesure d'audience, et le serveur ne tient pas de journal des visites :
        les recherches et le calcul des repères (sexe, poids, énergie, sans nom ni identifiant) sont traités à la volée, sans être conservés.
        Effacer les données du site dans le navigateur efface aussi tout cela.</p></div>
    <p class="note">Métabolisme de base : équation de Mifflin-St Jeor (1990) ; dépense totale = métabolisme de base × niveau d'activité
      physique (1,4 à 2,0, Anses 2016) ; +250 kcal en milieu de grossesse (EFSA). C'est une estimation à ± 10 % environ.
      Repères : Anses 2021 (vitamines et minéraux), EFSA, OMS (sel, sucres). Chiffres arrondis pour un adulte en bonne santé ;
      les besoins d'un enfant, d'une personne âgée ou malade sont différents.</p>`;
  const $ = (id) => document.getElementById(id);
  const lire = () => ({
    sexe: document.querySelector('[name=sexe]:checked').value,
    grossesse: $('pg').checked,
    age: Math.min(Math.max(Number($('pa').value) || 40, 18), 110),
    taille: Math.min(Math.max(Number($('pt').value) || 165, 120), 220),
    poids: Math.min(Math.max(Number($('pp').value) || 60, 25), 250),
    activite: Number($('pact').value),
  });
  const maj = (e) => {
    const x = lire();
    $('pact-desc').textContent = ACTIVITES.find(([v]) => v === x.activite)[2];
    $('calc').innerHTML = `Métabolisme de base <b>${fmt(metabolismeBase(x))} kcal</b> · dépense totale estimée <b>${fmt(depenseTotale(x))} kcal/jour</b>`;
    if (e) $('pk').value = depenseTotale(x);
  };
  maj();
  $app.querySelectorAll('[name=sexe], #pg, #pa, #pt, #pp, #pact').forEach((el) => el.addEventListener(el.type === 'number' ? 'input' : 'change', maj));
  $('ok').addEventListener('click', () => {
    profil = { ...lire(),
      kcal: Math.min(Math.max(Number($('pk').value) || 2000, 800), 6000),
      affichage: document.querySelector('[name=affichage]:checked').value,
    };
    if (profil.grossesse) profil.sexe = 'F';
    classementOpts.par = par100g() ? 'g' : 'portion';
    store.set('profil', profil);
    toast('Profil enregistré');
    history.back();
  });
}

// ---------- Recherche dans l'en-tête (toutes les pages sauf l'accueil) ----------
const $hq = document.getElementById('hq');
const $hres = document.getElementById('hres');
function fermerHsearch(vider) {
  $hres.hidden = true;
  if (vider) $hq.value = '';
}
let hT;
$hq.addEventListener('input', () => {
  clearTimeout(hT);
  hT = setTimeout(async () => {
    const q = $hq.value.trim();
    if (!q) { fermerHsearch(); return; }
    const l = await api(`recherche?q=${encodeURIComponent(q)}&limit=8`).catch(() => null);
    if ($hq.value.trim() !== q) return;
    $hres.innerHTML = !l ? '<p class="empty">Hors ligne : recherche indisponible.</p>'
      : l.length ? `<ul class="list">${l.map(ligneAliment).join('')}</ul><a class="tout" href="/" data-tout>Tous les résultats →</a>`
        : `<p class="empty">Aucun aliment pour « ${esc(q)} ».</p>`;
    $hres.hidden = false;
  }, 150);
});
$hres.addEventListener('click', (e) => {
  if (e.target.closest('[data-tout]')) rechercheQ = $hq.value.trim();
  if (e.target.closest('a')) setTimeout(() => fermerHsearch(true));
});
document.getElementById('hsearch').addEventListener('submit', () => {
  if (!$hq.value.trim()) return;
  rechercheQ = $hq.value.trim(); rechercheGrp = '';
  go('/');
});
$hq.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fermerHsearch(true); $hq.blur(); } });
$hq.addEventListener('focus', () => { if ($hq.value.trim() && $hres.innerHTML) $hres.hidden = false; });
document.addEventListener('click', (e) => { if (!e.target.closest('#hsearch')) fermerHsearch(); });

// ---------- Routeur ----------
let lastRoute = location.pathname;
// Navigation sans rechargement ; replace : remplace l'entrée de l'historique (ex. changement de quantité).
function go(url, replace) {
  if (url === location.pathname + location.search) { render(); return; }
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  naviguer();
}
function naviguer() {
  const route = location.pathname;
  render().then(() => { if (route !== lastRoute) scrollTo(0, 0); lastRoute = route; });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', naviguer);

async function render() {
  const params = new URLSearchParams(location.search);
  const parts = location.pathname.split('/').filter(Boolean);
  const tab = { nutriments: 'nutriments', nutriment: 'nutriments', comparer: 'comparer', assiette: 'assiette' }[parts[0]] || (parts[0] ? '' : 'recherche');
  document.body.classList.toggle('home', !parts[0]);
  fermerHsearch(true);
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  try {
    if (!META) {
      META = await api('meta');
      for (const n of META.nutriments) NUT[n.key] = n;
    }
    switch (parts[0]) {
      case undefined: document.title = 'Food : valeurs nutritionnelles des aliments (table Ciqual)'; await vueRecherche(); break;
      case 'aliment': await vueAliment(Number.parseInt(parts[1], 10), params); break;
      case 'nutriments': await vueNutriments(); break;
      case 'nutriment': await vueNutriment(parts[1]); break;
      case 'comparer': await vueComparer(); break;
      case 'assiette': await vueAssiette(); break;
      case 'profil': await vueProfil(); break;
      case 'meilleurs': await vueMeilleurs(parts[1]); break;
      case 'sources': await vueSources(); break;
      default: document.title = 'Page introuvable · Food'; throw new Error('Page introuvable');
    }
  } catch (e) {
    $app.innerHTML = `<p class="empty">${esc(navigator.onLine ? e.message : 'Hors ligne : cette page n\'a pas encore été consultée sur cet appareil.')}</p>
      <p class="center"><a class="btn light" href="/">Accueil</a></p>`;
  }
}

// Anciens liens en #/… (avant le passage aux vraies adresses).
const ancienLien = () => location.hash.startsWith('#/') && (history.replaceState(null, '', location.hash.slice(1)), true);
window.addEventListener('hashchange', () => { if (ancienLien()) naviguer(); });
ancienLien();
lastRoute = location.pathname;
badges();
render();
