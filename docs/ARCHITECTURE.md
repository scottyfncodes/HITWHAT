# HitWhat architecture

```
 ┌────────────────────────── Browser (installable PWA, works offline) ──────────────────────────┐
 │                                                                                               │
 │  ui/ (Preact)  Round · Caddie · Rangefinder · Stats · Swing · Handicap · Settings             │
 │      │                                                                                        │
 │      ▼                                                                                        │
 │  core/ (pure, tested)                                                                         │
 │    recommend + adjustments ─► club, swing, plays-like, aim        strategy ─► aim, safe miss, │
 │    shots ─► per-club averages, reliability, learned carries                  hole plan         │
 │    round + stats ─► totals, hole feedback, insights, summary      geo + rangefinder ─► yards  │
 │    handicap ─► differentials, estimate, trend, course handicap    swing ─► metrics, focus     │
 │      ▲                                                                                        │
 │  state/  localStorage: profile, rounds, courses, shots (sanitised on read)                    │
 │          IndexedDB: swing videos + analyses        backup: JSON export/restore                 │
 │  services/  GPS + compass + camera (device) · MediaPipe pose (local WASM + model)             │
 │             Open-Meteo weather/terrain · OpenStreetMap Overpass (cached per area)              │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Principles

1. **Deterministic numbers.** Every number and every caddie sentence on screen comes from `src/core` (the sentence
   from `core/voice.ts` and `core/strategy.ts`). There is no AI model or paid API anywhere in the app.
2. **Local first.** Scoring, the caddie, stats and the handicap estimate need no network. Rounds are saved on every
   tap. Network features (maps, weather, terrain) are optional, time-limited and cached.
3. **Honest limits.** Each capability states its source and accuracy: GPS ± on yardages, "approximate" on flag
   sizing and terrain height, "not measured from this angle" on swing checks, "HitWhat estimate, not official" on
   the handicap, "approximate benchmarks" on stats ratings.

## The learning loop

`ShotRecord`s (GPS-measured during a round, or entered by hand) → `clubStats` (trimmed averages, spread,
reliability) → `effectiveClubs` (irons, hybrids and wedges with 5+ full shots use the golfer's recent average) →
`recommend`. GPS shots measure start-to-finish, so woods and driver keep the typed carry; driver averages feed the
hole plan's tee-shot length instead.

`distanceLadder` (`core/gapping.ts`) lays the bag out longest first with the number the caddie uses, its basis
(tracked or typed), a one-standard-deviation band once a club has 4+ shots, and flags gaps under 5 yds (overlap) or
over 18 yds (25 after a driver or wood). `practicePlan` turns that into at most three range jobs, each a literal
reading of the ladder. Range-session shots are stored as `manual` shot records, so they feed the same loop.

Round history feeds `insights` (Stats), `holePlan` (fairway-miss pattern, scoring history on that hole) and
`handicapReport` (which feeds `targetAdvice`: tucked pins are attacked only by single-digit players with a scoring
club).

## Handicap estimate (`core/handicap.ts`)

- Differential = (113 / slope) × (adjusted gross − rating), PCC = 0.
- Hole-by-hole rounds are capped at net double bogey (par + 5 before an estimate exists), using stroke index when
  entered and an approximation (flagged) when not.
- Best 1–8 of the last 20 per the WHS table, with the short-record adjustments; soft/hard caps once there are 20.
- 9-hole scores are paired, or once an estimate exists, combined with the expected score for the other nine
  (0.52 × index + 1.2).
- Rounds without rating/slope, incomplete rounds and unpaired nines are listed with the reason.

## Rangefinder (`core/geo.ts`, `core/rangefinder.ts`, `services/osm.ts`, `ui/Rangefinder.tsx`)

- GPS fix (watchPosition, high accuracy) → targets: greens from OpenStreetMap (polygon centroid and outline) and
  pin spots the golfer saved per course/hole.
- Front/back: where the line to the green centre crosses the green outline.
- Target choice: the current hole's saved pin → the current hole's mapped green → what the compass points at →
  nearest. The AR marker uses an assumed field of view and is labelled approximate.
- Flag sizing: pinhole model, distance = flag height × focal length / pixel span, with ±(2 px marking + 4% flag
  height + 15% field of view when uncalibrated). Calibration stores the camera's long-side field of view.

## Swing analysis (`services/pose.ts`, `core/swing.ts`)

- MediaPipe Pose Landmarker (lite) runs in the browser in VIDEO mode. Clips over 7 s get a 10 fps scan to find
  impact, then a 30 fps pass around it.
- Key positions from the hands: impact = fastest low hands, top = highest hands before impact, takeaway = last
  frame at address. Target direction is read from the swing, so handedness and mirrored video don't matter.
- Metrics per angle: tempo, head, backswing length (both); stance width, shoulder and hip turn (apparent width
  ratios), lead arm, hips-before-hands transition, finish weight (face-on); spine angle, posture through impact,
  hand-path indicator (down the line). Anything the angle can't support is returned as "Not measured".
- Tendencies: an issue present in 3+ of the last 6 swings where that check was measured.

## Persistence

All reads are sanitised field by field (`state/*.ts`), so old or corrupt data degrades to defaults. Private-mode
Safari, which throws on write, is detected and reported. `navigator.storage.persist()` is requested once there are
rounds. Backup files contain everything except videos.

## PWA

The manifest has any and maskable icons; standalone display; safe-area insets. `sw.js` is generated at build with
the exact hashed asset list: pages network-first with a cached-shell fallback, assets cache-first, and the swing
runtime and model cached on first use in a cache that survives app updates. Weather and map requests are never
cached by the service worker (maps are cached by the app in localStorage).
