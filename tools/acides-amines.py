#!/usr/bin/env python3
"""Acides aminés des aliments Ciqual, d'après la base USDA FoodData Central (SR Legacy, domaine public).

    python3 tools/acides-amines.py   →  data/acides-amines.json

Ciqual ne publie pas les acides aminés. Pour chaque aliment Ciqual, on reprend le profil d'un aliment USDA
(mg d'acide aminé par g de protéines), appliqué à la teneur en protéines de Ciqual :
  - « a » : type d'aliment reconnu par son nom (tools/acides-amines-types.tsv, ~130 types) ;
  - « g » : estimation, moyenne des profils des aliments reconnus du même sous-groupe Ciqual (puis groupe).
Entrées en local : source/usda-aa.json (extrait des CSV USDA, voir README) et data/ciqual.json.
"""
import json, re, os, unicodedata, collections

ROOT = os.path.join(os.path.dirname(__file__), '..')
# « ala » (alanine) devient « alanine » dans la sortie : « ala » est déjà l'oméga-3 alpha-linolénique.
AA = ['his', 'ile', 'leu', 'lys', 'met', 'cys', 'phe', 'tyr', 'thr', 'trp', 'val', 'arg', 'ala', 'asp', 'glu', 'gly', 'pro', 'ser']

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('œ', 'oe')

usda = json.load(open(os.path.join(ROOT, 'source/usda-aa.json')))
par_desc = {v[0]: (k, v[1]) for k, v in usda.items()}
types = []
for line in open(os.path.join(ROOT, 'tools/acides-amines-types.tsv'), encoding='utf-8'):
    if line.startswith('#') or not line.strip(): continue
    rx, desc = line.rstrip('\n').split('\t')
    types.append((re.compile(rx), desc))

signales = set()
def profil(desc):
    _, d = par_desc[desc]
    # Contrôle : la somme des acides aminés doit être proche des protéines. Sinon l'analyse USDA est incomplète
    # (ex. certains bœufs hachés : 69 %, tryptophane divisé par deux) et l'indice chimique serait faussé.
    rec = sum(v for k, v in d.items() if k != 'prot') / d['prot']
    if d['prot'] > 5 and not 0.85 <= rec <= 1.15 and desc not in signales:
        signales.add(desc)
        print(f'  ! {desc} : acides aminés = {rec:.0%} des protéines')
    return [round(d.get(a, 0) / d['prot'] * 1000, 1) if a in d else None for a in AA]

cq = json.load(open(os.path.join(ROOT, 'data/ciqual.json')))
iprot = cq['nutriments'].index('prot')
def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    return 0.0 if v == 'tr' else float(v[1:]) / 2

profils = {}   # clé → [libellé, [mg/g de protéines…]]
aliments = {}  # code Ciqual → clé de profil
groupes = collections.defaultdict(list)
for code, nom, grp, ssgrp, sssgrp, sci, vals in cq['aliments']:
    p = num(vals[iprot])
    if not p or p < 0.5: continue
    n = norm(nom)
    if grp == '01': continue  # plats composés : profil moyen du mélange, voir plus bas
    for rx, desc in types:
        if rx.search(n):
            cle = par_desc[desc][0]
            profils.setdefault(cle, [desc, profil(desc)])
            aliments[code] = cle
            for g in (sssgrp, ssgrp, grp):
                if g and g.strip('0'): groupes[g].append(profils[cle][1])
            break

def moyenne(ps):
    return [round(sum(p[i] for p in ps if p[i] is not None) / max(1, sum(1 for p in ps if p[i] is not None)), 1) for i in range(len(AA))]

estimes = 0
for code, nom, grp, ssgrp, sssgrp, sci, vals in cq['aliments']:
    p = num(vals[iprot])
    if code in aliments or not p or p < 0.5: continue
    for g in (sssgrp, ssgrp, grp):
        if g and g.strip('0') and len(groupes.get(g, [])) >= 3:
            cle = f'g{g}'
            profils.setdefault(cle, [cq['groupes'].get(g, g), moyenne(groupes[g])])
            aliments[code] = cle
            estimes += 1
            break
    else:
        if grp == '01':  # plat composé : moyenne des viandes, poissons, œufs, laitages, céréales et légumineuses reconnus
            cle = 'g01'
            profils.setdefault(cle, ['plats composés (profil moyen)', moyenne(groupes['04'] + groupes['05'] + groupes['03'] + groupes['0203'])])
            aliments[code] = cle
            estimes += 1

json.dump({'source': "USDA, FoodData Central, SR Legacy (2018), domaine public ; profil en mg par g de protéines appliqué aux protéines Ciqual",
           'acides_amines': ['alanine' if a == 'ala' else a for a in AA], 'profils': profils, 'aliments': aliments},
          open(os.path.join(ROOT, 'data/acides-amines.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"{len(aliments) - estimes} aliments reconnus, {estimes} estimés par groupe, {len(profils)} profils")
