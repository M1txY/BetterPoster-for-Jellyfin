# Btttr Posters — Real Quality Badges for Jellyfin

![Cover Art](https://raw.githubusercontent.com/M1txY/BetterPoster-for-Jellyfin/main/cover.PNG)

A Jellyfin plugin **+** a small self-hosted service that puts clean, custom posters on your
library **and overlays real quality badges** — `4K` / `1080p` / `720p` / `SD`, plus `HDR` and the
official **Dolby Vision** logo — based on the **actual file you own**.

> This is a fork of [TheAceOfficials/BetterPoster-for-Jellyfin](https://github.com/TheAceOfficials/BetterPoster-for-Jellyfin).
> The original plugin fetches posters from [btttr.cc](https://btttr.cc) by IMDb ID. This fork adds
> the self-hosted badge service and **per-file resolution detection** that btttr.cc can't do on its own.

---

## Why a self-hosted service?

btttr.cc's own "quality tags" are generic — they come from btttr's database and are the same for
everyone, regardless of whether *your* copy is 4K or 1080p. btttr has no way to know what's on your disk.

Your Jellyfin plugin **does** know. So here:

1. The **plugin** reads the real resolution / dynamic range of each file.
2. It calls **your** service with that info.
3. The **service** grabs a clean poster from btttr.cc and draws the matching badge on top.

The result is a badge that is actually correct for each file.

```
Jellyfin → plugin "Btttr Posters"  (detects 4K / 1080p / HDR / Dolby Vision of the real file)
            │  GET http://your-server:8080/poster/tt10919420.jpg?quality=4k&hdr=dv
            ▼
        better-poster-service  (Node + sharp)
            │  fetches the CLEAN poster:
            │  GET https://btttr.cc/poster-n/imdb/poster-default/tt10919420.jpg?tag=none
            ▼
        overlays the badges → returns a JPEG → Jellyfin
```

---

## What you get

- 🎯 **Real quality badges** — `4K`, `1080p`, `720p`, `SD` rendered from the actual video stream.
- 🌈 **HDR & Dolby Vision** — adds an `HDR` tag or the official Dolby Vision logo when present.
- 🖼️ **Clean source posters** — pulled from btttr.cc by IMDb ID, no genre/rating clutter.
- 🧰 **Web preview UI** — a btttr.cc-style page (served at `/`) to see the badges and try options.
- 🪶 **Self-contained** — badges are vector (SVG) + the bundled *Inter ExtraBold* font; no external assets.
- 🔌 **Optional** — leave the service URL empty and the plugin behaves like the original (btttr.cc direct, no badge).

---

## Setup

There are **two pieces**: the service (a Docker container you host) and the Jellyfin plugin.

### 1. Run the poster service

```bash
cd poster-service
docker compose up -d --build
```

It listens on port **8080**. Check it:

```bash
curl http://localhost:8080/health          # {"ok":true}
```

Then open **`http://YOUR-SERVER-IP:8080/`** in a browser for the preview UI. Full service docs
(env vars, API, customizing badges) are in **[poster-service/README.md](poster-service/README.md)**.

### 2. Install the plugin into Jellyfin

There are two ways to get the plugin into Jellyfin.

#### Option A — Manual install (works right now)

**1. Get the plugin file (`Jellyfin.Plugin.BtttrPosters.dll`).** Either build it:

```bash
cd jellyfin-btttr-plugin
dotnet build -c Release
# -> bin/Release/net9.0/Jellyfin.Plugin.BtttrPosters.dll
```

…or download it from the repo's **Releases** page (once a release is published — see Option B).

**2. Drop the DLL into a `Btttr Posters` subfolder of your Jellyfin _plugins_ directory:**

| Platform | Plugins directory |
|---|---|
| Linux (apt / native) | `/var/lib/jellyfin/plugins/` |
| Docker (official / linuxserver) | `/config/plugins/` *(inside the container)* |
| Windows | `%LOCALAPPDATA%\jellyfin\plugins\` |
| macOS | `~/.local/share/jellyfin/plugins/` |

The final path should look like:

```
…/plugins/Btttr Posters/Jellyfin.Plugin.BtttrPosters.dll
```

**3. Restart Jellyfin.** The plugin then shows up under **Dashboard → Plugins**.

> Not sure where your data folder is? In Jellyfin go to **Dashboard → Advanced** — the
> *Paths* section lists the data directory; `plugins` lives right next to it.

#### Option B — From a plugin repository (one-click, needs a published release)

If a GitHub **Release** is published and `manifest.json` points to it, you can install from inside
Jellyfin without copying files:

1. **Dashboard → Plugins → Repositories → ➕ (Add)**
2. **Name:** `Btttr Posters` — **URL:** `https://raw.githubusercontent.com/M1txY/BetterPoster-for-Jellyfin/main/manifest.json`
3. Open the **Catalog** tab → find **Btttr Posters** (Metadata category) → **Install** → restart.

![Repository setup](https://raw.githubusercontent.com/M1txY/BetterPoster-for-Jellyfin/main/setup.JPG)

> ⚠️ The bundled `manifest.json` still references the original author's v1.0.0 release, so this
> route currently installs the **old** plugin (no badge features). Use **Option A** until a fork
> release is published.

### 3. Configure the plugin

In **Dashboard → Plugins → Btttr Posters**:

| Setting | What to enter |
|---|---|
| **Self-hosted Poster Service URL** | `http://YOUR-SERVER-IP:8080` (base URL only) |
| **Resolution badge** | on |
| **HDR / Dolby Vision badge** | on (optional) |

> Leave the URL **empty** to disable the service and fall back to plain btttr.cc posters.

### 4. Enable it on your libraries

1. **Dashboard → Libraries** → on a library, **⋯ → Manage Library**.
2. Under **Image fetchers**, tick **Btttr Posters**.
3. Move it to the **top** so it takes priority over TMDb/OMDb.
4. **Save**, then **Refresh Metadata** with *"Replace existing images"*.

---

## How the badge is decided

| What the plugin reads (per file) | Badge sent |
|---|---|
| Video width ≥ ~3000 px (or 2160p) | `4K` |
| Video width ≥ ~1700 px (or 1080p) | `1080p` |
| Video width ≥ ~1100 px (or 720p) | `720p` |
| Smaller | `SD` |
| Dynamic range = Dolby Vision | Dolby Vision logo |
| Dynamic range = HDR10 / HLG | `HDR` |

- **Movies:** detected directly from the file's video stream.
- **TV Shows:** the series poster samples the first episode that has a video stream (series are
  usually a uniform resolution). If nothing is found, the clean poster is returned without a badge.

---

## Troubleshooting

- **No poster applied?** The media needs a valid IMDb ID (`ttXXXXXXX`) in its metadata — that's how
  the correct poster is found. Check via *Edit Metadata*.
- **Poster but no badge?** Make sure the **Service URL** is set in the plugin config, the service is
  reachable from Jellyfin, and the item is a Movie/Series with a detectable video stream.
- **Want different badge styling?** Colors, size, position and the resolution font are all in
  [poster-service/render.js](poster-service/render.js) (or via the `RES_FONT` / `RES_WEIGHT` env vars).

---

## Credits

- Original plugin: **[TheAceOfficials/BetterPoster-for-Jellyfin](https://github.com/TheAceOfficials/BetterPoster-for-Jellyfin)**.
- Clean posters: **[btttr.cc](https://btttr.cc)**.
- Resolution badge font: **[Inter](https://github.com/rsms/inter)** (SIL OFL).
