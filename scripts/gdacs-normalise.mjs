// GDACS (Global Disaster Awareness and Coordination System) → the CH.05 globe's alert list.
// Pure and dependency-free: the same input always gives the same output, so "did the data
// change?" is a plain byte comparison (and a plain git diff) of the serialised snapshot.
//
// Input: the GeoJSON FeatureCollection from
//   https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
// Output: { source, sourceName, sourceUrl, generatedAt, count, dropped, events[] }, each event
//   { id, lat, lng, title, priority, description, type, typeLabel, alert, severityText,
//     country, place, from, to, url }
//
// Rules (from the 15 Oct 2026 research brief, checked against live responses):
// - keep only features GDACS itself marks current: properties.iscurrent is the STRING "true"
//   (a truthiness test would keep "false"); never a home-made "recent" rule, because GDACS
//   marks some droughts with fresh dates as past
// - keep the EVENT alert level (alertlevel), Orange and Red only; Green is dropped
// - coordinates are GeoJSON [lng, lat]; both must be finite and in range
// - dates carry no offset but are UTC: "Z" is appended before parsing
// - one entry per eventtype + eventid (the latest episode wins)
// - Red first, then the most recently updated; at most MAX_EVENTS, the rest counted in `dropped`
// - strings are cleaned (control and bidirectional characters removed, whitespace collapsed,
//   trailing commas trimmed) and length-capped
// - a link is kept only when it is an https://www.gdacs.org/ address
// - severity is shown only where its number means something for that type (never compared
//   across types: the units differ and flood / volcano severity is always 0)

export const GDACS_SITE = 'https://www.gdacs.org/';
export const GDACS_NAME = 'Global Disaster Awareness and Coordination System';
export const MAX_EVENTS = 60;

export const TYPE_LABELS = Object.freeze({
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire'
});

const PRIORITY = Object.freeze({ Red: 2, Orange: 1 });
/* every alert level GDACS uses; anything else means its format changed */
const LEVELS = Object.freeze({ Green: 1, Orange: 1, Red: 1 });

/* Worded from GDACS's own pages: it rates "the possible impact ... with regard to the potential
   need for international assistance" on three levels, Green / Orange / Red (alertscore 1 / 2 / 3). */
const DESCRIPTION = Object.freeze({
  Red: "Red is the highest of GDACS's three alert levels (Green, Orange, Red) for the possible need for international assistance.",
  Orange: "Orange is the middle of GDACS's three alert levels (Green, Orange, Red) for the possible need for international assistance."
});

const CAP = Object.freeze({ title: 100, place: 40, country: 120, countryName: 60 });

const STRIP = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;

/** Trim, remove control / invisible / bidirectional characters, collapse whitespace,
    drop trailing commas, and cap the length (in code points) at a word boundary. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const t = value.replace(STRIP, ' ').replace(/\s+/g, ' ').trim().replace(/[\s,;]+$/, '');
  return max ? capText(t, max) : t;
}

function capText(t, max) {
  const cps = Array.from(t);
  if (cps.length <= max) return t;
  const head = cps.slice(0, max - 1).join('');
  const sp = head.lastIndexOf(' ');
  return (sp > max * 0.6 ? head.slice(0, sp) : head).replace(/[\s,;:·-]+$/, '') + '…';
}

function toNumber(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : NaN;
}

function round4(n) {
  const r = Math.round(n * 1e4) / 1e4;
  return r === 0 ? 0 : r; /* never -0 */
}

function thousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** GDACS date ("2026-10-14T12:00:00", UTC without an offset) → "2026-10-14T12:00:00Z", or "". */
export function toUtcIso(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  const m = DATE_RE.exec(v);
  if (!m) return '';
  const d = new Date(m[1] ? v : v + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Keep a link only when it is an https://www.gdacs.org/ address (no credentials, no port). */
export function gdacsUrl(value) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s.startsWith(GDACS_SITE)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.hostname !== 'www.gdacs.org' || u.port || u.username || u.password) return '';
    return u.href.length <= 300 ? u.href : '';
  } catch {
    return '';
  }
}

function severityText(type, sd) {
  if (!sd || typeof sd !== 'object') return '';
  const v = toNumber(sd.severity);
  const unit = cleanText(sd.severityunit, 12).toLowerCase();
  if (!(v > 0)) return '';
  if (type === 'EQ' && unit === 'm') return 'Magnitude ' + v.toFixed(1);
  /* TC severitytext pairs the CURRENT stage with the MAXIMUM wind ("Tropical Depression
     (maximum wind speed of 231 km/h)"), so it is rebuilt from the number */
  if (type === 'TC' && unit === 'km/h') return 'Maximum wind ' + Math.round(v) + ' km/h';
  if (type === 'WF' && unit === 'ha') return thousands(v) + ' hectares burnt';
  if (type === 'DR' && (unit === 'km2' || unit === 'km²')) return thousands(v) + ' km² affected';
  return '';
}

function countryNames(p) {
  if (!Array.isArray(p.affectedcountries)) return [];
  return p.affectedcountries
    .map((c) => (c && typeof c === 'object' ? cleanText(c.countryname, CAP.countryName) : ''))
    .filter(Boolean);
}

/* "Mexico, México" (seen live on 15 Oct 2026) → "Mexico": drop repeats that differ only by accents or case */
function dedupeList(text) {
  const seen = new Set();
  return text.split(',').map((s) => s.trim()).filter((s) => {
    const key = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!s || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

function countryText(p, names) {
  /* a drought can list 29 countries (about 300 characters): name the first and count the rest */
  if (names.length > 3) return `${names[0]} and ${names.length - 1} more countries`;
  return capText(dedupeList(cleanText(p.country)), CAP.country) || capText(names.join(', '), CAP.country);
}

function placeText(p, names, country) {
  return cleanText(p.eventname, CAP.place) || names[0] || cleanText(country.split(',')[0], CAP.place);
}

function titleText(p, type, place) {
  const name = cleanText(p.name);
  if (name && Array.from(name).length <= 80) return capText(name, CAP.title);
  const eventname = cleanText(p.eventname, CAP.place);
  if (eventname) return `${TYPE_LABELS[type]} ${eventname}`; /* "Drought Europe-2026", as GDACS lists it */
  if (name) return capText(name, 80);
  return place ? `${TYPE_LABELS[type]} in ${place}` : TYPE_LABELS[type];
}

function alertLevel(v) {
  const a = cleanText(v, 12).toLowerCase();
  return a ? a.charAt(0).toUpperCase() + a.slice(1) : '';
}

/** One feature → a parsed record, or null when it is structurally unusable. */
function parseFeature(f) {
  if (!f || typeof f !== 'object') return null;
  const p = f.properties;
  const g = f.geometry;
  if (!p || typeof p !== 'object' || !g || typeof g !== 'object' || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
  const lng = toNumber(g.coordinates[0]);
  const lat = toNumber(g.coordinates[1]); /* GeoJSON order: [lng, lat] */
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  const type = typeof p.eventtype === 'string' ? p.eventtype.trim().toUpperCase() : '';
  if (!Object.prototype.hasOwnProperty.call(TYPE_LABELS, type)) return null;
  const eventid = toNumber(p.eventid);
  if (!Number.isInteger(eventid) || eventid < 0) return null;
  const episode = toNumber(p.episodeid);
  return {
    p, type, eventid, lat, lng,
    episode: Number.isFinite(episode) ? episode : -1,
    current: p.iscurrent === 'true' || p.iscurrent === true,
    /* any other iscurrent value means GDACS changed its format (counted, so the snapshot can fail loudly) */
    knownCurrent: p.iscurrent === 'true' || p.iscurrent === 'false' || p.iscurrent === true || p.iscurrent === false,
    alert: alertLevel(p.alertlevel)
  };
}

function buildEvent(r) {
  const p = r.p;
  const names = countryNames(p);
  const country = countryText(p, names);
  const place = placeText(p, names, country);
  const report = p.url && typeof p.url === 'object' ? p.url.report : '';
  return {
    id: `${r.type}-${r.eventid}`,
    lat: round4(r.lat),
    lng: round4(r.lng),
    title: titleText(p, r.type, place),
    priority: PRIORITY[r.alert],
    description: DESCRIPTION[r.alert],
    type: r.type,
    typeLabel: TYPE_LABELS[r.type],
    alert: r.alert,
    severityText: severityText(r.type, p.severitydata),
    country,
    place,
    from: toUtcIso(p.fromdate),
    to: toUtcIso(p.todate),
    url: gdacsUrl(report)
  };
}

function byUrgencyThenRecent(a, b) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.to !== b.to) return a.to < b.to ? 1 : -1;
  if (a.from !== b.from) return a.from < b.from ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isoSeconds(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Normalise a GDACS SEARCH response and report what happened to every feature.
 * Throws a TypeError when the response is not a FeatureCollection-like object with a
 * `features` array (the caller then keeps its last good file).
 * @param {unknown} raw parsed JSON (an empty feed is { features: [] })
 * @param {{ generatedAt?: string|Date, max?: number }} [opts]
 */
export function normaliseGdacsDetailed(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.features)) {
    throw new TypeError('GDACS response has no features array');
  }
  const max = Number.isInteger(opts.max) && opts.max >= 0 ? opts.max : MAX_EVENTS;
  const gen = opts.generatedAt instanceof Date ? opts.generatedAt : new Date(opts.generatedAt ?? Date.now());
  if (Number.isNaN(gen.getTime())) throw new TypeError('generatedAt is not a valid date');

  const stats = { raw: raw.features.length, valid: 0, invalid: 0, current: 0, kept: 0, dropped: 0, unknownCurrent: 0, unknownAlert: 0 };
  const best = new Map();
  for (const f of raw.features) {
    const r = parseFeature(f);
    if (!r) { stats.invalid++; continue; }
    stats.valid++;
    if (!r.knownCurrent) stats.unknownCurrent++;
    if (!Object.prototype.hasOwnProperty.call(LEVELS, r.alert)) stats.unknownAlert++;
    if (!r.current) continue;
    stats.current++;
    if (!Object.prototype.hasOwnProperty.call(PRIORITY, r.alert)) continue; /* Green (or unknown) */
    const key = `${r.type}-${r.eventid}`;
    const prev = best.get(key);
    const to = toUtcIso(r.p.todate);
    if (!prev || r.episode > prev.r.episode || (r.episode === prev.r.episode && to > prev.to)) best.set(key, { r, to });
  }
  const all = Array.from(best.values(), (b) => buildEvent(b.r)).sort(byUrgencyThenRecent);
  const events = all.slice(0, max);
  stats.kept = events.length;
  stats.dropped = all.length - events.length;

  const snapshot = {
    source: 'GDACS',
    sourceName: GDACS_NAME,
    sourceUrl: GDACS_SITE,
    generatedAt: isoSeconds(gen),
    count: events.length,
    dropped: stats.dropped,
    events
  };
  return { snapshot, stats };
}

/** The snapshot alone: { source, sourceName, sourceUrl, generatedAt, count, dropped, events }. */
export function normaliseGdacs(raw, opts) {
  return normaliseGdacsDetailed(raw, opts).snapshot;
}

/** Stable text form: 2-space JSON, LF line endings, one trailing newline. */
export function serialiseSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

/** True when two snapshots differ only in generatedAt (so the old file can be left untouched). */
export function sameContent(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const strip = (s) => serialiseSnapshot(Object.assign({}, s, { generatedAt: '' }));
  return strip(a) === strip(b);
}
