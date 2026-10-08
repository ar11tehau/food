# Food

Retrouver rapidement l'intérêt nutritionnel d'un aliment : macro et micronutriments de la table **Ciqual 2025** de l'Anses,
en % des repères journaliers, avec une fiche par nutriment (rôle, manque, excès, repères pratiques, grossesse) et les
meilleures sources alimentaires. Comparateur (jusqu'à 4 aliments) et assiette (total d'un repas, repas enregistrés).

En ligne : https://food.domelier.fr (PWA installable, consultable hors ligne pour les pages déjà vues).

## Fonctionnement

- Serveur Node ≥ 22.13 **sans dépendance** : `node:http` + `node:sqlite`. Environ 30 Mo de RAM.
- `data/ciqual.json` (commité) est généré depuis le fichier xlsx de l'Anses par `npm run ciqual`.
  Au démarrage, le serveur construit `data/ciqual.db` (SQLite) si le JSON a changé.
- `server/nutriments.js` : colonnes Ciqual gardées, unités et repères journaliers (Anses 2021, EFSA, OMS).
- `server/fiches.js` : textes des fiches nutriments.
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
