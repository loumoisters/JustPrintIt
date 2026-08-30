// lib/spoolmandb.js
// Lookup against SpoolmanDB (https://github.com/Donkie/SpoolmanDB), a
// community-maintained, freely-licensed database of 3D printing filament
// products (manufacturer, material, color, recommended temps, spool
// weights, etc). Used to autofill the "New filament" form instead of
// hand-typing every spool's specs.
//
// This is the one place in the app that reaches out to the open internet
// rather than the local network - and only when the shop owner explicitly
// clicks "Refresh" (or the very first time they search and no cache exists
// yet). Nothing is fetched automatically or on a timer, and the app works
// fine offline if this is never used. The compiled dataset is small
// (~1-2 MB of JSON) and is cached to disk so normal searches never hit the
// network at all.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'spoolmandb-cache.json');

const FILAMENTS_URL = 'https://donkie.github.io/SpoolmanDB/filaments.json';
const MATERIALS_URL = 'https://donkie.github.io/SpoolmanDB/materials.json';

const FETCH_TIMEOUT_MS = 20_000;

// In-memory copy of whatever's on disk, so repeated searches don't re-read
// and re-parse a multi-megabyte file every keystroke.
let cache = null; // { fetchedAt, filaments: [...], materials: [...] }
let loadedFromDisk = false;

function loadFromDisk() {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      cache = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[spoolmandb] cache file is corrupt, ignoring:', err.message);
    cache = null;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Pulls a fresh copy of the compiled filaments + materials JSON from
// SpoolmanDB's GitHub Pages site and caches it to disk. Throws on network
// failure - the caller decides how to surface that (existing cache, if any,
// is left untouched so a failed refresh never wipes out a working one).
async function refresh() {
  const [filaments, materials] = await Promise.all([
    fetchJson(FILAMENTS_URL),
    fetchJson(MATERIALS_URL),
  ]);
  if (!Array.isArray(filaments)) throw new Error('Unexpected response shape from SpoolmanDB');

  cache = {
    fetchedAt: new Date().toISOString(),
    filaments,
    materials: Array.isArray(materials) ? materials : [],
  };
  loadedFromDisk = true;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return getStatus();
}

function getStatus() {
  loadFromDisk();
  return {
    cached: !!cache,
    count: cache ? cache.filaments.length : 0,
    fetchedAt: cache ? cache.fetchedAt : null,
  };
}

function getMaterials() {
  loadFromDisk();
  return cache ? cache.materials : [];
}

// Simple "every word in the query must appear somewhere in manufacturer +
// material + color name" search - good enough for an autocomplete box over
// a few thousand entries, no fuzzy-matching library needed. Results are
// sorted so matches at the start of the manufacturer name (e.g. typing
// "prusa" for "Prusament") float to the top.
function search(query, limit = 25) {
  loadFromDisk();
  if (!cache || !query || !query.trim()) return [];

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const f of cache.filaments) {
    const haystack = `${f.manufacturer || ''} ${f.material || ''} ${f.name || ''}`.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    const startsWithFirstWord = haystack.startsWith(words[0]);
    scored.push({ f, rank: startsWithFirstWord ? 0 : 1 });
  }
  scored.sort((a, b) => a.rank - b.rank);

  return scored.slice(0, limit).map(({ f }) => ({
    id: f.id,
    manufacturer: f.manufacturer || '',
    name: f.name || '',
    material: f.material || '',
    // SpoolmanDB stores hex codes with no leading '#', and transparent
    // colors get an 8-digit RRGGBBAA value - normalize to a plain 6-digit
    // "#RRGGBB" (dropping alpha) to match the app's own colorHex convention
    // and to stay something a native <input type="color"> will accept.
    colorHex: (() => {
      const raw = (f.color_hex || (Array.isArray(f.color_hexes) ? f.color_hexes[0] : null) || '').replace(/^#/, '');
      return /^[0-9a-fA-F]{6}/.test(raw) ? `#${raw.slice(0, 6)}` : null;
    })(),
    diameter: f.diameter ?? null,
    weight: f.weight ?? null,
    spoolWeight: f.spool_weight ?? null,
    extruderTemp: f.extruder_temp ?? null,
    bedTemp: f.bed_temp ?? null,
    finish: f.finish || null,
    translucent: !!f.translucent,
    glow: !!f.glow,
  }));
}

module.exports = { refresh, getStatus, getMaterials, search };
