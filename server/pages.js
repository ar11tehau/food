// Pages HTML rendues par le serveur pour les moteurs de recherche et les aperçus de liens : titre, description, URL canonique,
// Open Graph, données structurées (schema.org) et un premier contenu dans <main>, que l'interface remplace ensuite.
// Aussi robots.txt et sitemap.xml. SITE_URL (https://food.domelier.fr) : adresse publique.
const { norm } = require('./db');

const SITE = (process.env.SITE_URL || 'https://food.domelier.fr').replace(/\/$/, '');
const NOM_SITE = 'Food';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// « Pâté de foie, 100 % porc » → « pate-de-foie-100-porc » (même calcul dans public/app.js).
function slug(nom) {
  const s = norm(nom).replace(/%/g, ' ').trim().split(/\s+/).join('-');
  return s.length > 70 ? s.slice(0, 71).replace(/-[^-]*$/, '') : s;
}
const urlAliment = (a) => `/aliment/${a.code}-${slug(a.nom)}`;
const fmt = (n) => (n == null ? '–' : Number(n.toPrecision(3)).toLocaleString('fr-FR'));
const brutTxt = (v) => (v == null ? null : typeof v === 'number' ? fmt(v) : v === 'tr' ? 'traces' : `< ${fmt(Number(v.slice(1)))}`);
const couper = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

module.exports = function pages({ db, GROUPES, CATEGORIES, NUTRIMENTS, BY_KEY, FICHES, SOURCES, NB_ALIMENTS, source }) {
  const qAliment = db.prepare('SELECT code, nom, grp, ssgrp, sssgrp, brut, portion, score_lettre FROM aliments WHERE code = ?');
  const qSemblables = db.prepare('SELECT code, nom FROM aliments WHERE sssgrp = ? AND code <> ? ORDER BY score DESC LIMIT 40');
  const qTous = db.prepare('SELECT code, nom FROM aliments ORDER BY code');
  const GRP1 = Object.entries(GROUPES).filter(([c]) => c.length === 2).map(([code, nom]) => ({ code, nom }));
  const AVEC_FICHE = NUTRIMENTS.filter((n) => FICHES[n.key]?.resume);

  const liste = (items) => `<ul class="list">${items.map(([href, txt, sub]) => `<li><a href="${esc(href)}"><span class="grow"><span class="nom">${esc(txt)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span></a></li>`).join('')}</ul>`;
  const fil = (etapes) => ({ '@type': 'BreadcrumbList', itemListElement: etapes.map(([nom, url], i) => ({ '@type': 'ListItem', position: i + 1, name: nom, ...(url ? { item: SITE + url } : {}) })) });

  function aliment(code) {
    const a = qAliment.get(code);
    if (!a) return null;
    const v = JSON.parse(a.brut);
    const groupes = [a.grp, a.ssgrp, a.sssgrp].filter((c) => c && GROUPES[c]).map((c) => GROUPES[c]);
    const val = (k) => (v[k] == null ? null : `${brutTxt(v[k])} ${BY_KEY[k].unit}`);
    const resumeTxt = [['kcal', ''], ['prot', 'de protéines'], ['gluc', 'de glucides'], ['lip', 'de lipides'], ['fibres', 'de fibres']]
      .filter(([k]) => v[k] != null).map(([k, de]) => `${val(k)}${de ? ` ${de}` : ''}`).join(', ');
    const lignes = NUTRIMENTS.filter((n) => v[n.key] != null && !n.parent)
      .map((n) => `<tr><th scope="row"><a href="/nutriment/${n.key}">${esc(n.label)}</a></th><td>${esc(val(n.key))}</td></tr>`).join('');
    const semblables = a.sssgrp ? qSemblables.all(a.sssgrp, a.code) : [];
    const grp1 = GROUPES[a.grp] ? [[GROUPES[a.grp], `/meilleurs/${a.grp}`]] : [];
    return {
      canonique: urlAliment(a),
      titre: `${couper(a.nom, 55)} : valeurs nutritionnelles`,
      description: couper(`${a.nom} : ${resumeTxt} pour 100 g. Vitamines, minéraux et acides aminés (table Ciqual).`, 160),
      jsonld: [fil([['Accueil', '/'], ...grp1, [a.nom]])],
      contenu: `<p class="small muted">${groupes.map(esc).join(' › ')}</p>
        <h1>${esc(a.nom)}</h1>
        <p>Pour 100 g : ${esc(resumeTxt)}.${a.portion ? ` Portion habituelle : ${fmt(a.portion)} g.` : ''}${a.score_lettre ? ` Score de la portion : ${esc(a.score_lettre)}.` : ''}</p>
        <h2>Composition pour 100 g</h2>
        <div class="card"><table class="cmp"><tbody>${lignes}</tbody></table></div>
        ${semblables.length ? `<h2>Dans le même groupe</h2><div class="card">${liste(semblables.map((s) => [urlAliment(s), s.nom]))}</div>` : ''}
        <p class="note">Source : ${esc(source)}.</p>`,
    };
  }

  function nutriment(key) {
    const n = BY_KEY[key];
    if (!n) return null;
    const f = FICHES[key] || {};
    const col = `"${key}"`;
    const top = db.prepare(`SELECT code, nom, ${col} AS v FROM aliments WHERE ${col} > 0 AND portion_src IN ('a', 'v')
      AND grp NOT IN ('1004', '1005', '1006', '1007', '1008', '11') AND coalesce(ssgrp, '') NOT IN ('1004', '1005', '1006', '1007', '1008', '11')
      ORDER BY ${col} * portion DESC LIMIT 30`).all();
    const enfants = NUTRIMENTS.filter((c) => c.parent === key);
    const bloc = (cle, titre) => (f[cle] ? `<h2>${titre}</h2><p>${esc(f[cle])}</p>` : '');
    const parent = n.parent ? [[BY_KEY[n.parent].label, `/nutriment/${n.parent}`]] : [];
    return {
      canonique: `/nutriment/${key}`,
      titre: `${n.label} : rôle, besoins et aliments les plus riches`,
      description: couper(f.resume ? `${f.resume} Repères journaliers et aliments qui en apportent le plus.` : `${n.label} : aliments qui en apportent le plus par portion, pour 100 g et pour 100 kcal (table Ciqual de l'Anses).`, 160),
      jsonld: [fil([['Accueil', '/'], ['Nutriments', '/nutriments'], ...parent, [n.label]])],
      contenu: `<h1>${esc(n.label)}</h1>
        ${f.resume ? `<p>${esc(f.resume)}</p>` : ''}
        ${enfants.length ? `<div class="chips">${enfants.map((c) => `<a class="chip ghost" href="/nutriment/${c.key}">${esc(c.label)}</a>`).join('')}</div>` : ''}
        ${bloc('role', 'À quoi ça sert')}${bloc('manque', 'En cas de manque')}${bloc('exces', 'En cas d\'excès')}${bloc('conseils', 'Repères pratiques')}${bloc('grossesse', 'Grossesse')}
        ${top.length ? `<h2>Meilleures sources (par portion)</h2><div class="card">${liste(top.map((a) => [urlAliment(a), a.nom, `${fmt(a.v)} ${n.unit} pour 100 g`]))}</div>` : ''}`,
    };
  }

  function meilleurs(grp) {
    const g = grp ? GRP1.find((x) => x.code === grp) : null;
    if (grp && !g) return null;
    const l = db.prepare(`SELECT code, nom FROM aliments WHERE portion_src IN ('a', 'v')${g ? ' AND grp = ?' : ''} ORDER BY score DESC LIMIT 60`).all(...(g ? [g.code] : []));
    const titre = g ? `${g.nom} : les portions les plus intéressantes` : 'Les portions les plus intéressantes';
    return {
      canonique: g ? `/meilleurs/${g.code}` : '/meilleurs',
      titre,
      description: `${g ? `${g.nom} : aliments` : 'Aliments'} classés par l'intérêt nutritionnel de leur portion habituelle (étude INCA3, table Ciqual de l'Anses).`,
      jsonld: [fil([['Accueil', '/'], ['Meilleures portions', g ? '/meilleurs' : undefined], ...(g ? [[g.nom]] : [])])],
      contenu: `<h1>${esc(titre)}</h1><div class="chips">${GRP1.map((x) => `<a class="chip ghost" href="/meilleurs/${x.code}">${esc(x.nom)}</a>`).join('')}</div>
        <div class="card">${liste(l.map((a) => [urlAliment(a), a.nom]))}</div>`,
    };
  }

  const chipsNutriments = (cles) => `<div class="chips">${cles.map((k) => `<a class="chip" href="/nutriment/${k}">${esc(BY_KEY[k].label)}</a>`).join('')}</div>`;
  const STATIQUES = {
    '/': () => ({
      canonique: '/',
      titre: 'Food : valeurs nutritionnelles des aliments (table Ciqual)',
      titreBrut: true,
      description: `Calories, protéines, vitamines, minéraux et acides aminés de ${NB_ALIMENTS.toLocaleString('fr-FR')} aliments (table Ciqual de l'Anses), en % des repères journaliers. Fiches nutriments, comparateur et assiette.`,
      jsonld: [{ '@type': 'WebSite', name: NOM_SITE, url: `${SITE}/`, inLanguage: 'fr' }],
      contenu: `<h1>Valeurs nutritionnelles des aliments</h1>
        <p>Calories, protéines, vitamines, minéraux et acides aminés de ${NB_ALIMENTS.toLocaleString('fr-FR')} aliments, en % des repères journaliers.</p>
        <h2>Où trouver…</h2>${chipsNutriments(['prot', 'fibres', 'fer', 'calcium', 'magnesium', 'iode', 'vitd', 'vitc', 'b9', 'b12', 'dha', 'leu', 'lys', 'sel'].filter((k) => BY_KEY[k]))}
        <p><a href="/nutriments">Tous les nutriments</a> · <a href="/meilleurs">Les portions les plus intéressantes</a> · <a href="/sources">Sources et méthodes</a></p>
        <p class="note">${esc(source)}.</p>`,
    }),
    '/nutriments': () => ({
      canonique: '/nutriments',
      titre: 'Nutriments : vitamines, minéraux, acides gras et acides aminés',
      description: 'Rôle, besoins journaliers, manque, excès et meilleures sources alimentaires de chaque nutriment : vitamines, minéraux, oméga-3, fibres, acides aminés.',
      jsonld: [fil([['Accueil', '/'], ['Nutriments']])],
      contenu: `<h1>Nutriments</h1>${CATEGORIES.map(([cat, label]) => `<h2>${esc(label)}</h2>
        <div class="card">${liste(AVEC_FICHE.filter((n) => n.cat === cat).map((n) => [`/nutriment/${n.key}`, n.label, FICHES[n.key].resume]))}</div>`).join('')}`,
    }),
    '/meilleurs': () => meilleurs(null),
    '/sources': () => ({
      canonique: '/sources',
      titre: 'Sources et méthodes',
      description: 'Origine des données (Ciqual de l\'Anses, étude INCA3, USDA), repères journaliers, score de la portion et qualité des protéines : sources et méthodes de calcul.',
      jsonld: [fil([['Accueil', '/'], ['Sources et méthodes']])],
      contenu: `<h1>Sources et méthodes</h1>${Object.values(SOURCES).map((s) => `<h2>${esc(s.titre)}</h2><p>${esc(s.texte)}</p>
        <ul class="sources small">${s.liens.map(([t, u]) => `<li><a href="${esc(u)}" rel="noopener">${esc(t)}</a></li>`).join('')}</ul>`).join('')}`,
    }),
  };
  // Pages propres à l'appareil (contenu vide côté serveur) : accessibles mais pas indexées.
  const PRIVEES = { '/comparer': 'Comparer', '/assiette': 'Assiette', '/profil': 'Profil' };

  // → { status, canonique, titre, description, robots, jsonld, contenu } ou { redirection }
  function rendre(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    let p = null;
    if (STATIQUES[pathname]) p = STATIQUES[pathname]();
    else if (PRIVEES[pathname]) {
      p = { canonique: pathname, titre: PRIVEES[pathname], robots: 'noindex', description: 'Données gardées sur cet appareil.', contenu: `<h1>${PRIVEES[pathname]}</h1><p class="muted center">Chargement…</p>` };
    } else if (parts[0] === 'aliment' && parts.length === 2 && /^\d+(-|$)/.test(parts[1])) {
      p = aliment(Number.parseInt(parts[1], 10));
      if (p && p.canonique !== pathname) return { redirection: p.canonique };
    } else if (parts[0] === 'nutriment' && parts.length === 2) p = nutriment(parts[1]);
    else if (parts[0] === 'meilleurs' && parts.length === 2) p = meilleurs(parts[1]);
    if (!p) {
      return { status: 404, canonique: null, titre: 'Page introuvable', robots: 'noindex', description: '',
        contenu: '<h1>Page introuvable</h1><p><a class="btn light" href="/">Accueil</a></p>' };
    }
    return { status: 200, ...p };
  }

  // Remplit le gabarit public/index.html (marqueurs <!--head--> et <!--contenu-->).
  function html(gabarit, p) {
    const titre = p.titreBrut ? p.titre : `${p.titre} · ${NOM_SITE}`;
    const url = p.canonique ? SITE + p.canonique : null;
    const head = [
      `<title>${esc(titre)}</title>`,
      p.description && `<meta name="description" content="${esc(p.description)}">`,
      p.robots && `<meta name="robots" content="${p.robots}">`,
      url && !p.robots && `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${NOM_SITE}">`,
      `<meta property="og:locale" content="fr_FR">`,
      `<meta property="og:title" content="${esc(p.titre)}">`,
      p.description && `<meta property="og:description" content="${esc(p.description)}">`,
      url && `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${SITE}/icon-512.png">`,
      `<meta name="twitter:card" content="summary">`,
      p.jsonld?.length && `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': p.jsonld }).replace(/</g, '\\u003c')}</script>`,
    ].filter(Boolean).join('\n  ');
    return gabarit.replace('<!--head-->', head).replace('<!--contenu-->', p.contenu);
  }

  const robots = () => `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;

  function sitemap() {
    const urls = ['/', '/nutriments', '/meilleurs', '/sources', ...GRP1.map((g) => `/meilleurs/${g.code}`),
      ...AVEC_FICHE.map((n) => `/nutriment/${n.key}`), ...qTous.all().map(urlAliment)];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map((u) => `<url><loc>${esc(SITE + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  }

  return { rendre, html, robots, sitemap };
};
module.exports.slug = slug;
