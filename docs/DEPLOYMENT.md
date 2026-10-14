# Deploying HitWhat

HitWhat is a static web app. There is no server, no API key and no secret anywhere.

`.github/workflows/deploy.yml` runs on every push to `main`: it runs the unit tests, builds with Vite and publishes
`dist/` to GitHub Pages with `actions/deploy-pages`.

One-time repo setup, if Pages isn't already on: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

The app uses a relative base (`./`), so it works at the repository's Pages path
(`https://scottyfncodes.github.io/HITWHAT/`) or at the root of a custom domain.

## Custom domain (hitwhat.com)

`index.html` already declares `https://hitwhat.com/` as the canonical URL. To serve the app there:

1. Point DNS for `hitwhat.com` at GitHub Pages (apex `A` records to GitHub's Pages IPs, or a `CNAME` for `www`).
2. **Settings → Pages → Custom domain:** enter `hitwhat.com`, then tick **Enforce HTTPS** once the certificate is issued.

Nothing in the build needs to change. Until the domain is set up, the GitHub Pages URL keeps working.

## Data from before the rename

On-device storage keys (`caddaie.*` in localStorage, the `caddaie` IndexedDB database) keep their original names so
rounds, bag settings and swings saved before the HitWhat rename are still there. Backups made before the rename
(`"format": "caddaie-backup"`) still restore. These names are never shown to the golfer.

The only network services the app calls are free and keyless, straight from the browser:

| Service | Used for |
| --- | --- |
| OpenStreetMap Overpass API | Nearby courses, greens and hole pars (cached on the device) |
| Open-Meteo | Live wind and temperature, terrain elevation |

Everything else (scoring, the caddie, stats, the handicap estimate, swing analysis) runs on the phone.
