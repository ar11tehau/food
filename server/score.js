// Score nutritionnel d'une portion et qualité des protéines.
//
// Score : inspiré de l'indice NRF (Nutrient Rich Foods, Drewnowski 2009-2010), appliqué à la portion habituelle.
// Ce n'est pas le Nutri-Score (calculé pour 100 g, il demande la part de fruits et légumes, absente de Ciqual).
// Principe : une portion qui apporte E % des calories du jour devrait apporter au moins E % de chaque nutriment.
//   + pour 16 nutriments à favoriser (protéines, fibres, oméga-3 ALA et DHA, vitamines A, C, D, E, B9, B12, calcium, fer,
//     iode, magnésium, potassium, zinc) : % du repère couvert par la portion (plafonné à 100) moins E, en moyenne ;
//   − pour 3 nutriments à limiter (AG saturés, sucres libres estimés, sodium) : % de la limite journalière au-delà de E,
//     en moyenne.
// Points = (bonus − malus), en points de % ; la taille de la portion amplifie dans les deux sens (une grande portion
// d'un aliment dense rapporte plus, une grande portion d'un aliment pauvre coûte plus).
// Repères : profil par défaut (femme adulte, 2 000 kcal), pour que le score ne dépende pas de l'appareil.
// Une valeur non mesurée dans Ciqual compte pour zéro.
// Qualité des protéines : indice chimique (FAO/OMS 2013, profil de référence de l'adulte, mg par g de protéines) =
// rapport le plus bas entre l'acide aminé indispensable de l'aliment et la référence (l'acide aminé « limitant »), plafonné à 100.
const { BY_KEY, PROFIL_DEFAUT, repere } = require('./nutriments');

const POSITIFS = ['prot', 'fibres', 'ala', 'dha', 'vita', 'vitc', 'vitd', 'vite', 'b9', 'b12', 'calcium', 'fer', 'iode', 'magnesium', 'potassium', 'zinc'];
const SUCRES_LIBRES_MAX = 50; // g par jour : 10 % de 2 000 kcal (OMS)
const NEGATIFS = ['ags', 'sucreslibres', 'sodium'];

const REF = Object.fromEntries([...POSITIFS, 'ags', 'sodium', 'kcal'].map((k) => [k, repere(BY_KEY[k], PROFIL_DEFAUT).valeur]));
REF.sucreslibres = SUCRES_LIBRES_MAX;

// Sous-groupes dont les sucres ne sont pas des sucres libres : fruits et légumes entiers, légumineuses, fruits à coque.
const SANS_SUCRES_LIBRES = /^(0201|0202|0203|020401|020404|0205)/;

// Sucres libres estimés (Ciqual ne distingue pas les sucres ajoutés) : sucres moins lactose et galactose ;
// zéro pour les fruits et légumes entiers.
function sucresLibres(v, sssgrp) {
  if (v.sucres == null) return null;
  if (SANS_SUCRES_LIBRES.test(sssgrp || '')) return 0;
  return Math.max(0, v.sucres - (v.lactose || 0) - (v.galactose || 0));
}

// Lettre à partir des points de la portion : seuils choisis sur la distribution des ~750 aliments les plus consommés (INCA3).
const SEUILS = [['A', 0.5], ['B', -2.5], ['C', -7], ['D', -12]]; // quintiles : A = les 20 % meilleurs
const lettre = (pts) => (SEUILS.find(([, s]) => pts >= s) || ['E'])[0];

// v : valeurs numériques pour 100 g ; g : portion en grammes.
function scorePortion(v, g, sssgrp) {
  const k = g / 100;
  const e = ((v.kcal || 0) * k * 100) / REF.kcal; // part des besoins en énergie apportée par la portion
  const detail = [];
  let plus = 0;
  for (const key of POSITIFS) {
    const p = Math.min(100, ((v[key] || 0) * k * 100) / REF[key]);
    plus += p - e;
    detail.push([key, Math.round(p)]);
  }
  let moins = 0;
  const vals = { ags: v.ags, sodium: v.sodium, sucreslibres: sucresLibres(v, sssgrp) };
  for (const key of NEGATIFS) {
    const p = ((vals[key] || 0) * k * 100) / REF[key];
    moins += Math.max(0, p - e);
    detail.push([key, -Math.round(p)]);
  }
  const points = Math.round((plus / POSITIFS.length - moins / NEGATIFS.length) * 10) / 10;
  return { points, lettre: lettre(points), energie: Math.round(e * 10) / 10, detail, sucresLibres: vals.sucreslibres };
}

// Profil de référence FAO/OMS 2013 (adultes), mg par g de protéines. Groupes : soufrés = met + cys, aromatiques = phe + tyr.
const REFERENCE_AA = { his: 16, ile: 30, leu: 61, lys: 48, soufres: 23, aromatiques: 41, thr: 25, trp: 6.6, val: 40 };
const LABEL_AA = { soufres: 'méthionine + cystéine', aromatiques: 'phénylalanine + tyrosine' };

// aa : mg pour 100 g ; prot : g pour 100 g.
function indiceChimique(aa, prot) {
  if (!prot || prot < 0.5 || aa.lys == null) return null;
  const g = (k) => (aa[k] || 0) / prot;
  const parG = { his: g('his'), ile: g('ile'), leu: g('leu'), lys: g('lys'), soufres: g('met') + g('cys'),
    aromatiques: g('phe') + g('tyr'), thr: g('thr'), trp: g('trp'), val: g('val') };
  const ratios = Object.entries(REFERENCE_AA).map(([k, ref]) => [k, parG[k] / ref]);
  ratios.sort((a, b) => a[1] - b[1]);
  const [limitant, r] = ratios[0];
  return { indice: Math.min(100, Math.round(r * 100)), limitant: r < 1 ? limitant : null,
    limitantLabel: r < 1 ? (LABEL_AA[limitant] || BY_KEY[limitant].label.toLowerCase()) : null,
    ratios: Object.fromEntries(ratios.map(([k, x]) => [k, Math.round(x * 100)])) };
}

module.exports = { scorePortion, indiceChimique, sucresLibres, POSITIFS, NEGATIFS, REF, SEUILS, REFERENCE_AA, LABEL_AA };
