# Mes courses

Site statique (GitHub Pages) : un dossard par course, une fiche par course, un onglet « Données ».

## Données publiques et données privées

- `data/courses.json` (public) : les courses avec des chronos **arrondis à la minute** (`chrono`, `t` en secondes), sans liens Strava ni photos.
- `data/prive.json` et `photos/*.bin` : les chronos exacts, les liens Strava et les photos, **chiffrés** (AES-256-GCM, clé dérivée du mot de passe par PBKDF2-SHA-256, 600 000 itérations). Le bouton « Se connecter » les déchiffre dans le navigateur ; le mot de passe n'est envoyé nulle part.

Ces fichiers chiffrés sont produits par `tools/chiffrer.py` à partir d'un dossier source privé (`prive.json` + `photos/`), qui reste sur l'ordinateur et ne doit jamais être poussé sur GitHub :

```
pip install cryptography
python tools/chiffrer.py <dossier-source-prive> .
```

Relancer le script (par exemple pour changer de mot de passe) remplace les anciens fichiers chiffrés.

## Structure

- `index.html`, `css/style.css`
- `js/app.js` (liste, fiches, connexion), `js/data.js` (graphiques), `js/prive.js` (déchiffrement)
- `data/traces/*.txt` : tracés GPS (polylines encodées)
- `vendor/leaflet/` : carte

Test en local : `python -m http.server` dans ce dossier, puis http://localhost:8000.
