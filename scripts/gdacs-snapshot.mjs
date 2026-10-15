#!/usr/bin/env node
// Fetch current Orange and Red disaster alerts from GDACS (Global Disaster Awareness and
// Coordination System), normalise them, and write data/gdacs.json for the CH.05 globe.
// Node 20+ (global fetch), no dependencies. Run by .github/workflows/gdacs-snapshot.yml
// every six hours; visitors only ever load the same-origin JSON file.
//
//   node scripts/gdacs-snapshot.mjs                  fetch live, update data/gdacs.json
//   node scripts/gdacs-snapshot.mjs --input f.json   use a saved response instead (an EMPTY
//                                                    file stands for GDACS's 204 No Content)
//   options: --out <path>  --now <ISO time>
//   env:     GDACS_ATTEMPTS (default 3), GDACS_RETRY_DELAY_MS (default 60000),
//            GDACS_TIMEOUT_MS (default 20000)
//
// Exit 0: file written, or left byte-identical because the alerts did not change. One exception:
//         unchanged alerts in a file whose generatedAt is over 7 days old are rewritten with only
//         generatedAt moved on (a weekly heartbeat commit), so a live pipeline's file is never much
//         more than a week old and the page's 14-day "may be out of date" line means a stopped one.
// Exit 1: network error, timeout, unexpected status, non-JSON, wrong shape, a feed whose
//         features are all unusable, or an empty result alongside iscurrent / alertlevel values
//         GDACS has never used (a format change). The existing file is never touched on failure.

import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { normaliseGdacsDetailed, serialiseSnapshot, sameContent, GDACS_SITE } from './gdacs-normalise.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const USER_AGENT = 'RisingLightUK-GDACS-snapshot/1.0 (+https://77mediaofficial.github.io/RISINGLIGHTUK/; four requests a day)';
const PAGE_SIZE = 100; /* the SEARCH maximum */
const LOOKBACK_DAYS = 30; /* SEARCH fromDate filters on the event's todate */
const MAX_BYTES = 5 * 1024 * 1024;
const HEARTBEAT_MS = 7 * 864e5; /* rewrite an unchanged file once its generatedAt is older than this */

class FetchFailure extends Error {
  constructor(message, retryable) { super(message); this.retryable = retryable; }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '--out' || a === '--now') {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return out;
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function searchUrl(now) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
  return `${GDACS_SITE}gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF`
    + `&alertlevel=Orange;Red&fromDate=${from}&pageSize=${PAGE_SIZE}&caller=RisingLightUK`;
}

/** Turn one HTTP response into parsed JSON (204 = a genuinely empty feed) or throw. */
function readBody(status, finalUrl, text) {
  if (finalUrl && !finalUrl.startsWith(GDACS_SITE)) throw new FetchFailure(`redirected away from GDACS (${finalUrl})`, false);
  if (status === 204) return { features: [] }; /* GDACS answers an empty SEARCH with 204 and no body */
  if (status === 429 || status >= 500) throw new FetchFailure(`HTTP ${status}`, true);
  if (status !== 200) throw new FetchFailure(`HTTP ${status}`, false);
  if (text.length > MAX_BYTES) throw new FetchFailure(`response too large (${text.length} bytes)`, false);
  if (!text.trim()) throw new FetchFailure('HTTP 200 with an empty body', true);
  try {
    return JSON.parse(text);
  } catch {
    /* e.g. a firewall challenge page: worth another try */
    throw new FetchFailure(`response is not JSON (starts "${text.slice(0, 40).replace(/\s+/g, ' ')}")`, true);
  }
}

async function fetchOnce(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        redirect: 'follow',
        signal: ac.signal
      });
    } catch (err) {
      throw new FetchFailure(ac.signal.aborted ? `timed out after ${timeoutMs} ms` : `network error: ${err.cause?.code || err.message}`, true);
    }
    let text;
    try {
      text = await res.text();
    } catch (err) {
      throw new FetchFailure(ac.signal.aborted ? `timed out after ${timeoutMs} ms` : `body read failed: ${err.message}`, true);
    }
    return readBody(res.status, res.url, text);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url) {
  const attempts = Math.max(1, envInt('GDACS_ATTEMPTS', 3));
  const delay = envInt('GDACS_RETRY_DELAY_MS', 60000); /* robots.txt asks for at most 1 request / 60 s */
  const timeoutMs = Math.max(1000, envInt('GDACS_TIMEOUT_MS', 20000));
  for (let i = 1; ; i++) {
    try {
      return await fetchOnce(url, timeoutMs);
    } catch (err) {
      const retry = err instanceof FetchFailure && err.retryable && i < attempts;
      console.error(`GDACS attempt ${i}/${attempts} failed: ${err.message}${retry ? `; retrying in ${Math.round(delay / 1000)} s` : ''}`);
      if (!retry) throw err;
      await sleep(delay);
    }
  }
}

function readInput(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return readBody(text.trim() ? 200 : 204, '', text);
}

function readExisting(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function summary(events) {
  const by = {};
  for (const e of events) {
    const k = `${e.alert} ${e.type}`;
    by[k] = (by[k] || 0) + 1;
  }
  return Object.keys(by).sort().map((k) => `${k} ×${by[k]}`).join(', ') || 'none';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('--now is not a valid date');
  const out = resolve(args.out || join(REPO, 'data', 'gdacs.json'));
  const shown = relative(process.cwd(), out) || out;

  let raw;
  if (args.input) {
    raw = readInput(resolve(args.input));
  } else {
    const url = searchUrl(now);
    console.log(`GDACS: GET ${url}`);
    raw = await fetchWithRetry(url);
  }

  const { snapshot, stats } = normaliseGdacsDetailed(raw, { generatedAt: now });
  if (stats.raw >= PAGE_SIZE) console.warn(`GDACS: warning: ${stats.raw} features = the page-size cap; older events may be missing`);
  if (stats.raw > 0 && stats.valid === 0) {
    throw new Error(`all ${stats.raw} features were unusable (no valid Point, type or id): the response format may have changed`);
  }
  /* nothing kept, and GDACS sent an iscurrent or alertlevel value it has never used before: that is a
     format change, not a quiet day, so keep the last good file rather than publish an empty list */
  if (stats.raw > 0 && snapshot.count === 0 && (stats.unknownCurrent > 0 || stats.unknownAlert > 0)) {
    throw new Error(`no events kept and ${stats.unknownCurrent} unknown iscurrent / ${stats.unknownAlert} unknown alertlevel values: the response format may have changed`);
  }
  console.log(`GDACS: ${stats.raw} features, ${stats.valid} usable (${stats.invalid} unusable), ${stats.current} current;`
    + ` ${snapshot.count} Orange/Red events kept, ${snapshot.dropped} over the cap. ${summary(snapshot.events)}`);

  const existing = readExisting(out);
  if (existing && sameContent(existing, snapshot)) {
    /* a missing or unreadable generatedAt counts as old: the heartbeat then repairs it */
    const age = now.getTime() - Date.parse(existing.generatedAt);
    if (age <= HEARTBEAT_MS) {
      console.log(`GDACS: unchanged since ${existing.generatedAt}; ${shown} left as it is`);
      return;
    }
    console.log(`GDACS: unchanged, but generatedAt ${existing.generatedAt} is over 7 days old; heartbeat: rewriting it`);
  }
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, serialiseSnapshot(snapshot), 'utf8');
    renameSync(tmp, out);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  console.log(`GDACS: wrote ${shown} (${snapshot.count} events, generated ${snapshot.generatedAt})`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`GDACS snapshot failed: ${err.message}. The existing file was not changed.`);
    process.exitCode = 1;
  });
}
