# Food

Retrouver rapidement l'intérêt nutritionnel d'un aliment : macro et micronutriments de la table **Ciqual 2025** de l'Anses,
en % des repères journaliers, avec une fiche par nutriment (rôle, manque, excès, assimilation, repères pratiques, grossesse,
références) et les meilleures sources alimentaires (par portion, par 100 g, par 100 kcal). Acides aminés et qualité des
protéines (indice chimique, complémentarité dans l'assiette), score de la portion habituelle, fiabilité et source de chaque
valeur. Comparateur (jusqu'à 4 aliments) et assiette (total d'un repas, repas enregistrés).

En ligne : https://food.domelier.fr (PWA installable, consultable hors ligne pour les pages déjà vues).

## Fonctionnement

- Serveur Node ≥ 22.13 **sans dépendance** : `node:http` + `node:sqlite`. Environ 30 Mo de RAM.
- `data/ciqual.json` (commité) est généré depuis le fichier xlsx de l'Anses par `npm run ciqual`.
  Au démarrage, le serveur construit `data/ciqual.db` (SQLite) si le JSON a changé.
- `server/nutriments.js` : colonnes Ciqual gardées, acides aminés, unités et repères journaliers (Anses 2021, EFSA, OMS).
- `server/fiches.js`, `server/assimilation.js` : textes des fiches, assimilation, références.
- `server/score.js` : score de la portion (inspiré du NRF) et indice chimique des protéines.

### Données (`data/`, commitées) et outils de préparation (`tools/`)

Les fichiers sources restent en local dans `source/` (hors dépôt).

| Fichier | Source | Outil |
|---|---|---|
| `ciqual.json` | Ciqual 2025, xlsx (Anses, licence ouverte) | `node tools/ciqual-json.js` |
| `ciqual-qualite.json` | Ciqual 2025, XML composition + sources : indice de confiance A-D et référence de chaque valeur | `node tools/ciqual-qualite.js` |
| `portions.json` | Étude INCA3 (Anses, data.gouv.fr) : médiane des quantités par prise chez l'adulte, rapprochée des aliments Ciqual | `python3 tools/portions.py` |
| `acides-amines.json` | USDA FoodData Central SR Legacy (domaine public) : profil en mg/g de protéines par type d'aliment (`tools/acides-amines-types.tsv`), sinon moyenne du groupe | `python3 tools/acides-amines.py` |

`source/usda-aa.json` est un extrait des CSV USDA (`food.csv`, `food_nutrient.csv`, nutriments 1003 et 1210-1227).
- `public/` : interface sans framework ; profil, comparateur et assiettes restent dans le navigateur (localStorage).

```bash
npm run dev      # http://127.0.0.1:3310
npm test
```

Mettre à jour Ciqual : télécharger le xlsx sur https://ciqual.anses.fr (ou l'entrepôt data.gouv), le placer dans `source/`,
puis `node tools/ciqual-json.js source/<fichier>.xlsx` et commiter `data/ciqual.json`.

## Déploiement

Push sur `main` → GitHub Actions lance les tests puis envoie le code par rsync (clé bridée par rrsync sur
`~/apps/food/app`) ; `.deploy-stamp` déclenche `food-deploy.path`, qui redémarre `food.service` (port 3310).
Fichiers systemd et vhost Nginx dans `deploy/`.

## Sources et licence

Données : Anses, Table de composition nutritionnelle des aliments Ciqual 2025, licence ouverte Etalab 2.0
(https://ciqual.anses.fr, doi:10.57745/RDMHWY). Les fiches sont de la vulgarisation (Anses, EFSA, OMS)
et ne remplacent pas l'avis d'un professionnel de santé. Code sous licence MIT.
