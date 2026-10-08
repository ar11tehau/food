// Assimilation (biodisponibilité) : ce qui aide et ce qui freine l'absorption ou l'utilisation d'un nutriment,
// et références des fiches. Vulgarisation à relire, d'après les rapports Anses et EFSA cités.

const R = {
  ciqual: ['Anses, table Ciqual 2025', 'https://ciqual.anses.fr'],
  anses2021: ['Anses (2021), Les références nutritionnelles en vitamines et minéraux', 'https://www.anses.fr/fr/system/files/NUT2018SA0238Ra.pdf'],
  anses2016: ['Anses (2016), Actualisation des repères du PNNS : références nutritionnelles (protéines, glucides, lipides, fibres)', 'https://www.anses.fr/fr/system/files/NUT2012SA0103Ra-1.pdf'],
  anses2011: ['Anses (2011), Actualisation des apports nutritionnels conseillés pour les acides gras', 'https://www.anses.fr/fr/system/files/NUT2006sa0359Ra.pdf'],
  efsa: ['EFSA, Dietary Reference Values (DRV Finder)', 'https://multimedia.efsa.europa.eu/drvs/index.htm'],
  efsaUL: ['EFSA, valeurs de référence et limites supérieures de sécurité', 'https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values'],
  omsSel: ['OMS, Réduction de la consommation de sel', 'https://www.who.int/fr/news-room/fact-sheets/detail/salt-reduction'],
  omsSucres: ['OMS (2015), Guideline: sugars intake for adults and children', 'https://www.who.int/publications/i/item/9789241549028'],
  oms2007: ['OMS/FAO/UNU (2007), Protein and amino acid requirements in human nutrition', 'https://iris.who.int/handle/10665/43411'],
  fao2013: ['FAO (2013), Dietary protein quality evaluation in human nutrition', 'https://openknowledge.fao.org/handle/20.500.14283/i3124e'],
  usda: ['USDA, FoodData Central (SR Legacy)', 'https://fdc.nal.usda.gov'],
  spf: ['Santé publique France, repères de consommation d\'alcool', 'https://www.santepubliquefrance.fr/determinants-de-sante/alcool'],
  pnns: ['Manger Bouger (PNNS)', 'https://www.mangerbouger.fr'],
};

const ASSIMILATION = {
  prot: {
    aide: "Une cuisson modérée (elle rend les protéines plus digestes), la variété des sources au cours de la journée, l'association céréales + légumineuses qui compense leurs acides aminés limitants. Les protéines animales sont digérées à 90-95 %, celles du soja à environ 90 %.",
    freine: "Les fibres et antinutriments des légumineuses et céréales complètes crues ou mal cuites (inhibiteurs de protéases, tanins) : digestibilité de 75 à 85 %. Trempage, cuisson, germination et fermentation les réduisent. Les cuissons très fortes (grillades carbonisées) abîment certains acides aminés comme la lysine.",
  },
  gluc: {
    aide: "Pour une énergie durable : céréales complètes, légumineuses, cuisson al dente, association avec des fibres, des protéines ou des graisses dans le même repas (la glycémie monte moins vite).",
    freine: "Rien de gênant : on cherche plutôt à ralentir leur absorption. Les produits raffinés, très cuits ou en purée passent vite dans le sang.",
  },
  sucres: { freine: "Les fibres et le fait de manger le fruit entier plutôt qu'en jus ralentissent l'arrivée des sucres dans le sang." },
  amidon: { aide: "Refroidir pâtes, riz ou pommes de terre après cuisson forme de l'amidon résistant, qui se comporte comme une fibre et élève moins la glycémie." },
  lactose: { aide: "Le consommer en petites quantités au cours d'un repas, préférer yaourts et fromages affinés (les ferments et l'affinage le dégradent)." },
  fibres: {
    aide: "Boire suffisamment et augmenter les quantités progressivement : le microbiote s'adapte en quelques semaines.",
    freine: "Pas d'absorption à proprement parler : les fibres sont fermentées par le microbiote. Les antibiotiques réduisent temporairement cette fermentation.",
  },
  lip: { aide: "Les graisses sont nécessaires pour absorber les vitamines A, D, E, K et les caroténoïdes : un filet d'huile sur les légumes suffit." },
  ala: {
    aide: "Le corps transforme un peu d'ALA en EPA et DHA ; la conversion est meilleure quand on mange moins d'oméga-6 (huile de tournesol, de maïs) et chez la femme.",
    freine: "Un excès d'oméga-6 (même enzymes), l'alcool, le tabac. Les huiles riches en oméga-3 s'oxydent vite : à garder au frais, à l'abri de la lumière, et à ne pas chauffer fortement. Les graines de lin doivent être broyées pour être digérées.",
  },
  epa: { aide: "Mangés avec un repas contenant des graisses, ils sont mieux absorbés ; les poissons gras entiers en apportent sous une forme bien assimilée.", freine: "Une friture à haute température dégrade une partie des oméga-3." },
  dha: { aide: "Mêmes conditions que l'EPA : poissons gras dans un repas complet, cuissons douces (vapeur, four, papillote).", freine: "Fritures et cuissons très longues à forte chaleur." },
  calcium: {
    aide: "La vitamine D (indispensable), le lactose et les protéines du lait, une prise répartie dans la journée (au-delà de 500 mg d'un coup, l'absorption baisse). Le calcium des choux, du brocoli et des eaux minérales est aussi bien absorbé que celui du lait.",
    freine: "L'acide oxalique (épinards, oseille, rhubarbe, blettes : leur calcium est très peu absorbé), l'acide phytique du son et des légumineuses crues, l'excès de sel et de caféine (pertes dans les urines), l'alcool.",
  },
  fer: {
    aide: "Le fer héminique (viandes, poissons, boudin noir) est absorbé 3 à 5 fois mieux que le fer végétal. Pour le fer végétal : vitamine C dans le même repas (agrumes, poivron, persil, kiwi), un peu de viande ou de poisson (« facteur viande »), trempage, germination et fermentation (pain au levain).",
    freine: "Thé, café, vin rouge et cacao (tanins et polyphénols) pendant ou juste après le repas : jusqu'à 60 % d'absorption en moins ; les phytates (son, céréales complètes non fermentées, légumineuses) ; le calcium pris en même temps (laitages, compléments) ; les médicaments anti-acides.",
  },
  iode: {
    aide: "Le sel iodé (à utiliser à la place du sel ordinaire, sans en ajouter plus), les produits de la mer. Le sélénium, le fer et la vitamine A participent au fonctionnement de la thyroïde.",
    freine: "Les substances goitrogènes des choux, du manioc, du soja et du millet, surtout crus et en grande quantité (la cuisson les réduit fortement) ; le tabac (thiocyanates) ; un manque de sélénium ou de fer.",
  },
  magnesium: {
    aide: "Les protéines, les glucides fermentescibles (fibres solubles, lactose) ; une prise répartie dans la journée. L'absorption augmente quand les apports sont faibles.",
    freine: "Le raffinage des céréales (le pain blanc a perdu l'essentiel du magnésium), les phytates en excès, l'alcool, certains diurétiques et anti-acides (IPP au long cours), le stress et le café qui augmentent les pertes urinaires.",
  },
  zinc: {
    aide: "Les protéines animales dans le même repas ; trempage, germination et fermentation (levain) qui dégradent les phytates.",
    freine: "Les phytates des céréales complètes et légumineuses : c'est pourquoi l'Anses fixe un repère plus élevé quand on en mange beaucoup. Le fer et le calcium en compléments à forte dose, l'alcool.",
  },
  potassium: { aide: "Bien absorbé (environ 90 %) quelle que soit la source.", freine: "La cuisson à grande eau en fait perdre une partie dans l'eau de cuisson (pommes de terre, légumes) : préférer la vapeur ou réutiliser l'eau en soupe. Les diurétiques et les vomissements augmentent les pertes." },
  sodium: { freine: "Absorbé presque totalement : c'est la quantité mangée qui compte. Le potassium des fruits et légumes aide les reins à éliminer le surplus." },
  sel: { freine: "Absorbé presque totalement : la seule solution est d'en manger moins (pain, charcuterie, fromages, plats préparés, sauces)." },
  selenium: { aide: "Le sélénium des aliments (poissons, œufs, noix du Brésil) est bien absorbé, surtout sous forme organique.", freine: "Peu de facteurs gênants connus ; la teneur des végétaux dépend beaucoup du sol où ils ont poussé." },
  cuivre: { freine: "Le zinc à forte dose (compléments), le fer en excès et la vitamine C à très forte dose." },
  phosphore: { aide: "Le phosphore des additifs (phosphates) est absorbé presque totalement, celui des végétaux beaucoup moins.", freine: "Les phytates des végétaux (le phosphore y est stocké sous cette forme), les anti-acides à base d'aluminium." },
  manganese: { freine: "Le fer, le calcium et les phytates en grande quantité." },
  vita: {
    aide: "Un peu de matière grasse dans le même repas (vitamine liposoluble). Le rétinol des produits animaux est très bien absorbé ; pour le bêta-carotène, voir sa fiche.",
    freine: "Un repas sans graisse, l'alcool, un manque de zinc (nécessaire à son transport), les maladies qui gênent l'absorption des graisses.",
  },
  betacarotene: {
    aide: "La cuisson et le broyage (carottes cuites, purée, soupe, sauce tomate) libèrent les caroténoïdes des cellules végétales : 3 à 6 fois mieux absorbés que crus. Ajouter un filet d'huile.",
    freine: "Un repas sans aucune graisse, les fibres en très grande quantité.",
  },
  vitd: {
    aide: "La peau en fabrique sous les UVB (printemps-été, en milieu de journée, bras et visage découverts 15 à 20 minutes). Dans l'assiette, elle est mieux absorbée avec un peu de graisses.",
    freine: "Le manque de soleil (hiver, travail en intérieur, latitude), la peau mate ou noire, l'âge, la crème solaire, le surpoids (la vitamine D est stockée dans les graisses) et les maladies du foie ou des reins qui l'activent.",
  },
  vite: { aide: "Un repas contenant des graisses ; la vitamine C qui la régénère.", freine: "L'oxydation des huiles (chaleur, lumière, huiles réutilisées), les régimes très pauvres en graisses." },
  k1: { aide: "Un peu de matière grasse : la vitamine K des légumes verts crus est mal absorbée sans huile.", freine: "Les antibiotiques au long cours (moins de K2 fabriquée par le microbiote), les antivitamines K (traitement anticoagulant)." },
  vitc: {
    aide: "Fruits et légumes frais, crus ou cuits peu de temps à la vapeur ; une prise répartie dans la journée (au-delà de 200 mg d'un coup, l'absorption baisse).",
    freine: "La chaleur, l'air, la lumière et l'eau de cuisson : un légume bouilli perd la moitié de sa vitamine C. Le tabac augmente les besoins (environ +20 mg par jour selon l'EFSA).",
  },
  b1: { freine: "L'alcool (principale cause de carence), le thé et le café en grande quantité, les sulfites, la cuisson longue à l'eau." },
  b2: { freine: "La lumière (le lait en bouteille transparente en perd), l'alcool." },
  b3: { aide: "Le corps en fabrique à partir du tryptophane des protéines (60 mg de tryptophane donnent 1 mg de niacine).", freine: "Dans le maïs, elle est liée et peu disponible, sauf après nixtamalisation (cuisson à la chaux, comme pour les tortillas)." },
  b5: { freine: "Les cuissons longues et les aliments très raffinés." },
  b6: { freine: "L'alcool, certains médicaments (isoniazide, pilule contraceptive), la cuisson longue." },
  b9: {
    aide: "Légumes verts crus ou cuits brièvement à la vapeur. L'acide folique des compléments est mieux absorbé (environ 85 %) que les folates des aliments (environ 50 %), d'où l'unité « équivalents folates alimentaires ».",
    freine: "La chaleur et l'eau de cuisson (jusqu'à 50-70 % de pertes), la lumière, l'alcool, le tabac et certains médicaments (méthotrexate, antiépileptiques).",
  },
  b12: {
    aide: "Elle a besoin du « facteur intrinsèque » sécrété par l'estomac. Fractionner les apports : l'absorption active sature vers 1,5 à 2 µg par prise.",
    freine: "Le vieillissement de l'estomac (gastrite atrophique), les anti-acides (IPP) et la metformine au long cours, la chirurgie de l'obésité, l'alcool. Les sources végétales (spiruline, algues) contiennent des analogues inactifs.",
  },
  alcool: { freine: "L'alcool lui-même freine l'absorption et augmente les pertes de nombreux nutriments : vitamines B1, B9, B6, A, zinc, magnésium." },
};

// Acides aminés : besoins, rôles, manque, excès. Les sources sont calculées.
const AA_FICHES = {
  his: { resume: "Acide aminé indispensable. Précurseur de l'histamine (immunité, digestion) et de la carnosine des muscles.", role: "Croissance et réparation des tissus, fabrication de l'hémoglobine, protection des nerfs (gaine de myéline), régulation de l'acidité.", manque: "Rare chez l'adulte ; possible anémie et lésions de la peau en cas de carence prolongée." },
  ile: { resume: "Acide aminé indispensable à chaîne ramifiée (BCAA), abondant dans les muscles.", role: "Construction musculaire, production d'énergie pendant l'effort, régulation de la glycémie, formation de l'hémoglobine.", manque: "Rare : fatigue, perte musculaire." },
  leu: { resume: "Acide aminé indispensable à chaîne ramifiée (BCAA) : c'est lui qui « déclenche » la fabrication des muscles après un repas.", role: "Il active la synthèse des protéines musculaires (voie mTOR) ; utile en particulier après l'effort et chez la personne âgée (2,5 à 3 g de leucine par repas sont souvent cités).", manque: "Fonte musculaire plus rapide chez la personne âgée qui mange peu de protéines.", exces: "Pas de problème avec l'alimentation ; les compléments à très forte dose peuvent déséquilibrer les autres acides aminés." },
  lys: { resume: "Acide aminé indispensable, le plus souvent « limitant » des céréales (blé, riz, maïs).", role: "Fabrication du collagène (peau, os, tendons), absorption du calcium, production de carnitine (transport des graisses vers les cellules), immunité.", manque: "Concerne surtout les alimentations très riches en céréales et pauvres en légumineuses et produits animaux : fatigue, croissance ralentie chez l'enfant.", conseils: "Les légumineuses en sont riches : associées aux céréales (semoule + pois chiches, riz + lentilles), elles comblent ce manque." },
  met: { resume: "Acide aminé indispensable soufré, souvent « limitant » des légumineuses. Le corps en tire la cystéine.", role: "Démarrage de la fabrication de toutes les protéines, apport de soufre (cystéine, glutathion antioxydant, taurine), réactions de méthylation (avec les vitamines B9 et B12).", manque: "Concerne les alimentations à base de légumineuses sans céréales ni produits animaux.", exces: "Un excès, surtout avec peu de vitamines B9, B6 et B12, fait monter l'homocystéine (facteur de risque cardiovasculaire).", conseils: "Les céréales et les oléagineux en contiennent davantage que les légumineuses : l'association des deux équilibre l'apport." },
  cys: { resume: "Acide aminé soufré « conditionnellement indispensable » : le corps la fabrique à partir de la méthionine. Le repère porte sur l'ensemble des deux.", role: "Constituant du glutathion (principal antioxydant des cellules), de la kératine des cheveux et des ongles." },
  phe: { resume: "Acide aminé indispensable aromatique ; le corps en tire la tyrosine. Le repère OMS porte sur la phénylalanine et la tyrosine ensemble.", role: "Fabrication de la tyrosine, donc de la dopamine, de l'adrénaline, des hormones thyroïdiennes et de la mélanine.", exces: "Dangereux uniquement en cas de phénylcétonurie (maladie génétique dépistée à la naissance) : l'édulcorant aspartame en contient." },
  tyr: { resume: "Acide aminé fabriqué à partir de la phénylalanine. Précurseur de la dopamine, de l'adrénaline, des hormones thyroïdiennes et de la mélanine." },
  thr: { resume: "Acide aminé indispensable, constituant du collagène, de l'élastine et du mucus protecteur de l'intestin.", role: "Santé de la peau et des muqueuses intestinales, immunité, fonctionnement du foie.", manque: "Peut devenir limitant dans certaines céréales (riz, maïs)." },
  trp: { resume: "Acide aminé indispensable le moins abondant dans les aliments. Précurseur de la sérotonine, de la mélatonine et de la vitamine B3.", role: "Humeur et appétit (sérotonine), sommeil (mélatonine), fabrication de niacine (60 mg de tryptophane = 1 mg de vitamine B3).", manque: "Rare avec une alimentation variée ; il est limitant dans le maïs et la gélatine (qui n'en contient pas).", exces: "Les compléments à forte dose, surtout avec des antidépresseurs, exposent à un syndrome sérotoninergique." },
  val: { resume: "Acide aminé indispensable à chaîne ramifiée (BCAA).", role: "Croissance et réparation musculaire, production d'énergie pendant l'effort, équilibre de l'azote." },
  arg: { resume: "Acide aminé « conditionnellement indispensable » (le corps en fabrique, mais pas toujours assez en cas de croissance, de blessure ou de maladie). Précurseur du monoxyde d'azote qui dilate les vaisseaux.", role: "Circulation sanguine, cicatrisation, immunité, élimination de l'ammoniac (cycle de l'urée)." },
  gly: { resume: "Le plus petit acide aminé, fabriqué par le corps ; un tiers du collagène. Abondant dans la gélatine, les bouillons d'os et la peau.", role: "Collagène, glutathion, neurotransmetteur inhibiteur dans la moelle épinière." },
  pro: { resume: "Acide aminé fabriqué par le corps, très présent dans le collagène (avec la glycine) et dans les protéines du lait et des céréales (gluten).", role: "Structure du collagène de la peau, des tendons et des cartilages ; cicatrisation." },
  glu: { resume: "Le plus abondant des acides aminés des aliments (la mesure inclut la glutamine). Fabriqué par le corps ; donne le goût « umami ».", role: "Carburant des cellules de l'intestin et du système immunitaire (glutamine), neurotransmetteur excitateur, transport de l'azote." },
  asp: { resume: "Acide aminé fabriqué par le corps (la mesure inclut l'asparagine), abondant dans les légumineuses et l'asperge.", role: "Production d'énergie, élimination de l'ammoniac, fabrication d'autres acides aminés et de l'ADN." },
  alanine: { resume: "Acide aminé fabriqué par le corps, très présent dans les muscles.", role: "Transport de l'azote des muscles vers le foie et fabrication de glucose pendant le jeûne ou l'effort." },
  ser: { resume: "Acide aminé fabriqué par le corps.", role: "Fabrication des membranes des neurones, de la glycine et de la cystéine, et de certains neurotransmetteurs." },
};
const ESSENTIEL_TXT = "Les besoins des adultes sont exprimés par l'OMS en mg par kg de poids et par jour ; le repère de l'appli est calculé avec le poids du profil. Avec 0,8 g de protéines par kg venant de sources variées, ils sont couverts sans y penser.";
for (const k of ['his', 'ile', 'leu', 'lys', 'met', 'phe', 'thr', 'trp', 'val']) AA_FICHES[k].conseils ||= ESSENTIEL_TXT;

// Références de chaque fiche (en plus de Ciqual pour les classements).
const REFS_PAR_CAT = {
  macros: [R.anses2016, R.efsa],
  glucides: [R.anses2016, R.omsSucres],
  lipides: [R.anses2011, R.efsa],
  mineraux: [R.anses2021, R.efsa, R.efsaUL],
  vitamines: [R.anses2021, R.efsa, R.efsaUL],
  acidesamines: [R.oms2007, R.fao2013, R.usda],
};
const REFS_PAR_CLE = { sel: [R.omsSel, R.anses2016], sodium: [R.omsSel, R.efsa], sucres: [R.anses2016, R.omsSucres], alcool: [R.spf], kcal: [R.anses2016, R.efsa, R.pnns] };

module.exports = { R, ASSIMILATION, AA_FICHES, REFS_PAR_CAT, REFS_PAR_CLE };
