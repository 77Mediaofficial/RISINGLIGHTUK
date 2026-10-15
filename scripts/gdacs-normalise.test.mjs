// node --test scripts/*.test.mjs   (Node expands the glob itself, so this also works in PowerShell;
//                                   a bare folder, `node --test scripts/`, fails on Node 22+)
// Fixtures (real GDACS responses, fetched 15 Oct 2026 08:38-08:39 UTC):
//   fixtures/gdacs-search-2026-10-15.json        the exact SEARCH call the snapshot makes
//                                                (fromDate 2026-09-15): 15 features, 4 current
//   fixtures/gdacs-search-12-months-sample.json  20 features cut from a 12-month SEARCH, up to two
//                                                per type and alert level (all six types, Red too)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  normaliseGdacs, normaliseGdacsDetailed, serialiseSnapshot, sameContent,
  cleanText, toUtcIso, gdacsUrl, MAX_EVENTS
} from './gdacs-normalise.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8'));
const GEN = '2026-10-15T09:00:00Z';
const EVENT_KEYS = ['id', 'lat', 'lng', 'title', 'priority', 'description', 'type', 'typeLabel', 'alert',
  'severityText', 'country', 'place', 'from', 'to', 'url'];

/* a minimal valid feature; override any property */
function feature(props = {}, coords = [10, 20], geometryType = 'Point') {
  return {
    type: 'Feature',
    geometry: { type: geometryType, coordinates: coords },
    properties: Object.assign({
      eventtype: 'EQ', eventid: 1, episodeid: 1, eventname: '', name: 'Earthquake in Testland',
      alertlevel: 'Orange', alertscore: 2, iscurrent: 'true', country: 'Testland',
      fromdate: '2026-10-10T00:00:00', todate: '2026-10-10T00:00:00',
      affectedcountries: [{ iso3: 'TST', countryname: 'Testland' }],
      severitydata: { severity: 6.1, severitytext: 'Magnitude 6.1M', severityunit: 'M' },
      url: { report: 'https://www.gdacs.org/report.aspx?eventid=1&episodeid=1&eventtype=EQ' }
    }, props)
  };
}
const fc = (features) => ({ type: 'FeatureCollection', features });

test('real SEARCH response: the 4 events GDACS marks current, in order, mapped field by field', () => {
  const { snapshot: s, stats } = normaliseGdacsDetailed(load('gdacs-search-2026-10-15.json'), { generatedAt: GEN });
  assert.deepEqual(stats, { raw: 15, valid: 15, invalid: 0, current: 4, kept: 4, dropped: 0, unknownCurrent: 0, unknownAlert: 0 });
  assert.equal(s.source, 'GDACS');
  assert.equal(s.sourceName, 'Global Disaster Awareness and Coordination System');
  assert.equal(s.sourceUrl, 'https://www.gdacs.org/');
  assert.equal(s.generatedAt, GEN);
  assert.equal(s.count, 4);
  assert.equal(s.dropped, 0);
  /* all Orange today, so most recent todate first */
  assert.deepEqual(s.events.map((e) => e.id), ['TC-1001338', 'TC-1001335', 'DR-1018332', 'TC-1001334']);
  const champi = s.events[0];
  assert.deepEqual(Object.keys(champi), EVENT_KEYS);
  assert.deepEqual(champi, {
    id: 'TC-1001338', lat: 10.9, lng: 158.4, /* GeoJSON [158.4, 10.9] → lat 10.9, lng 158.4 */
    title: 'Tropical Cyclone CHAMPI-26', priority: 1,
    description: "Orange is the middle of GDACS's three alert levels (Green, Orange, Red) for the possible need for international assistance.",
    type: 'TC', typeLabel: 'Tropical cyclone', alert: 'Orange',
    severityText: 'Maximum wind 231 km/h', /* rebuilt from 231.48 km/h, not the misleading stage text */
    country: 'Guam, Northern Mariana Islands', place: 'CHAMPI-26',
    from: '2026-10-14T12:00:00Z', to: '2026-10-15T06:00:00Z',
    url: 'https://www.gdacs.org/report.aspx?eventid=1001338&episodeid=4&eventtype=TC'
  });
  const drought = s.events[2];
  assert.equal(drought.title, 'Drought Europe-2026'); /* the 311-character name is not used */
  assert.equal(drought.country, 'Austria and 28 more countries');
  assert.equal(drought.place, 'Europe-2026');
  assert.equal(drought.severityText, '1,759,971 km² affected');
  assert.equal(drought.from, '2025-12-21T00:00:00Z');
  /* the three Orange droughts with the same todate that GDACS marks past are NOT here */
  assert.ok(!s.events.some((e) => ['DR-1027449', 'DR-1027465', 'DR-1027450'].includes(e.id)));
  const isaias = s.events[3];
  assert.equal(isaias.lat, 37.5);
  assert.equal(isaias.lng, -84);
  assert.equal(isaias.country, 'United States');
});

test('real 12-month sample: Red first, every type labelled, severity only where it means something', () => {
  const raw = load('gdacs-search-12-months-sample.json');
  for (const f of raw.features) f.properties.iscurrent = 'true'; /* exercise Red: none is current today */
  const s = normaliseGdacs(raw, { generatedAt: GEN });
  assert.equal(s.count, 20);
  const firstOrange = s.events.findIndex((e) => e.alert === 'Orange');
  assert.ok(firstOrange > 0);
  assert.ok(s.events.slice(0, firstOrange).every((e) => e.alert === 'Red' && e.priority === 2));
  assert.ok(s.events.slice(firstOrange).every((e) => e.alert === 'Orange' && e.priority === 1));
  for (const tier of [s.events.slice(0, firstOrange), s.events.slice(firstOrange)]) {
    for (let i = 1; i < tier.length; i++) assert.ok(tier[i - 1].to >= tier[i].to, 'most recent first within a tier');
  }
  const labels = new Set(s.events.map((e) => `${e.type}:${e.typeLabel}`));
  for (const l of ['EQ:Earthquake', 'TC:Tropical cyclone', 'FL:Flood', 'VO:Volcano', 'DR:Drought', 'WF:Wildfire']) assert.ok(labels.has(l), l);
  for (const e of s.events) {
    if (e.type === 'FL' || e.type === 'VO') assert.equal(e.severityText, '', `${e.id} severity`);
    if (e.type === 'EQ') assert.match(e.severityText, /^Magnitude \d\.\d$/);
    if (e.type === 'TC') assert.match(e.severityText, /^Maximum wind \d+ km\/h$/);
    if (e.type === 'WF') assert.match(e.severityText, /^[\d,]+ hectares burnt$/);
    assert.ok(Number.isFinite(e.lat) && Number.isFinite(e.lng));
    assert.ok(e.url.startsWith('https://www.gdacs.org/'));
    assert.ok(!/\s{2}/.test(e.title) && !/[\s,]$/.test(e.title), `clean title: ${e.title}`);
  }
  const kanlaon = s.events.find((e) => e.id === 'VO-1000152');
  assert.equal(kanlaon.title, 'Eruption Kanlaon'); /* "Eruption  Kanlaon": double space collapsed */
  assert.ok(s.events.some((e) => e.severityText === '18,310 hectares burnt'));
  assert.ok(s.events.some((e) => e.severityText === 'Magnitude 7.7'));
});

test('iscurrent is a string: "false" (truthy) is excluded, boolean true accepted', () => {
  const s = normaliseGdacs(fc([
    feature({ eventid: 1, iscurrent: 'false' }),
    feature({ eventid: 2, iscurrent: 'true' }),
    feature({ eventid: 3, iscurrent: true }),
    feature({ eventid: 4, iscurrent: undefined }),
    feature({ eventid: 5, iscurrent: 'TRUE' })
  ]), { generatedAt: GEN });
  assert.deepEqual(s.events.map((e) => e.id).sort(), ['EQ-2', 'EQ-3']);
});

test('iscurrent / alertlevel values GDACS has never used are counted (a format change, not a quiet day)', () => {
  const { stats } = normaliseGdacsDetailed(fc([
    feature({ eventid: 1, iscurrent: 'True' }),
    feature({ eventid: 2, iscurrent: 'False' }),
    feature({ eventid: 3, iscurrent: 'false', alertlevel: 'Green' }),
    feature({ eventid: 4, alertlevel: undefined, alert_level: 'Orange' })
  ]), { generatedAt: GEN });
  assert.equal(stats.unknownCurrent, 2);
  assert.equal(stats.unknownAlert, 1);
  assert.equal(stats.kept, 0);
});

test('alert levels are looked up as own keys only ("__proto__" is not a level)', () => {
  const { snapshot: s, stats } = normaliseGdacsDetailed(fc([
    feature({ eventid: 1, alertlevel: '__proto__' }),
    feature({ eventid: 2, alertlevel: 'constructor' }),
    feature({ eventid: 3, alertlevel: 'valueOf' }),
    feature({ eventid: 4, alertlevel: 'Orange' })
  ]), { generatedAt: GEN });
  assert.deepEqual(s.events.map((e) => [e.id, e.priority, typeof e.description]), [['EQ-4', 1, 'string']]);
  assert.equal(stats.unknownAlert, 3);
});

test('Green alerts and unknown levels are filtered; the event level decides, not the episode', () => {
  const s = normaliseGdacs(fc([
    feature({ eventid: 1, alertlevel: 'Green' }),
    feature({ eventid: 2, alertlevel: 'Purple' }),
    feature({ eventid: 3, alertlevel: 'red' }),
    feature({ eventid: 4, alertlevel: 'Orange', episodealertlevel: 'Green' })
  ]), { generatedAt: GEN });
  assert.deepEqual(s.events.map((e) => [e.id, e.alert, e.priority]), [['EQ-3', 'Red', 2], ['EQ-4', 'Orange', 1]]);
});

test('unusable features are skipped and counted: coordinates, geometry, type, id', () => {
  const { snapshot: s, stats } = normaliseGdacsDetailed(fc([
    feature({ eventid: 1 }, []),
    feature({ eventid: 2 }, [10]),
    feature({ eventid: 3 }, ['x', 'y']),
    feature({ eventid: 4 }, [200, 10]),
    feature({ eventid: 5 }, [10, -91]),
    feature({ eventid: 6 }, [NaN, 10]),
    feature({ eventid: 7 }, [[10, 20]], 'Polygon'),
    feature({ eventid: 8, eventtype: 'XX' }),
    feature({ eventid: 'abc' }),
    feature({ eventid: 9.5 }),
    { type: 'Feature', properties: { eventtype: 'EQ', eventid: 10 } },
    null, 42, 'feature',
    feature({ eventid: 11 }, ['12.5', '-45.25']), /* numeric strings are fine */
    feature({ eventid: 12 }, [180, 90])
  ]), { generatedAt: GEN });
  assert.equal(stats.raw, 16);
  assert.equal(stats.valid, 2);
  assert.equal(stats.invalid, 14);
  assert.deepEqual(s.events.map((e) => [e.id, e.lat, e.lng]).sort(), [['EQ-11', -45.25, 12.5], ['EQ-12', 90, 180]]);
});

test('only https://www.gdacs.org/ links survive', () => {
  assert.equal(gdacsUrl('https://www.gdacs.org/report.aspx?eventid=1'), 'https://www.gdacs.org/report.aspx?eventid=1');
  for (const bad of ['http://www.gdacs.org/report.aspx', 'https://gdacs.org/x', 'https://www.gdacs.org.evil.example/x',
    'https://www.gdacs.org@evil.example/', 'https://user:pw@www.gdacs.org/', 'https://www.gdacs.org:8443/x',
    'javascript:alert(1)', 'report.aspx?eventid=1', ' ', 42, null, undefined]) {
    assert.equal(gdacsUrl(bad), '', String(bad));
  }
  const s = normaliseGdacs(fc([
    feature({ eventid: 1, url: { report: 'https://evil.example/report' } }),
    feature({ eventid: 2, url: 'not an object' }),
    feature({ eventid: 3 })
  ]), { generatedAt: GEN });
  const byId = Object.fromEntries(s.events.map((e) => [e.id, e.url]));
  assert.equal(byId['EQ-1'], '');
  assert.equal(byId['EQ-2'], '');
  assert.ok(byId['EQ-3'].startsWith('https://www.gdacs.org/'));
});

test('duplicate episodes of one event collapse to the latest episode', () => {
  const s = normaliseGdacs(fc([
    feature({ eventtype: 'TC', eventid: 7, episodeid: 3, name: 'Tropical Cyclone OLD-26', todate: '2026-10-12T00:00:00' }),
    feature({ eventtype: 'TC', eventid: 7, episodeid: 5, name: 'Tropical Cyclone NEW-26', todate: '2026-10-14T00:00:00' }),
    feature({ eventtype: 'TC', eventid: 7, episodeid: 4, name: 'Tropical Cyclone MID-26', todate: '2026-10-13T00:00:00' }),
    feature({ eventtype: 'EQ', eventid: 7 }) /* same id, different type: a different event */
  ]), { generatedAt: GEN });
  assert.equal(s.count, 2);
  assert.equal(s.events.find((e) => e.id === 'TC-7').title, 'Tropical Cyclone NEW-26');
  assert.ok(s.events.some((e) => e.id === 'EQ-7'));
});

test('a genuinely empty feed is a valid empty list', () => {
  const { snapshot: s, stats } = normaliseGdacsDetailed(fc([]), { generatedAt: GEN });
  assert.deepEqual(s.events, []);
  assert.equal(s.count, 0);
  assert.equal(stats.raw, 0);
  /* features present but none current: also valid and empty */
  const s2 = normaliseGdacs(fc([feature({ iscurrent: 'false' })]), { generatedAt: GEN });
  assert.equal(s2.count, 0);
});

test('garbage input throws (the snapshot then keeps its last good file)', () => {
  for (const bad of [null, undefined, '', 'x', 42, [], {}, { features: 'no' }, { features: null }, { type: 'FeatureCollection' }]) {
    assert.throws(() => normaliseGdacs(bad, { generatedAt: GEN }), TypeError, JSON.stringify(bad));
  }
  assert.throws(() => normaliseGdacs(fc([]), { generatedAt: 'not a date' }), TypeError);
});

test('the list is capped (Red kept first) and the overflow counted', () => {
  const feats = [];
  for (let i = 1; i <= 70; i++) {
    feats.push(feature({ eventid: i, alertlevel: i % 10 === 0 ? 'Red' : 'Orange', todate: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00` }));
  }
  const s = normaliseGdacs(fc(feats), { generatedAt: GEN });
  assert.equal(MAX_EVENTS, 60);
  assert.equal(s.count, 60);
  assert.equal(s.dropped, 10);
  assert.deepEqual(s.events.slice(0, 7).map((e) => e.alert), Array(7).fill('Red'));
  const small = normaliseGdacs(fc(feats), { generatedAt: GEN, max: 5 });
  assert.equal(small.count, 5);
  assert.equal(small.dropped, 65);
});

test('strings are cleaned and capped; long multi-country names are summarised', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ countryname: `Country ${i + 1}` }));
  const s = normaliseGdacs(fc([
    feature({
      eventid: 1, eventtype: 'DR', eventname: '',
      name: 'Drought in ' + many.map((c) => c.countryname).join(',  ') + ', ',
      country: many.map((c) => c.countryname).join(', '), affectedcountries: many,
      severitydata: { severity: 1234.4, severityunit: 'km2' }
    }),
    feature({ eventid: 2, name: 'Earthquake\u0000 in\u202E  Bad\tPlace , ', country: ' Bad\u200BPlace ' })
  ]), { generatedAt: GEN });
  const dr = s.events.find((e) => e.id === 'DR-1');
  assert.ok(Array.from(dr.title).length <= 80, dr.title);
  assert.ok(dr.title.endsWith('…'));
  assert.equal(dr.country, 'Country 1 and 11 more countries');
  assert.equal(dr.place, 'Country 1');
  assert.equal(dr.severityText, '1,234 km² affected');
  const eq = s.events.find((e) => e.id === 'EQ-2');
  assert.equal(eq.title, 'Earthquake in Bad Place');
  assert.equal(eq.country, 'Bad Place');
  /* GDACS sent "Mexico, México" for SIMON-26 on 15 Oct 2026 */
  const mx = normaliseGdacs(fc([feature({ country: 'Mexico, México', affectedcountries: [{ countryname: 'Mexico' }] })]), { generatedAt: GEN });
  assert.equal(mx.events[0].country, 'Mexico');
  /* no country text: the joined country names are capped too (3 x 60 would be 184 characters) */
  const long = (c) => ({ countryname: 'A'.repeat(70) + c });
  const nc = normaliseGdacs(fc([feature({ country: '', affectedcountries: [long('x'), long('y'), long('z')] })]), { generatedAt: GEN });
  assert.ok(Array.from(nc.events[0].country).length <= 120, String(nc.events[0].country.length));
  assert.equal(cleanText('  a \n\n b ,, ', 0), 'a b');
  assert.equal(cleanText(42), '');
  assert.equal(Array.from(cleanText('x'.repeat(500), 40)).length, 40);
});

test('dates without an offset are read as UTC', () => {
  assert.equal(toUtcIso('2026-10-14T12:00:00'), '2026-10-14T12:00:00Z');
  assert.equal(toUtcIso('2026-10-14T12:00:00Z'), '2026-10-14T12:00:00Z');
  assert.equal(toUtcIso('2026-10-14T13:00:00+01:00'), '2026-10-14T12:00:00Z');
  assert.equal(toUtcIso('2026-10-09T17:56:06.036'), '2026-10-09T17:56:06Z');
  for (const bad of ['', '14 Oct 2026', '2026-13-40T99:00:00', null, 0]) assert.equal(toUtcIso(bad), '', String(bad));
});

test('output is deterministic: fixed key order, 2-space JSON, LF, one trailing newline', () => {
  const raw = load('gdacs-search-2026-10-15.json');
  const a = serialiseSnapshot(normaliseGdacs(raw, { generatedAt: GEN }));
  const b = serialiseSnapshot(normaliseGdacs(structuredClone(raw), { generatedAt: new Date(GEN) }));
  assert.equal(a, b);
  assert.ok(a.endsWith('}\n') && !a.endsWith('\n\n'));
  assert.ok(!a.includes('\r'));
  assert.ok(a.startsWith('{\n  "source": "GDACS",\n  "sourceName"'));
  const parsed = JSON.parse(a);
  assert.deepEqual(Object.keys(parsed), ['source', 'sourceName', 'sourceUrl', 'generatedAt', 'count', 'dropped', 'events']);
  /* only generatedAt differs between runs on the same data */
  const later = normaliseGdacs(raw, { generatedAt: '2026-10-15T15:00:00Z' });
  assert.ok(sameContent(parsed, later));
  later.events[0].title = 'changed';
  assert.ok(!sameContent(parsed, later));
});

/* ── the snapshot script itself, offline (--input) ── */
const SCRIPT = join(HERE, 'gdacs-snapshot.mjs');
function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, GDACS_ATTEMPTS: '1' } });
}

test('snapshot script: writes once, leaves an unchanged file byte-identical, keeps the file on failure', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gdacs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'data', 'gdacs.json');
  const fixture = join(HERE, 'fixtures', 'gdacs-search-2026-10-15.json');

  let r = run(['--input', fixture, '--out', out, '--now', '2026-10-15T09:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  const first = readFileSync(out, 'utf8');
  assert.equal(JSON.parse(first).count, 4);
  assert.equal(JSON.parse(first).generatedAt, '2026-10-15T09:00:00Z');
  const mtime = statSync(out).mtimeMs;

  /* same alerts six hours later: no write at all, so no commit */
  r = run(['--input', fixture, '--out', out, '--now', '2026-10-15T15:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unchanged/);
  assert.equal(readFileSync(out, 'utf8'), first);
  assert.equal(statSync(out).mtimeMs, mtime);

  /* failures: garbage, wrong shape, all features unusable → exit 1, file untouched */
  const garbage = join(dir, 'garbage.txt');
  writeFileSync(garbage, '<html>Request rejected</html>');
  const shape = join(dir, 'shape.json');
  writeFileSync(shape, JSON.stringify({ type: 'FeatureCollection', items: [] }));
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, JSON.stringify(fc([feature({}, []), feature({}, [999, 999])])));
  /* a GDACS format change that would otherwise publish an empty list: "True" / "False", a renamed alertlevel */
  const recased = join(dir, 'recased.json');
  writeFileSync(recased, JSON.stringify(fc([feature({ iscurrent: 'True' }), feature({ eventid: 2, iscurrent: 'False' })])));
  const renamed = join(dir, 'renamed.json');
  writeFileSync(renamed, JSON.stringify(fc([feature({ alertlevel: undefined, alert_level: 'Orange' })])));
  for (const bad of [garbage, shape, broken, recased, renamed]) {
    r = run(['--input', bad, '--out', out, '--now', '2026-10-16T09:00:00Z']);
    assert.equal(r.status, 1, `${bad}: ${r.stdout}`);
    assert.match(r.stderr, /not changed/);
    assert.equal(readFileSync(out, 'utf8'), first);
  }

  /* an empty body (GDACS's 204 No Content) is a valid empty list */
  const empty = join(dir, 'empty.body');
  writeFileSync(empty, '');
  r = run(['--input', empty, '--out', out, '--now', '2026-10-16T09:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  const emptied = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(emptied.count, 0);
  assert.deepEqual(emptied.events, []);
  assert.equal(emptied.generatedAt, '2026-10-16T09:00:00Z');

  /* a quiet day (every feature GDACS sends is marked "false") is still a valid empty list */
  const quiet = join(dir, 'quiet.json');
  writeFileSync(quiet, JSON.stringify(fc([feature({ iscurrent: 'false' })])));
  const out2 = join(dir, 'data', 'quiet-out.json');
  r = run(['--input', quiet, '--out', out2, '--now', '2026-10-16T09:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(out2, 'utf8')).count, 0);
});

test('snapshot script: weekly heartbeat (unchanged + young: byte-identical; unchanged + over 7 days old: only generatedAt changes)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gdacs-hb-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'gdacs.json');
  const fixture = join(HERE, 'fixtures', 'gdacs-search-2026-10-15.json');
  const at = (now) => run(['--input', fixture, '--out', out, '--now', now]);

  let r = at('2026-10-15T09:00:00Z');
  assert.equal(r.status, 0, r.stderr);
  const first = readFileSync(out, 'utf8');
  const mtime = statSync(out).mtimeMs;

  /* unchanged and exactly 7 days old: still young, so no write at all (no commit) */
  r = at('2026-10-22T09:00:00Z');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unchanged since/);
  assert.equal(readFileSync(out, 'utf8'), first);
  assert.equal(statSync(out).mtimeMs, mtime);

  /* unchanged and one second over 7 days old: rewritten, and the generatedAt line is the only difference */
  r = at('2026-10-22T09:00:01Z');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /heartbeat/);
  const second = readFileSync(out, 'utf8');
  assert.equal(JSON.parse(second).generatedAt, '2026-10-22T09:00:01Z');
  const a = first.split('\n'), b = second.split('\n');
  assert.equal(b.length, a.length);
  assert.deepEqual(b.filter((line, i) => line !== a[i]), ['  "generatedAt": "2026-10-22T09:00:01Z",']);
  assert.ok(sameContent(JSON.parse(first), JSON.parse(second)));

  /* the heartbeat restarts the clock: six hours later the file is young again and left alone */
  r = at('2026-10-22T15:00:01Z');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unchanged since/);
  assert.equal(readFileSync(out, 'utf8'), second);

  /* a missing or unreadable generatedAt counts as old, so the heartbeat repairs it */
  writeFileSync(out, second.replace('"generatedAt": "2026-10-22T09:00:01Z"', '"generatedAt": "not a date"'));
  r = at('2026-10-22T16:00:00Z');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /heartbeat/);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).generatedAt, '2026-10-22T16:00:00Z');
});
