// Équivalent en nombre pour les aliments qui se comptent (œufs, fruits, pots, tranches, viennoiseries).
// Poids moyen d'une unité, partie mangée (sans coquille, peau, noyau) : ordres de grandeur courants
// (calibres de commerce, poids d'emballage usuels). Première règle qui correspond au nom normalisé (sans accents).
// [motif, grammes, singulier, pluriel]
const REGLES = [
  [/^oeuf jaune (?!.*poudre)/, 18, "jaune d'œuf", "jaunes d'œufs"],
  [/^oeuf blanc (?!.*poudre)/, 33, "blanc d'œuf", "blancs d'œufs"],
  [/^oeuf de caille/, 10, 'œuf de caille', 'œufs de caille'],
  [/^oeuf de cane/, 70, 'œuf de cane', 'œufs de cane'],
  [/^oeuf d oie/, 140, "œuf d'oie", "œufs d'oie"],
  [/^oeuf de dinde/, 80, 'œuf de dinde', 'œufs de dinde'],
  [/^oeuf (cru|dur|poche|a la coque|au plat|brouille)/, 50, 'œuf', 'œufs'],
  // Omelette : un œuf moyen donne environ 55 g d'omelette (avec un peu de lait ou de matière grasse).
  [/^omelette (?!norvegienne)|^tortilla espagnole/, 55, 'œuf', 'œufs'],

  [/^pomme (?!de terre)(?!.*(sec|seche|sirop|compote|jus|puree|cuite|au four))/, 150, 'pomme', 'pommes'],
  [/^poire (?!.*(sec|seche|sirop|jus|cuite|helene))/, 150, 'poire', 'poires'],
  [/^banane (?!plantain)(?!.*(sec|seche|cuite|prelevee))/, 120, 'banane', 'bananes'],
  [/^orange (?!.*(jus|confite|zeste))/, 150, 'orange', 'oranges'],
  [/^(clementine|mandarine)/, 60, 'clémentine', 'clémentines'],
  [/^kiwi (?!.*sec)/, 75, 'kiwi', 'kiwis'],
  [/^peche (?!.*(sec|seche|sirop|melba))/, 130, 'pêche', 'pêches'],
  [/^nectarine/, 130, 'nectarine', 'nectarines'],
  [/^abricot (denoyaute cru|chair et peau sans noyau cru)/, 40, 'abricot', 'abricots'],
  [/^abricot denoyaute sec/, 8, 'abricot sec', 'abricots secs'],
  [/^prune (sans noyau|violette)/, 35, 'prune', 'prunes'],
  [/^prune (mirabelle)/, 12, 'mirabelle', 'mirabelles'],
  [/^prune reine claude/, 25, 'reine-claude', 'reines-claudes'],
  [/^pruneau sans noyau sec/, 8, 'pruneau', 'pruneaux'],
  [/^figue crue/, 50, 'figue', 'figues'],
  [/^figue seche/, 20, 'figue sèche', 'figues sèches'],
  [/^datte (?!du desert).*seche/, 8, 'datte', 'dattes'],
  [/^avocat .*cru/, 140, 'avocat', 'avocats'],

  [/^(yaourt|yaourt ou lait fermente)/, 125, 'pot', 'pots'],
  [/^fromage frais type petit suisse/, 60, 'petit-suisse', 'petits-suisses'],
  [/^fromage blanc fondu en portion/, 20, 'portion', 'portions'],

  [/^croissant aux amandes/, 90, 'croissant', 'croissants'],
  [/^croissant/, 55, 'croissant', 'croissants'],
  [/^pain au chocolat/, 65, 'pain au chocolat', 'pains au chocolat'],
  [/^pain aux raisins/, 90, 'pain aux raisins', 'pains aux raisins'],
  [/^chausson aux pommes/, 100, 'chausson', 'chaussons'],
  [/^pain de mie/, 25, 'tranche', 'tranches'],
  [/^biscotte/, 9, 'biscotte', 'biscottes'],

  [/^jambon cuit/, 45, 'tranche', 'tranches'],
  [/^saucisse de strasbourg/, 35, 'saucisse', 'saucisses'],
  [/^chipolata/, 50, 'chipolata', 'chipolatas'],
  [/^merguez/, 50, 'merguez', 'merguez'],
  [/^boeuf steak hache .*cru/, 100, 'steak haché', 'steaks hachés'],
  [/^boeuf steak hache/, 75, 'steak haché', 'steaks hachés'],
  [/^chocolat (noir|au lait|blanc) .*tablette/, 5, 'carré', 'carrés'],
];

function unite(nomNorm) {
  const r = REGLES.find(([re]) => re.test(nomNorm || ''));
  return r ? { g: r[1], nom: r[2], pluriel: r[3] } : null;
}

module.exports = { unite, REGLES };
