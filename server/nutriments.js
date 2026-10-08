// Constituants Ciqual gardés par l'appli : clé, colonne du fichier xlsx (indice 0 = colonne A), libellé, unité, catégorie.
// « parent » rattache un détail (ex. fructose) à son nutriment principal.
//
// Repères journaliers (adultes) : H = homme, F = femme, G = grossesse (2e trimestre).
//   type 'rnp' : référence nutritionnelle pour la population (couvre les besoins de presque tout le monde)
//   type 'as'  : apport satisfaisant (besoin mal connu, apport observé chez des gens en bonne santé)
//   type 'max' : à ne pas dépasser (la jauge se lit « part de la limite »)
//   type 'cible' : objectif indicatif (énergie, part des calories)
// Une valeur peut être une fonction du profil (énergie, poids). « ul » = limite supérieure de sécurité (LSS).
// Sources principales : Anses 2021 (références nutritionnelles pour les vitamines et minéraux, actualisation des repères),
// EFSA (Dietary Reference Values), OMS (sel, sucres). Chiffres arrondis, à relire : ce n'est pas un avis médical.

const pctKcal = (pct, kcalParG) => (p) => Math.round((p.kcal * pct) / 100 / kcalParG);

const CATEGORIES = [
  ['macros', 'Essentiel'],
  ['glucides', 'Glucides en détail'],
  ['lipides', 'Lipides en détail'],
  ['mineraux', 'Minéraux et oligo-éléments'],
  ['vitamines', 'Vitamines'],
];

// [clé, colonne, libellé, unité, catégorie, options]
const LISTE = [
  ['kcal', 10, 'Énergie', 'kcal', 'macros', { ref: { type: 'cible', all: (p) => p.kcal } }],
  ['eau', 13, 'Eau', 'g', 'macros', { ref: { type: 'as', H: 2500, F: 2000, G: 2300 } }],
  ['prot', 14, 'Protéines', 'g', 'macros', { ref: { type: 'rnp', all: (p) => Math.round(0.83 * p.poids + (p.grossesse ? 9 : 0)) } }],
  ['gluc', 16, 'Glucides', 'g', 'macros', { ref: { type: 'cible', all: pctKcal(47, 4) } }],
  ['lip', 17, 'Lipides', 'g', 'macros', { ref: { type: 'cible', all: pctKcal(37, 9) } }],
  ['fibres', 26, 'Fibres', 'g', 'macros', { ref: { type: 'as', all: 30 } }],
  ['sel', 49, 'Sel', 'g', 'macros', { ref: { type: 'max', all: 5 } }],
  ['alcool', 29, 'Alcool', 'g', 'macros', { ref: { type: 'max', all: (p) => (p.grossesse ? 0 : 20) } }],

  ['sucres', 18, 'Sucres', 'g', 'glucides', { parent: 'gluc', ref: { type: 'max', all: 100 } }],
  ['amidon', 25, 'Amidon', 'g', 'glucides', { parent: 'gluc' }],
  ['saccharose', 24, 'Saccharose', 'g', 'glucides', { parent: 'sucres' }],
  ['glucose', 21, 'Glucose', 'g', 'glucides', { parent: 'sucres' }],
  ['fructose', 19, 'Fructose', 'g', 'glucides', { parent: 'sucres' }],
  ['lactose', 22, 'Lactose', 'g', 'glucides', { parent: 'sucres' }],
  ['galactose', 20, 'Galactose', 'g', 'glucides', { parent: 'sucres' }],
  ['maltose', 23, 'Maltose', 'g', 'glucides', { parent: 'sucres' }],
  ['polyols', 27, 'Polyols', 'g', 'glucides', { parent: 'gluc' }],
  ['acidesorg', 30, 'Acides organiques', 'g', 'glucides', {}],

  ['ags', 31, 'AG saturés', 'g', 'lipides', { parent: 'lip', ref: { type: 'max', all: pctKcal(12, 9) } }],
  ['agmi', 32, 'AG mono-insaturés', 'g', 'lipides', { parent: 'lip', ref: { type: 'cible', all: pctKcal(17, 9) } }],
  ['agpi', 33, 'AG polyinsaturés', 'g', 'lipides', { parent: 'lip' }],
  ['oleique', 42, 'Acide oléique (oméga-9)', 'g', 'lipides', { parent: 'agmi' }],
  ['linoleique', 43, 'Acide linoléique (oméga-6)', 'g', 'lipides', { parent: 'agpi', ref: { type: 'cible', all: pctKcal(4, 9) } }],
  ['ala', 44, 'Acide alpha-linolénique (oméga-3)', 'g', 'lipides', { parent: 'agpi', ref: { type: 'cible', all: (p) => Math.round(p.kcal * 0.01 / 9 * 10) / 10 } }],
  ['epa', 46, 'EPA (oméga-3)', 'g', 'lipides', { parent: 'agpi', ref: { type: 'cible', all: 0.25 } }],
  ['dha', 47, 'DHA (oméga-3)', 'g', 'lipides', { parent: 'agpi', ref: { type: 'cible', all: (p) => (p.grossesse ? 0.5 : 0.25) } }],
  ['arachidonique', 45, 'Acide arachidonique (oméga-6)', 'g', 'lipides', { parent: 'agpi' }],
  ['butyrique', 34, 'Acide butyrique (C4:0)', 'g', 'lipides', { parent: 'ags' }],
  ['caproique', 35, 'Acide caproïque (C6:0)', 'g', 'lipides', { parent: 'ags' }],
  ['caprylique', 36, 'Acide caprylique (C8:0)', 'g', 'lipides', { parent: 'ags' }],
  ['caprique', 37, 'Acide caprique (C10:0)', 'g', 'lipides', { parent: 'ags' }],
  ['laurique', 38, 'Acide laurique (C12:0)', 'g', 'lipides', { parent: 'ags' }],
  ['myristique', 39, 'Acide myristique (C14:0)', 'g', 'lipides', { parent: 'ags' }],
  ['palmitique', 40, 'Acide palmitique (C16:0)', 'g', 'lipides', { parent: 'ags' }],
  ['stearique', 41, 'Acide stéarique (C18:0)', 'g', 'lipides', { parent: 'ags' }],
  ['cholesterol', 48, 'Cholestérol', 'mg', 'lipides', {}],

  ['calcium', 50, 'Calcium', 'mg', 'mineraux', { ref: { type: 'rnp', all: 950, ul: 2500 } }],
  ['chlorure', 51, 'Chlorure', 'mg', 'mineraux', { ref: { type: 'as', all: 3100 } }],
  ['cuivre', 52, 'Cuivre', 'mg', 'mineraux', { ref: { type: 'as', H: 1.6, F: 1.3, G: 1.5, ul: 5 } }],
  ['fer', 53, 'Fer', 'mg', 'mineraux', { ref: { type: 'rnp', H: 11, F: 16, G: 16 } }],
  ['iode', 54, 'Iode', 'µg', 'mineraux', { ref: { type: 'as', H: 150, F: 150, G: 200, ul: 600 } }],
  ['magnesium', 55, 'Magnésium', 'mg', 'mineraux', { ref: { type: 'as', H: 420, F: 360, G: 360 } }],
  ['manganese', 56, 'Manganèse', 'mg', 'mineraux', { ref: { type: 'as', H: 2.8, F: 2.5, G: 2.5 } }],
  ['phosphore', 57, 'Phosphore', 'mg', 'mineraux', { ref: { type: 'as', all: 700 } }],
  ['potassium', 58, 'Potassium', 'mg', 'mineraux', { ref: { type: 'as', all: 3500 } }],
  ['selenium', 59, 'Sélénium', 'µg', 'mineraux', { ref: { type: 'as', all: 70, ul: 255 } }],
  ['sodium', 60, 'Sodium', 'mg', 'mineraux', { ref: { type: 'max', all: 2000 } }],
  ['zinc', 61, 'Zinc', 'mg', 'mineraux', { ref: { type: 'rnp', H: 11, F: 8, G: 9.1, ul: 25 } }],

  ['vita', 62, 'Vitamine A', 'µg', 'vitamines', { ref: { type: 'rnp', H: 750, F: 650, G: 700 } }],
  ['retinol', 63, 'Rétinol', 'µg', 'vitamines', { parent: 'vita', ref: { type: 'max', all: 3000 } }],
  ['betacarotene', 64, 'Bêta-carotène', 'µg', 'vitamines', { parent: 'vita' }],
  ['vitd', 65, 'Vitamine D', 'µg', 'vitamines', { ref: { type: 'as', all: 15, ul: 100 } }],
  ['vitd2', 66, 'Vitamine D2', 'µg', 'vitamines', { parent: 'vitd' }],
  ['vitd3', 67, 'Vitamine D3', 'µg', 'vitamines', { parent: 'vitd' }],
  ['vite', 69, 'Vitamine E', 'mg', 'vitamines', { ref: { type: 'as', H: 10.5, F: 9.9, G: 9.9, ul: 300 } }],
  ['alphatoco', 68, 'Alpha-tocophérol', 'mg', 'vitamines', { parent: 'vite' }],
  ['k1', 70, 'Vitamine K1', 'µg', 'vitamines', { ref: { type: 'as', all: 70 } }],
  ['k2', 71, 'Vitamine K2', 'µg', 'vitamines', { parent: 'k1' }],
  ['vitc', 72, 'Vitamine C', 'mg', 'vitamines', { ref: { type: 'rnp', H: 110, F: 110, G: 120 } }],
  ['b1', 73, 'Vitamine B1 (thiamine)', 'mg', 'vitamines', { ref: { type: 'as', H: 1.5, F: 1.2, G: 1.3 } }],
  ['b2', 74, 'Vitamine B2 (riboflavine)', 'mg', 'vitamines', { ref: { type: 'rnp', H: 1.6, F: 1.5, G: 1.9 } }],
  ['b3', 75, 'Vitamine B3 (niacine)', 'mg', 'vitamines', { ref: { type: 'rnp', H: 17, F: 14, G: 15 } }],
  ['b5', 76, 'Vitamine B5 (acide pantothénique)', 'mg', 'vitamines', { ref: { type: 'as', H: 5.8, F: 4.7, G: 5 } }],
  ['b6', 77, 'Vitamine B6', 'mg', 'vitamines', { ref: { type: 'rnp', H: 1.8, F: 1.5, G: 1.8, ul: 12 } }],
  ['b9', 78, 'Vitamine B9 (folates)', 'µg', 'vitamines', { ref: { type: 'rnp', H: 330, F: 330, G: 600 } }],
  ['acidefolique', 81, 'Acide folique (ajouté)', 'µg', 'vitamines', { parent: 'b9', ref: { type: 'max', all: 1000 } }],
  ['b12', 82, 'Vitamine B12', 'µg', 'vitamines', { ref: { type: 'as', H: 4, F: 4, G: 4.5 } }],
];

const NUTRIMENTS = LISTE.map(([key, col, label, unit, cat, o]) => ({ key, col, label, unit, cat, parent: o.parent || null, ref: o.ref || null }));
const BY_KEY = Object.fromEntries(NUTRIMENTS.map((n) => [n.key, n]));

const PROFIL_DEFAUT = { sexe: 'F', grossesse: false, poids: 60, kcal: 2000 };

// Repère d'un nutriment pour un profil : { type, valeur, ul } ou null.
function repere(n, profil) {
  if (!n.ref) return null;
  const p = { ...PROFIL_DEFAUT, ...profil };
  const k = p.grossesse ? 'G' : p.sexe === 'H' ? 'H' : 'F';
  const v = n.ref.all ?? n.ref[k];
  const valeur = typeof v === 'function' ? v(p) : v;
  return { type: n.ref.type, valeur, ul: n.ref.ul ?? null };
}

// Repères de tous les nutriments pour un profil (envoyés au navigateur, qui calcule les %).
function reperes(profil) {
  return Object.fromEntries(NUTRIMENTS.filter((n) => n.ref).map((n) => [n.key, repere(n, profil)]));
}

module.exports = { CATEGORIES, NUTRIMENTS, BY_KEY, PROFIL_DEFAUT, repere, reperes };
