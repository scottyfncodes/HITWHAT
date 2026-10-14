import { describe, expect, it } from 'vitest';
import { fromLocal } from '../../src/core/geo';
import { buildBackup, parseBackup } from '../../src/state/backup';
import { loadGolf, sanitizeGolf, sanitizeRound, saveGolf } from '../../src/state/golf';
import { defaultProfile, sanitizeProfile } from '../../src/state/profile';
import { cachedMap, coursesQuery, loadCourseMap, mapCell, parseCourses, parseFeatures } from '../../src/services/osm';
import { terrainElevations } from '../../src/services/sensors';
import { memoryStore } from './helpers';
import { manual, played } from './rounds';

describe('golf data persistence', () => {
  it('round-trips rounds, courses and shots', () => {
    const store = memoryStore();
    const data = { rounds: [played(2), manual(90)], courses: [], shots: [], practice: [] };
    expect(saveGolf(data, store)).toBe(true);
    const back = loadGolf(store);
    expect(back.rounds).toHaveLength(2);
    expect(back.rounds[0].holes[0].strokes).toBe(5);
  });

  it('sanitises junk instead of crashing', () => {
    expect(sanitizeRound({ id: 'x' })).toBeNull();
    expect(sanitizeRound('nope')).toBeNull();
    const r = sanitizeRound({ id: 'ok', date: 1, holes: [{ strokes: 99, putts: -1, fairway: 'water' }], tee: { par: [9, 4] } })!;
    expect(r.holes).toHaveLength(18);
    expect(r.holes[0].strokes).toBeNull();
    expect(r.holes[0].fairway).toBeNull();
    expect(r.tee.par).toHaveLength(18);
  });

  it('rounds saved before the HitWhat rename still load as played-in-app rounds', () => {
    const r = sanitizeRound({ ...played(1), source: 'caddaie', status: 'active' })!;
    expect(r.source).toBe('app');
    expect(r.status).toBe('active');
    expect(r.holes[0].strokes).not.toBeNull();
  });

  it('only one round can be active', () => {
    const a = { ...played(0), status: 'active', date: 1 };
    const b = { ...played(0), status: 'active', date: 2 };
    const g = sanitizeGolf({ rounds: [a, b] });
    expect(g.rounds.filter((r) => r.status === 'active').map((r) => r.id)).toEqual([b.id]);
  });

  it('new profile fields have safe defaults and limits', () => {
    const p = sanitizeProfile({ officialIndex: 99, theme: 'neon', flagVfov: 63, clubNotes: { '7i': 'draws', x: 5 } });
    expect(p.officialIndex).toBeNull();
    expect(p.theme).toBe('auto');
    expect(p.flagVfov).toBe(63);
    expect(p.clubNotes).toEqual({ '7i': 'draws' });
    expect(sanitizeProfile({ officialIndex: 0 }).officialIndex).toBe(0);
    expect(sanitizeProfile({ officialIndex: -2.1 }).officialIndex).toBe(-2.1);
  });
});

describe('backup', () => {
  it('round-trips and rejects other files', () => {
    const text = JSON.stringify(buildBackup(defaultProfile(), { rounds: [played(1)], courses: [], shots: [], practice: [] }, [], 5));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.golf.rounds).toHaveLength(1);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('restores backups made before the HitWhat rename', () => {
    const old = { ...buildBackup(defaultProfile(), { rounds: [played(1)], courses: [], shots: [], practice: [] }, [], 5), format: 'caddaie-backup' };
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.golf.rounds[0].source).toBe('app');
  });
});

describe('OpenStreetMap course data', () => {
  const O = { lat: 40, lon: -105 };
  const at = (n: number, e: number) => fromLocal(O, e * 0.9144, n * 0.9144);

  it('builds a query and lists nearby courses nearest first', () => {
    expect(coursesQuery(O)).toContain('leisure');
    const list = parseCourses(
      { elements: [{ type: 'way', id: 2, tags: { name: 'Far' }, center: at(2000, 0) }, { type: 'relation', id: 1, tags: { name: 'Near' }, center: at(100, 0) }, { type: 'way', id: 3 }] },
      O,
    );
    expect(list.map((c) => c.name)).toEqual(['Near', 'Far']);
    expect(list[0].osmId).toBe('relation/1');
  });

  it('matches greens to holes and reads par and stroke index', () => {
    const green = [at(140, -10), at(140, 10), at(160, 10), at(160, -10)];
    const map = parseFeatures(
      {
        elements: [
          { type: 'way', id: 9, tags: { golf: 'green' }, geometry: green },
          { type: 'way', id: 8, tags: { golf: 'hole', ref: '3', par: '4', handicap: '7' }, geometry: [at(-200, 0), at(150, 0)] },
          { type: 'way', id: 7, tags: { golf: 'hole', ref: 'x' }, geometry: [at(0, 0), at(1, 1)] },
        ],
      },
      O,
      1,
    );
    expect(map.holes).toEqual([{ ref: 3, par: 4, strokeIndex: 7, line: [at(-200, 0), at(150, 0)] }]);
    expect(map.greens[0].hole).toBe(3);
    expect(map.greens[0].label).toBe('Green 3');
  });

  it('caches maps so the course works offline next time', async () => {
    const store = memoryStore();
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    }) as typeof fetch;
    const first = await loadCourseMap(O, store, { fetchImpl });
    const second = await loadCourseMap(at(200, 0), store, { fetchImpl });
    expect(first.ok && !first.cached).toBe(true);
    expect(second.ok && second.cached).toBe(true);
    expect(calls).toBe(1);
    expect(cachedMap(at(5000, 0), store)).toBeNull();
    expect(mapCell(O)).toBe('40.000,-105.000');
  });

  it('a failed map request is reported, not thrown', async () => {
    const fetchImpl = (async () => new Response('busy', { status: 429 })) as typeof fetch;
    const r = await loadCourseMap(O, memoryStore(), { fetchImpl });
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('terrain elevation', () => {
  it('parses Open-Meteo and rejects bad payloads', async () => {
    const ok = (async () => new Response(JSON.stringify({ elevation: [10, 13] }))) as typeof fetch;
    expect(await terrainElevations([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], ok)).toEqual([10, 13]);
    const bad = (async () => new Response(JSON.stringify({ elevation: [10] }))) as typeof fetch;
    expect(await terrainElevations([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], bad)).toBeNull();
  });
});
