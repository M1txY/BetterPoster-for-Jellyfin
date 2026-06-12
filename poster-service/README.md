# Better Poster Service

Petit service auto-hébergé qui ajoute les **vrais** badges de qualité (4K / 1080p / 720p / SD,
+ HDR / Dolby Vision / Atmos) sur tes posters Jellyfin.

Contrairement aux « Quality Tags » de btttr.cc — qui sont génériques et basés sur la base de
données de btttr, pas sur ton fichier — ici **c'est le plugin Jellyfin qui détecte la résolution
réelle de TON fichier** et l'envoie au service. Le service récupère le poster *vierge* depuis
btttr.cc et dessine simplement le badge correspondant par-dessus.

## Architecture

```
Jellyfin → plugin "Btttr Posters" (détecte 4K/1080p/HDR/Atmos du fichier local)
            │  GET http://ton-serveur:8080/poster/tt10919420.jpg?quality=4k&hdr=dovi
            ▼
        better-poster-service (Node + sharp)
            │  récupère le poster VIERGE :
            │  GET https://btttr.cc/poster-n/imdb/poster-default/tt10919420.jpg?tag=none
            ▼
        compose le badge → renvoie un JPEG → Jellyfin
```

Le service met en cache chaque résultat dans `./cache` (clé = IMDb id + badges), donc btttr.cc
n'est interrogé qu'une fois par combinaison.

## Démarrage rapide (Docker)

```bash
cd poster-service
docker compose up -d --build
```

Le service écoute sur le port **8080**. Vérifie :

```bash
curl http://localhost:8080/health
# {"ok":true}

# Aperçu d'un poster avec badge 4K + Dolby Vision :
curl "http://localhost:8080/poster/tt10919420.jpg?quality=4k&hdr=dovi&atmos=1" -o test.jpg
```

### Sans Docker

```bash
cd poster-service
npm install --omit=dev
node server.js
```

## Variables d'environnement

| Variable        | Défaut                | Rôle                                                        |
|-----------------|-----------------------|------------------------------------------------------------|
| `PORT`          | `8080`                | Port d'écoute.                                              |
| `BTTTR_BASE`    | `https://btttr.cc`    | Source des posters vierges.                                 |
| `BTTTR_LAYOUT`  | `poster-default`      | Layout btttr.cc utilisé pour le poster vierge.             |
| `CLEAN_PREFIX`  | `poster-n`            | Préfixe « poster vierge » (`poster-n` = aucune info en bas).|
| `CACHE_DIR`     | `./cache`             | Dossier de cache disque.                                    |

## API

```
GET /poster/{imdbId}.jpg
```

| Paramètre  | Valeurs                                   | Effet                          |
|------------|-------------------------------------------|--------------------------------|
| `quality`  | `4k` / `2160p`, `1080p`, `720p`, `sd`     | Badge de résolution.           |
| `hdr`      | `dv` / `dovi`, `hdr` / `hdr10` / `hlg`    | Badge HDR ou Dolby Vision.     |
| `atmos`    | `1` / `true`                              | Badge ATMOS.                   |

Sans paramètre, le service renvoie simplement le poster vierge (utile quand la résolution est
inconnue, ex. certaines séries).

## Côté plugin Jellyfin

1. Recompile le plugin (`.dll`) :
   ```bash
   cd jellyfin-btttr-plugin
   dotnet build -c Release
   ```
   Copie `bin/Release/net9.0/Jellyfin.Plugin.BtttrPosters.dll` dans le dossier
   `plugins/Btttr Posters/` de Jellyfin, puis redémarre le serveur.

2. Dans **Tableau de bord → Plugins → Btttr Posters**, renseigne
   **Self-hosted Poster Service URL** = `http://IP-DE-TON-SERVEUR:8080` et coche les badges voulus.

3. Active le fetcher **Btttr Posters** sur tes bibliothèques (Gérer la bibliothèque → *Image
   fetchers*), monte-le en haut de la liste, puis rafraîchis les métadonnées avec
   *« Remplacer les images existantes »*.

> Astuce : si le champ URL est laissé vide, le plugin retombe sur le comportement d'origine
> (poster btttr.cc direct, sans badge) — pratique pour tester.

## Personnaliser les badges

Tout le style (couleurs, taille, position des pastilles) est dans
[`render.js`](render.js) — fonction `buildOverlaySvg`. Les pastilles sont des `<rect>` + `<text>`
SVG dimensionnés proportionnellement au poster, donc le rendu reste net quelle que soit la taille.
