# Tests du gestionnaire de tournois

## Où placer ces fichiers

À la racine de votre projet, avec cette arborescence (celle que `server.js` attend déjà) :

```
projet/
├── package.json        <- fusionnez les scripts / devDependencies si vous en avez déjà un
├── src/                <- server.js, Tournament.js
├── public/             <- index.html, script.js, style.css
└── tests/              <- ce dossier
```

## Lancer

```
npm install                       # installe playwright (uniquement pour les tests e2e)
npx playwright install chromium   # une seule fois
npm test                          # tout (≈ 1 min, surtout les tests navigateur)
npm run test:unit                 # Tournament.js        (< 1 s)
npm run test:api                  # server.js en HTTP    (quelques s)
npm run test:e2e                  # navigateur           (≈ 1 min)
```

Node 20+ requis (testé avec Node 22). Aucune autre dépendance : le lanceur est `node:test`.
Sans Playwright, les tests e2e sont simplement ignorés.

## Lire les résultats

Un test dont le titre commence par `BUG:` (ou portant `todo`) décrit le comportement **attendu** alors que le code
actuel a un défaut : il s'exécute, échoue, mais ne fait pas échouer la suite (affiché `# TODO`).
Quand vous corrigez le défaut, supprimez l'option `todo` du test pour qu'il devienne une vraie protection.

Les tests API lancent le vrai `server.js` dans un dossier temporaire, sur un port libre, avec un faux dossier
personnel : votre vrai dossier Téléchargements n'est jamais touché et le port 3000 peut rester utilisé.
