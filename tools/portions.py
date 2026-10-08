#!/usr/bin/env python3
"""Portions habituelles des adultes en France, d'après l'étude INCA3 de l'Anses (2014-2015, données ouvertes data.gouv.fr).

    python3 tools/portions.py   →  data/portions.json

Entrées (en local, hors dépôt) : source/inca3-conso-compo.csv (chaque aliment consommé, quantité en g et composition
pour 100 g) et source/inca3-description-indiv.csv (ech = 1 : adultes). INCA3 n'utilise pas les codes Ciqual : chaque
aliment INCA3 est rapproché de l'aliment Ciqual le plus proche par sa composition (issue de Ciqual) et par son nom.
Pour chaque aliment Ciqual : médiane des quantités consommées par prise des aliments INCA3 rapprochés ; sinon
médiane du sous-groupe Ciqual (puis du groupe). Sortie : { code Ciqual: [grammes, origine] } avec origine
« a » (aliment rapproché), « v » (variante d'un aliment rapproché) ou « g » (estimation par groupe).
"""
import csv, json, re, statistics, unicodedata, collections, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
src = lambda f: os.path.join(ROOT, 'source', f)

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('œ', 'oe')
    return set(w for w in re.split(r'[^a-z0-9]+', s) if len(w) > 2 and w not in STOP)
STOP = {'les', 'des', 'aux', 'avec', 'sans', 'pour', 'type', 'non', 'etc', 'aliment', 'moyen', 'and', 'the', 'base'}

# Ciqual : composition (même ordre que data/ciqual.json)
cq = json.load(open(os.path.join(ROOT, 'data/ciqual.json')))
K = cq['nutriments']
def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    if v == 'tr': return 0.0
    return float(v[1:]) / 2
# Échelle d'écart « normal » par nutriment pour la distance
VEC = [('kcal', 'aet', 15), ('prot', 'proteines', 1.5), ('gluc', 'glucides', 2), ('lip', 'lipides', 1.5), ('sucres', 'sucres', 2),
       ('fibres', 'fibres', 1), ('ags', 'ags', 1), ('eau', 'eau', 3), ('sel', 'sel', 0.15), ('calcium', 'calcium', 20),
       ('fer', 'fer', 0.4), ('vitc', 'vitamine_c', 4), ('potassium', 'potassium', 40), ('magnesium', 'magnesium', 6)]
ciq = []
for code, nom, grp, ssgrp, sssgrp, sci, vals in cq['aliments']:
    v = {k: num(vals[K.index(k)]) for k, _, _ in VEC}
    tete = [w for w in re.split(r'[^a-z0-9]+', ' '.join(sorted(norm(nom.split(',')[0]), key=lambda w: nom.lower().find(w))))] if nom else []
    v['eau'] = num(vals[K.index('eau')])
    ciq.append((code, nom, grp, ssgrp, sssgrp, v, norm(nom), tete[0] if tete else ''))

adultes = set()
for row in csv.DictReader(open(src('inca3-description-indiv.csv'), encoding='utf-8-sig'), delimiter=';'):
    if row['ech'] == '1': adultes.add(row['NOIND'])

qte = collections.defaultdict(list)
compo = {}
lib = {}
fl = lambda x: float(x.replace(',', '.')) if x not in ('', '.') else None
for row in csv.DictReader(open(src('inca3-conso-compo.csv'), encoding='utf-8-sig', errors='replace'), delimiter=';'):
    if row['NOIND'] not in adultes: continue
    q = fl(row['qte_conso'])
    if not q or q <= 0: continue
    c = row['aliment_code_INCA3']
    qte[c].append(q)
    lib[c] = row['aliment_libelle_INCA3']
    if c not in compo: compo[c] = {k: fl(row[col]) for k, col, _ in VEC}

def distance(a, b):
    d = n = 0
    for k, _, s in VEC:
        if a.get(k) is None or b.get(k) is None: continue
        d += min(abs(a[k] - b[k]) / s, 10); n += 1
    return d / n if n >= 6 else 99

lien = collections.defaultdict(list)  # code Ciqual -> [(quantités)]
journal = []
for c, qs in qte.items():
    if len(qs) < 5: continue
    toks = norm(lib[c])
    best = None
    for code, nom, grp, ssgrp, sssgrp, v, ct, tete in ciq:
        if tete not in toks: continue  # le mot principal de l'aliment Ciqual (« Veau », « Nectar ») doit figurer dans le nom INCA3
        d = distance(compo[c], v)
        if d > 3: continue
        j = len(toks & ct) / max(len(toks | ct), 1)
        if j < 0.15: continue  # au moins un mot en commun : à composition égale, les boissons sans calories se ressemblent toutes
        score = d - 1.5 * j
        if best is None or score < best[0]: best = (score, d, j, code, nom)
    if best and (best[1] < 0.6 or (best[1] < 1.2 and best[2] >= 0.3) or (best[1] < 3 and best[2] >= 0.5)):
        lien[best[3]].extend(qs)
        journal.append((len(qs), lib[c], best[4], round(best[1], 2), round(best[2], 2)))

def med(qs): return round(statistics.median(qs) / 5) * 5 or round(statistics.median(qs))
portions = {}
par_groupe = collections.defaultdict(list)
for code, nom, grp, ssgrp, sssgrp, v, ct, tete in ciq:
    if len(lien.get(code, [])) >= 5:
        portions[code] = [med(lien[code]), 'a']
        for g in (sssgrp, ssgrp, grp):
            if g: par_groupe[g].extend(lien[code])
# Portions par défaut des sous-groupes très concentrés, quand aucun aliment de même nom n'a été rapproché.
DEFAUT = {'1004': 1, '1005': 1, '1006': 2, '1007': 5, '1002': 10, '0205': 30, '0702': 20, '0703': 20, '0901': 10, '0902': 10,
          '0903': 10, '0904': 5, '0905': 10, '0701': 10, '0704': 20, '0303': 30}
# Variantes d'un aliment rapproché (« Amande, grillée, salée » ← « Amande ») : même mot principal, même sous-groupe.
# Seulement si la densité calorique est proche : les chips de banane ne donnent pas la portion de la banane.
tetes = collections.defaultdict(list)
for code, nom, grp, ssgrp, sssgrp, v, ct, tete in ciq:
    if code in portions: tetes[(ssgrp, tete)].append((v['kcal'], lien[code]))
def proche(k1, k2):
    if k1 is None or k2 is None: return False
    return (k1 + 20) / (k2 + 20) < 1.5 and (k2 + 20) / (k1 + 20) < 1.5
for code, nom, grp, ssgrp, sssgrp, v, ct, tete in ciq:
    if code in portions: continue
    qs = [q for k, l in tetes.get((ssgrp, tete), []) if proche(k, v['kcal']) for q in l]
    if len(qs) >= 5:
        portions[code] = [med(qs), 'v']; continue
    d = DEFAUT.get(sssgrp[:4] if sssgrp else '') or DEFAUT.get(ssgrp or '')
    if grp == '06' and v['eau'] is not None and v['eau'] < 20:
        d = 5  # poudre, feuilles ou grains pour boisson (thé, café, cacao) : la boisson préparée a sa propre portion
    if d:
        portions[code] = [d, 'g']; continue
    for g in (sssgrp, ssgrp, grp):
        if g and len(par_groupe.get(g, [])) >= 20:
            portions[code] = [med(par_groupe[g]), 'g']; break

json.dump({'source': "Anses, étude INCA3 (2014-2015), adultes, médiane des quantités consommées par prise ; données ouvertes data.gouv.fr",
           'portions': portions}, open(os.path.join(ROOT, 'data/portions.json'), 'w'), separators=(',', ':'))
journal.sort(reverse=True)
with open(os.path.join(ROOT, 'source/portions-rapprochements.tsv'), 'w') as f:
    for j in journal: f.write('\t'.join(map(str, j)) + '\n')
print(f"{len(qte)} aliments INCA3, {len(journal)} rapprochés ; portions : {sum(1 for p in portions.values() if p[1]=='a')} directes, "
      f"{sum(1 for p in portions.values() if p[1]=='v')} variantes, {sum(1 for p in portions.values() if p[1]=='g')} par groupe, {len(cq['aliments']) - len(portions)} sans")
