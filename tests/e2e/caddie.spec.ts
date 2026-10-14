import { expect, test, type Page } from '@playwright/test';

/** Seed the profile once per test (so reloads keep what the app saved). Skips the welcome screen. */
async function seed(page: Page, patch: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([p, x]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem('caddaie.profile', JSON.stringify(p));
        for (const [k, v] of Object.entries(x)) localStorage.setItem(k, JSON.stringify(v));
        sessionStorage.setItem('__seeded', '1');
      }
    },
    [{ onboarded: true, ...patch }, extra] as const,
  );
}

const distance = (page: Page) => page.getByRole('textbox', { name: /Distance to target/ });

test.describe('first load', () => {
  test('explains HitWhat in one screen, then remembers', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveTitle(/HitWhat/);
    await expect(page.getByTestId('welcome')).toContainText('What do I hit here?');
    for (const t of ['Keep score', 'Get the club', 'Measure the distance', 'Check your swing', 'Track your handicap']) {
      await expect(page.getByTestId('welcome')).toContainText(t);
    }
    await page.getByTestId('welcome-start').click();
    await expect(page.getByTestId('start-round')).toBeVisible();
    for (const t of ['Round', 'Caddie', 'Stats', 'Swing', 'Handicap']) await expect(page.getByRole('navigation', { name: 'Main' })).toContainText(t);
    await page.reload();
    await expect(page.getByTestId('welcome')).toHaveCount(0);
  });

  test('"just need a club" goes straight to the caddie', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('welcome-caddie').click();
    await expect(page.getByTestId('recommendation')).toContainText('How far to the target?');
    await expect(page.getByTestId('club')).toHaveCount(0);
  });

  test('has PWA and iOS metadata', async ({ page, request }) => {
    await page.goto('./');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    const manifest = await (await request.get('manifest.webmanifest')).json();
    expect(manifest.short_name).toBe('HitWhat');
    expect(manifest.name).toContain('HitWhat');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'HitWhat');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    // The swing model ships with the app (no third-party CDN at runtime).
    expect((await request.get('models/pose_landmarker_lite.task')).ok()).toBe(true);
    expect((await request.get('mediapipe/vision_wasm_internal.wasm')).ok()).toBe(true);
  });
});

test.describe('caddie', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.goto('./#caddie');
  });

  test('distance → club, plays-like and reasoning', async ({ page }) => {
    await distance(page).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await expect(page.getByTestId('swing')).toHaveText('Full swing');
    await expect(page.getByTestId('plays-like')).toContainText('152');
  });

  test('wind and elevation change the club, and the math adds up on screen', async ({ page }) => {
    await distance(page).fill('150');
    await page.getByRole('radio', { name: 'Into your face' }).click();
    await page.getByRole('radiogroup', { name: 'Quick wind speed' }).getByRole('radio', { name: '10' }).click();
    await page.getByRole('button', { name: 'Increase Elevation change' }).click();
    await page.getByText('The math').click();
    await expect(page.getByTestId('math')).toContainText('10 mph into');
    await expect(page.getByTestId('math')).toContainText('5 ft uphill');
    const total = Number((await page.getByTestId('plays-like').innerText()).match(/\d+/)![0]);
    expect(total).toBe(167);
    await expect(page.getByTestId('club')).not.toHaveText('7 Iron');
  });

  test('steppers work without typing', async ({ page }) => {
    await page.getByRole('button', { name: 'Plus 5' }).click();
    await expect(distance(page)).toHaveValue('155');
    await page.getByRole('button', { name: 'Minus 1' }).click();
    await expect(distance(page)).toHaveValue('154');
    await expect(page.getByTestId('club')).toBeVisible();
  });

  test('trouble changes strategy and the safest miss', async ({ page }) => {
    await distance(page).fill('154');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await page.getByRole('button', { name: 'Short', exact: true }).click();
    await expect(page.getByTestId('club')).toHaveText('6 Iron');
    await page.getByRole('button', { name: 'Left', exact: true }).click();
    await expect(page.getByTestId('aim')).toContainText('R');
    await expect(page.getByTestId('safe-miss')).toHaveText('Safest miss: long and right.');
  });

  test('pin position gives one clear aim', async ({ page }) => {
    await distance(page).fill('154');
    await page.getByRole('radio', { name: 'Pin back-left' }).click();
    await expect(page.getByTestId('local-take')).toContainText('Favor the middle. Pin is back-left.');
    await expect(page.getByTestId('safe-miss')).toHaveText('Safest miss: short and right.');
  });

  test('invalid distance explains itself instead of guessing', async ({ page }) => {
    await distance(page).fill('900');
    await expect(page.getByTestId('recommendation')).toContainText('between 1 and 700');
    await expect(page.getByTestId('club')).toHaveCount(0);
    await distance(page).fill('');
    await expect(page.getByTestId('recommendation')).toContainText('How far to the target?');
  });

  test('new shot keeps conditions but clears the shot', async ({ page }) => {
    await distance(page).fill('140');
    await page.getByRole('radiogroup', { name: 'Quick wind speed' }).getByRole('radio', { name: '10' }).click();
    await page.getByRole('radio', { name: 'Rough', exact: true }).click();
    await page.getByTestId('new-shot').click();
    await expect(distance(page)).toHaveValue('');
    await expect(page.getByRole('radio', { name: 'Fairway' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('group', { name: 'Wind speed' })).toContainText('10 mph');
  });
});

test.describe('bag, settings and persistence', () => {
  test('editing a carry changes the recommendation and persists across reloads', async ({ page }) => {
    await seed(page);
    await page.goto('./#caddie');
    await distance(page).fill('158');
    await expect(page.getByTestId('club')).toHaveText('6 Iron');
    await page.getByTestId('open-settings').click();
    await page.getByLabel('7 Iron carry in yds').fill('158');
    await page.getByTestId('sheet-done').click();
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await page.reload();
    await expect(distance(page)).toHaveValue('158');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
  });

  test('measured shots build a club profile and feed the caddie', async ({ page }) => {
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-settings').click();
    await page.getByRole('button', { name: '7 Iron details' }).click();
    const box = page.getByTestId('club-7i');
    for (const d of ['160', '161', '159', '160', '160']) {
      await box.getByRole('textbox', { name: /Add a measured 7 Iron shot/ }).fill(d);
      await box.getByRole('button', { name: 'Add shot' }).click();
    }
    await expect(box).toContainText('160 yds');
    await expect(box).toContainText('Medium');
    await page.getByTestId('sheet-done').click();
    await distance(page).fill('160');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await expect(page.getByTestId('local-take')).toContainText('Using your recent 7-iron average of 160 (5 shots).');
  });

  test('metric units', async ({ page }) => {
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-settings').click();
    await page.getByRole('radio', { name: /Meters/ }).click();
    await page.getByTestId('sheet-done').click();
    await page.getByRole('textbox', { name: /Distance to target in m/ }).fill('139');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await expect(page.getByTestId('plays-like')).toContainText('m');
  });

  test('removing every club asks for clubs instead of breaking', async ({ page }) => {
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-settings').click();
    // .all() doesn't wait, so make sure the bag has rendered before collecting checkboxes.
    const boxes = page.getByTestId('bag').getByRole('checkbox');
    await expect(boxes).toHaveCount(14);
    for (const box of await boxes.all()) await box.uncheck();
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();
    await page.getByTestId('sheet-done').click();
    await distance(page).fill('150');
    await expect(page.getByTestId('recommendation')).toContainText('Add at least one club');
  });

  test('corrupt storage falls back to defaults', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('caddaie.profile', '{broken');
      localStorage.setItem('caddaie.situation', '"nope"');
      localStorage.setItem('caddaie.rounds', '[{"id":7}]');
    });
    await page.goto('./');
    await page.getByTestId('welcome-caddie').click();
    await distance(page).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
  });

  test('theme and privacy', async ({ page }) => {
    await seed(page);
    await page.goto('./');
    await page.getByTestId('open-settings').click();
    await page.getByRole('radio', { name: 'Sun (light)' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('privacy')).toContainText('never uploaded');
  });

  test('backup exports everything as a file', async ({ page }) => {
    await seed(page);
    await page.goto('./');
    await page.getByTestId('open-settings').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
    const text = await (await download.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(text).toString());
    expect(json.format).toBe('hitwhat-backup');
    expect(download.suggestedFilename()).toMatch(/^hitwhat-backup-/);
    expect(json.profile.clubs.length).toBeGreaterThan(5);
  });
});

test.describe('round', () => {
  test('play 18 holes in a few taps each, with feedback, then a summary', async ({ page }) => {
    await seed(page);
    await page.goto('./');
    await page.getByTestId('start-round').click();
    await page.getByTestId('course-name').fill('Pine Valley Muni');
    await page.getByTestId('tee-rating').fill('70.0');
    await page.getByLabel('Slope rating').fill('113');
    await page.getByTestId('start-round-go').click();
    await expect(page.getByTestId('hole-number')).toHaveText('Hole 1');

    // Hole 1: bogey with a three-putt and a miss right.
    const strokes = page.getByRole('radiogroup', { name: 'Strokes' });
    const putts = page.getByRole('radiogroup', { name: 'Putts' });
    await expect(page.getByTestId('save-hole')).toBeDisabled();
    await strokes.getByRole('radio', { name: '5' }).click();
    await putts.getByRole('radio', { name: '3' }).click();
    await page.getByRole('radio', { name: 'Right →' }).click();
    await page.getByTestId('save-hole').click();
    await expect(page.getByTestId('hole-number')).toHaveText('Hole 2');
    await expect(page.getByTestId('hole-feedback')).toContainText('Hole 1: Bogey');
    await expect(page.getByTestId('hole-feedback')).toContainText('+1 through 1');

    // The round survives a reload mid-round (offline-safe, saved on every tap).
    await page.reload();
    await expect(page.getByTestId('hole-number')).toHaveText('Hole 2');
    await expect(page.getByTestId('running-score')).toContainText('+1');

    // Pars on the rest: one tap for the score, one for putts.
    for (let h = 2; h <= 18; h++) {
      await strokes.getByRole('radio', { name: '4' }).click();
      await putts.getByRole('radio', { name: '2' }).click();
      await page.getByTestId('save-hole').click();
    }
    await expect(page.getByTestId('round-summary')).toBeVisible();
    await expect(page.getByTestId('summary-score')).toHaveText('73');
    await expect(page.getByTestId('summary-putts')).toContainText('37');
    await expect(page.getByTestId('summary-takeaway')).not.toBeEmpty();
    await expect(page.getByTestId('round-summary')).toContainText('Score differential 3.0');
    await page.getByTestId('summary-done').click();
    await expect(page.getByTestId('round-list')).toContainText('Pine Valley Muni');

    // Stats now has something real to say.
    await page.getByTestId('tab-stats').click();
    await expect(page.getByTestId('stat-avg')).toContainText('73.0');
    await expect(page.getByTestId('game-now')).toContainText('Putting');
  });

  test('caddie shows a hole plan during a round', async ({ page }) => {
    await seed(page);
    await page.goto('./');
    await page.getByTestId('start-round').click();
    await page.getByTestId('course-name').fill('Short Course');
    await page.getByRole('button', { name: /Add yardage/ }).click();
    await page.getByLabel('Hole 1 yards').fill('400');
    await page.getByTestId('start-round-go').click();
    await page.getByTestId('ask-caddie').click();
    await expect(page.getByTestId('hole-plan')).toContainText('Hole 1 · Par 4 · 400 yds');
    await expect(page.getByTestId('hole-plan')).toContainText('Off the tee: Driver');
    await expect(page.getByTestId('round-pill')).toContainText('Hole 1');
  });

  test('GPS shot tracking measures a shot', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40, longitude: -105, accuracy: 4 });
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('sheet-done').click();
    await page.getByTestId('tab-round').click();
    await page.getByTestId('start-round').click();
    await page.getByTestId('course-name').fill('GPS Links');
    await page.getByTestId('start-round-go').click();
    await page.getByText('Club, shots & notes').click();
    await page.getByLabel('Club for this shot').selectOption('7i');
    await page.getByTestId('mark-shot').click();
    await expect(page.getByTestId('tracker-msg')).toContainText('Marked');
    // Walk 150 yards north.
    await context.setGeolocation({ latitude: 40 + (150 * 0.9144) / 111195, longitude: -105, accuracy: 4 });
    await page.getByTestId('mark-finish').click();
    await expect(page.getByTestId('tracker-msg')).toContainText('7 Iron: 150 yds');
  });
});

test.describe('handicap', () => {
  test('from "no handicap" to an estimate, kept apart from the official index', async ({ page }) => {
    await seed(page);
    await page.goto('./#handicap');
    await expect(page.getByTestId('hcp-missing')).toContainText('No handicap yet');
    for (const score of ['90', '88', '94']) {
      await page.getByTestId('hcp-add').click();
      await page.getByTestId('score-course').fill('Muni');
      await page.getByLabel('Total score').fill(score);
      await page.getByTestId('score-rating').fill('71.0');
      await page.getByLabel('Slope rating').fill('125');
      await page.getByTestId('save-score').click();
    }
    // Differentials (113/125) × (score − 71): 17.2, 15.4, 20.8 → best (15.4) − 2.0
    await expect(page.getByTestId('hcp-number')).toHaveText('13.4');
    await expect(page.getByTestId('hcp-estimate')).toContainText('Not an official Handicap Index');
    await expect(page.getByTestId('diff-list')).toContainText('15.4');
    await expect(page.getByTestId('hcp-official')).toContainText('Not entered');
    await page.getByTestId('edit-official').click();
    await page.getByTestId('official-input').fill('12.4');
    await page.getByTestId('official-save').click();
    await expect(page.getByTestId('hcp-official')).toContainText('12.4');
    await expect(page.getByTestId('hcp-number')).toHaveText('13.4');
  });

  test('scores without rating and slope are explained, not silently dropped', async ({ page }) => {
    await seed(page);
    await page.goto('./#handicap');
    await page.getByTestId('hcp-add').click();
    await page.getByTestId('score-course').fill('Mystery CC');
    await page.getByLabel('Total score').fill('95');
    await page.getByTestId('save-score').click();
    await expect(page.getByText('Not counted yet')).toBeVisible();
    await expect(page.getByText(/needs course rating and slope/)).toBeVisible();
  });
});

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const LAT = 40;
const LON = -105;
/** A 30-yard-deep green centred 150 yards north of the golfer, tagged as hole 1. */
function greenJson() {
  const yd = (n: number) => (n * 0.9144) / 111195;
  const dx = (n: number) => (n * 0.9144) / (111195 * Math.cos((LAT * Math.PI) / 180));
  const box = [
    [135, -10],
    [135, 10],
    [165, 10],
    [165, -10],
    [135, -10],
  ].map(([n, e]) => ({ lat: LAT + yd(n), lon: LON + dx(e) }));
  return {
    elements: [
      { type: 'way', id: 1, tags: { golf: 'green' }, geometry: box },
      { type: 'way', id: 2, tags: { golf: 'hole', ref: '1', par: '4' }, geometry: [{ lat: LAT, lon: LON }, { lat: LAT + yd(150), lon: LON }] },
    ],
  };
}

test.describe('rangefinder', () => {
  test('GPS + mapped green gives front / middle / back, and hands it to the caddie', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 5 });
    await page.route(OVERPASS, (r) => r.fulfill({ json: greenJson() }));
    await page.route('https://api.open-meteo.com/v1/elevation**', (r) => r.fulfill({ json: { elevation: [1600, 1603] } }));
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-rangefinder').click();
    await expect(page.getByTestId('rf-yards')).toContainText('150');
    await expect(page.getByTestId('rf-panel')).toContainText('Front 135');
    await expect(page.getByTestId('rf-panel')).toContainText('Back 165');
    await expect(page.getByTestId('rf-panel')).toContainText('±5 yds');
    await expect(page.getByTestId('rf-panel')).toContainText('+10 ft');
    await page.getByTestId('rf-use').click();
    await expect(distance(page)).toHaveValue('150');
    await expect(page.getByTestId('green-chips')).toContainText('Front 135');
    await page.getByTestId('green-chips').getByRole('button', { name: /Back/ }).click();
    await expect(distance(page)).toHaveValue('165');
  });

  test('no map data: honest message and a way forward', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 5 });
    await page.route(OVERPASS, (r) => r.fulfill({ json: { elements: [] } }));
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-rangefinder').click();
    await expect(page.getByTestId('rf-no-targets')).toContainText('No mapped greens near you');
    await page.getByTestId('rf-help').click();
    await expect(page.getByTestId('rf-help-panel')).toContainText('LiDAR');
    await expect(page.getByTestId('rf-help-panel')).toContainText('No laser');
  });

  test('location denied is explained', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { watchPosition: (_ok: unknown, err: (e: unknown) => void) => (err({ code: 1 }), 1), clearWatch: () => {}, getCurrentPosition: (_o: unknown, err: (e: unknown) => void) => err({ code: 1 }) },
      });
    });
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('open-rangefinder').click();
    await expect(page.getByTestId('rf-panel')).toContainText('Location is off');
    await page.getByTestId('rf-manual').click();
    await expect(page.getByTestId('rangefinder')).toHaveCount(0);
    await expect(distance(page)).toBeFocused();
  });
});

test.describe('swing', () => {
  test('setup guide for each angle, with privacy stated', async ({ page }) => {
    await seed(page);
    await page.goto('./#swing');
    await expect(page.getByText('Videos and analysis stay on this phone')).toBeVisible();
    await page.getByTestId('angle-dtl').click();
    await expect(page.getByTestId('swing-capture')).toContainText('behind you, on a line from your hands toward the target');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('angle-face-on').click();
    await expect(page.getByTestId('swing-capture')).toContainText('facing your chest');
  });

  test('analysis runs on-device and says honestly when there is no swing to measure', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('./#swing');
    await page.getByTestId('swing-from-library').click();
    await page.getByTestId('swing-file').setInputFiles('tests/e2e/fixtures/standing.webm');
    await expect(page.getByTestId('review-video')).toBeVisible();
    await page.getByTestId('analyze-swing').click();
    // A person standing still: the model finds the golfer, but there's no swing to measure.
    await expect(page.getByTestId('swing-error')).toContainText('full swing', { timeout: 100_000 });
  });
});

test.describe('live conditions', () => {
  test('GPS denied keeps the manual path', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: (_ok: unknown, err: (e: unknown) => void) => err({ code: 1 }) },
      });
    });
    await seed(page);
    await page.goto('./#caddie');
    await page.getByTestId('live-weather').click();
    await expect(page.getByTestId('live-error')).toContainText('Location is off');
    await distance(page).fill('150');
    await expect(page.getByTestId('club')).toBeVisible();
  });

  test('live weather fills wind, then aiming direction places it', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 39.74, longitude: -104.99 });
    await page.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({ json: { elevation: 1609, current: { temperature_2m: 60, wind_speed_10m: 12, wind_direction_10m: 0, wind_gusts_10m: 14 } } }),
    );
    await seed(page);
    await page.goto('./#caddie');
    await distance(page).fill('150');
    await page.getByTestId('live-weather').click();
    await expect(page.getByTestId('live-ok')).toContainText('12 mph');
    await page.getByRole('radiogroup', { name: 'Direction you are hitting' }).getByRole('radio', { name: 'N', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Into your face' })).toHaveAttribute('aria-checked', 'true');
    await page.getByText('The math').click();
    await expect(page.getByTestId('math')).toContainText('12 mph into');
    await expect(page.getByTestId('math')).toContainText('altitude');
  });
});

test.describe('offline', () => {
  test('scoring and the caddie work offline after the first visit', async ({ page, context }) => {
    await seed(page);
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('start-round').click();
    await page.getByTestId('course-name').fill('No Signal GC');
    await page.getByTestId('start-round-go').click();
    await page.getByRole('radiogroup', { name: 'Strokes' }).getByRole('radio', { name: '4' }).click();
    await page.getByTestId('save-hole').click();
    await expect(page.getByTestId('hole-number')).toHaveText('Hole 2');
    await page.getByTestId('tab-caddie').click();
    await distance(page).fill('152');
    await expect(page.getByTestId('club')).toHaveText('7 Iron');
    await context.setOffline(false);
  });
});

test.describe('distances and practice', () => {
  test('a range session fills the ladder and the caddie switches to the real number', async ({ page }) => {
    await seed(page);
    await page.goto('./#stats');
    // No rounds yet, but the bag and a practice plan still show.
    await expect(page.getByTestId('ladder-9i')).toContainText('Typed');
    await expect(page.getByTestId('practice-plan')).toContainText('Measure your 8 Iron, 9 Iron and 7 Iron');
    await page.getByTestId('open-practice').click();
    await page.getByRole('radio', { name: '9i', exact: true }).click();
    const carry = page.getByRole('textbox', { name: /Carry in/ });
    for (const d of ['134', '136', '135', '133']) {
      await carry.fill(d);
      await carry.press('Enter');
    }
    await page.getByRole('radio', { name: 'Mishit' }).click();
    await carry.fill('90');
    await page.getByTestId('log-range-shot').click();
    await expect(page.getByTestId('range-club-status')).toContainText('4 of 5 full shots');
    await page.getByRole('radio', { name: 'Good full swing' }).click();
    await carry.fill('137');
    await page.getByTestId('log-range-shot').click();
    await expect(page.getByTestId('range-club-status')).toContainText('your average is 135 yds from 5 shots');
    // Undo is one tap.
    await page.getByRole('button', { name: 'Remove 9 Iron 90 yds mishit' }).click();
    await expect(page.getByTestId('range-log')).toContainText('5 shots · avg 135 yds');
    await page.getByTestId('sheet-done').click();
    await expect(page.getByTestId('ladder-9i')).toContainText('5 shots');
    await expect(page.getByTestId('ladder-9i')).toContainText('135');
    await page.getByTestId('tab-caddie').click();
    await distance(page).fill('135');
    await expect(page.getByTestId('club')).toHaveText('9 Iron');
    await expect(page.getByTestId('local-take')).toContainText('Using your recent 9-iron average of 135 (5 shots).');
  });

  test('gaps in the bag are called out with a range job', async ({ page }) => {
    await seed(page);
    await page.goto('./#round');
    await page.getByTestId('open-settings').click();
    await page.getByRole('checkbox', { name: 'Gap Wedge' }).uncheck();
    await page.getByTestId('sheet-done').click();
    await page.getByTestId('tab-stats').click();
    await expect(page.getByTestId('ladder-gap')).toHaveText('28 yds gap — no full swing for this');
    await expect(page.getByTestId('practice-plan')).toContainText('Fill the 28 yds gap');
  });
});

test.describe('mobile layout', () => {
  test('every tab: no horizontal scroll and big touch targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await seed(page);
    await page.goto('./');
    for (const tab of ['round', 'caddie', 'stats', 'swing', 'handicap']) {
      await page.getByTestId(`tab-${tab}`).click();
      await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute('aria-current', 'page');
      if (tab === 'caddie') await distance(page).fill('150');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, tab).toBeLessThanOrEqual(0);
      const small = await page.$$eval('button, a.tab', (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({ t: e.textContent?.trim() || e.getAttribute('aria-label'), r: e.getBoundingClientRect() }))
          .filter(({ r }) => r.height < 40 || r.width < 40)
          .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`),
      );
      expect(small, tab).toEqual([]);
    }
  });
});
