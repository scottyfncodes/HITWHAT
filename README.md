# HITWHAT

**What do I hit here?** HitWhat answers the question every golfer asks over the ball. A scorekeeper, rangefinder, swing coach, stats analyst, handicap tracker and
personal caddie in one mobile web app, built for iPhone Safari and the Home Screen.

- **Live app:** https://scottyfncodes.github.io/HITWHAT/ (GitHub Pages). On iPhone: Share › Add to Home Screen; it
  installs as **HitWhat**.
- **Domain:** https://hitwhat.com/ is the canonical home (set in the page metadata). Until the custom domain is
  pointed at Pages, the GitHub Pages URL above is the live app. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Free and private:** browser APIs, open-source libraries and free, keyless data only. No account. Rounds and
  swing videos stay on the phone.

## The loop

**See → Understand → Advise → Learn.** The camera is HitWhat's eyes, your rounds are its memory, the stats are its
understanding, and the caddie's call is the advice. Every round makes the next recommendation more personal.

| Tab | What it does |
| --- | --- |
| **Round** | Start a round (find the course on OpenStreetMap or type it), score each hole in two or three taps: score, putts, tee shot, GIR (auto), penalties, club, notes, GPS shot tracking. One line of feedback after every hole. Finish with a summary: score, vs your average, putts, GIR, fairways, penalties, strongest area, biggest opportunity, key takeaway. |
| **Caddie** | One clear call: distance, club, swing, a one-sentence reason ("Favor the middle. Pin is back-left. Your recent 7-iron average is 155."), aim, safest miss, and the hole plan during a round. Wind, elevation, lie, stance, trouble, pin and air feed the deterministic engine. |
| **Rangefinder** (in Caddie) | Camera view + GPS + compass. Distance to the centre, front and back of greens mapped in OpenStreetMap, or to a pin spot you saved; green height from a terrain model; flag-size estimate with an error range. A help panel says what it can and can't measure. |
| **Distances** (in Stats) | Every club on one ladder: the number the caddie uses, whether it's your tracked average or the carry you typed, the spread of your shots, and gaps that are too wide or overlapping. A practice plan read straight from it (measure these clubs, tighten this one, fill this gap) and a **range session** for logging carries in one tap each. Also on the Round home. |
| **Stats** | "Your game right now" (putting, approach, driving, penalties: good / OK / watch, improving / slipping), the single biggest opportunity in strokes, then scoring average, FIR, GIR, putts, putts per GIR, penalties, par-3/4/5 and front/back scoring, score trend and club distances. |
| **Swing** | Down-the-line or face-on positioning guide, hands-free recording (countdown + beeps) or a video from Photos, slow-motion review, on-device pose analysis (MediaPipe), one thing to work on, key frames with the skeleton, save, compare with your previous or best swing, recurring tendencies. |
| **Handicap** | A HitWhat estimate from your rounds (World Handicap System arithmetic), shown separately from your official Handicap Index (which you can type in). Differentials, which scores count, trend, course handicap, a plain-English explanation, and exactly what's missing when there isn't enough data. |
| **Settings** | Your bag: typical carry, tracked average, confidence and notes per club, plus "let the caddie use my tracked averages". Units, handedness, theme (Sun mode for bright light), flagstick height and calibration, where your data lives, backup and restore. |

## Honest by design

HitWhat never invents precision. Where a phone can't measure something, it says so and offers the best real fallback.

- **Rangefinding.** Safari gives web apps no laser, LiDAR or depth data, so a camera image alone can't give a golf
  distance. Yardages come from GPS to a known target, with the GPS accuracy shown. Flag sizing is labelled
  approximate and always carries an error range.
- **Course data.** OpenStreetMap coverage depends on volunteers. Without mapped greens, you save the pin spot when
  you reach the green; it works offline on every later round. Ratings and slopes come from your scorecard.
- **Swing analysis.** Only body movement visible to one camera: tempo, head movement, posture, turn, sequencing,
  hand path (as an indicator), balance. Each check is measured only from the angle that can see it. No club speed,
  path or face numbers.
- **Handicap.** Always labelled "HitWhat estimate, not an official Handicap Index". There is no playing-conditions
  adjustment or association record, and the app says so.
- **Wind and elevation.** Live wind is a weather-station reading (Open-Meteo); green height is from a ~90 m terrain
  model. Both are labelled as such.
- **Stats.** "Good / watch" ratings compare you with approximate benchmarks for your scoring level and say so. The
  opportunity line states literal numbers from your rounds ("2.4 penalty strokes per round").

## Free-first stack

| Need | How |
| --- | --- |
| UI | Preact + TypeScript + Vite |
| Golf math, handicap, stats, strategy, swing metrics | `src/core`, pure functions with unit tests |
| Storage | `localStorage` (rounds, courses, shots, profile), IndexedDB (swing videos and analyses), JSON backup |
| Offline | Service worker: app shell precached; swing model cached on first use; course maps cached on the device |
| Pose estimation | MediaPipe Pose Landmarker (Apache-2.0), WASM runtime and model shipped with the app |
| Courses, greens, pars | OpenStreetMap via the Overpass API (free, keyless; © OpenStreetMap contributors) |
| Weather, terrain height | Open-Meteo (free, keyless) |
| Position, heading, camera | Geolocation, DeviceOrientation (with the iOS permission prompt), getUserMedia, MediaRecorder |

There is no AI model, paid API or server behind the caddie. Every recommendation, and the sentence that explains it,
is computed on the phone from the deterministic engine and your own data.

## Project layout

```
src/
  core/        Pure, deterministic logic (no I/O): recommend, adjustments, clubs, units, format, voice,
               round, stats, handicap, shots, gapping, strategy, geo, rangefinder, swing
  state/       Profile, rounds/courses/shots (sanitised localStorage), swings (IndexedDB), backup
  services/    Weather, sensors (GPS, compass, terrain), camera, OpenStreetMap, pose (MediaPipe)
  ui/          Preact screens: App shell, Round, Caddie, Rangefinder, Stats, Swing, Handicap, Settings
public/models/ MediaPipe pose model
tests/unit     Vitest: engine, handicap, stats, rounds, strategy, geometry, rangefinder, swing, state, services
tests/e2e      Playwright: every tab on iPhone and desktop viewports, offline, mocked GPS/maps/weather
```

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests
npm run test:e2e       # Playwright (builds and serves the production bundle)
npm run check          # typecheck + unit + build + e2e
```

Camera, compass and GPS need https (or localhost). To try them on a phone, deploy or use a tunnel to `npm run preview`.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
