# Filament lookup (SpoolmanDB) — usage & management guide

The Filament page can look up real filament products from [SpoolmanDB](https://github.com/Donkie/SpoolmanDB), a free, community-maintained database of filament brands/colors/specs, and autofill the "New filament" form instead of you typing everything by hand.

This doc covers how to use it day to day, how the sync/cache works, and how to troubleshoot it.

## Using it

1. Go to **Filament → + New filament** (or edit an existing spool).
2. At the top of the drawer, type into **"Look up in SpoolmanDB"** — brand, material, and/or color all work, e.g. `prusament pla galaxy black` or just `hatchbox red`.
3. Matching results appear in a dropdown, each showing manufacturer, color name, material, diameter, and weight, with a small color swatch.
4. Click a result to autofill:
   - Brand, Material, Color (name + swatch)
   - Diameter, Spool weight, Weight (total)
   - Extruder temp / Bed temp (new fields, filled in only if SpoolmanDB has them)
5. Everything stays editable after autofill — adjust anything before saving. Fields SpoolmanDB doesn't have (spool #, remaining weight, low-stock threshold, price, storage location, notes) are left for you to fill in as usual.

Editing an existing spool: autofill will overwrite the *total* weight field but leaves *remaining* weight alone, since that's live inventory, not a spec.

## Syncing the database

Search only works against a **local cache**, not a live lookup — nothing is fetched from the internet on every keystroke.

- **First time**: the status line under the search box will say "Filament database not synced yet." Click **Sync now**. This downloads the current SpoolmanDB dataset (roughly 1–2 MB of JSON) once.
- **After that**: searches are instant and work fully offline. The status line shows how many filaments are cached and when it was last synced, with a **Refresh** link to pull an updated copy any time (e.g. after SpoolmanDB adds new products).
- Nothing syncs automatically or on a schedule — it only happens when you click Sync/Refresh.

This is the *only* feature in the app that reaches the open internet rather than your local network. If your server has no internet access (fully air-gapped LAN, restrictive firewall, etc.), this feature just won't sync — everything else in the app is unaffected.

## Where the data lives

The cached dataset is stored at:

```
data/spoolmandb-cache.json
```

(or `<DATA_DIR>/spoolmandb-cache.json` if you've set the `DATA_DIR` environment variable — see the main README).

It's plain JSON, gitignored (won't get committed or wiped by `git pull`), and safe to delete if you ever want to force a clean re-sync — the app will just report "not synced yet" until you click Sync again.

## Troubleshooting

**"Couldn't reach SpoolmanDB: fetch failed"** — the server couldn't reach `donkie.github.io` over the internet. Check the machine running the app has outbound internet access (not just LAN access), then try Refresh again. A failed sync never touches or clears an existing cache, so if you'd synced before, search still works with the older data.

**No results for a search that should exist** — SpoolmanDB is community-maintained, so coverage varies by brand; not every filament on the market is listed. If the brand genuinely isn't in there, just fill in the form manually.

**Wrong data after autofill** — SpoolmanDB entries are manufacturer-published specs; if your particular spool differs (a batch variance, a re-spooled roll, etc.), just overwrite the field after autofilling — nothing is locked.

**Stale results after a product was updated upstream** — click **Refresh** in the drawer to pull the latest dataset.

## For reference: the API endpoints

If you ever want to script against this (or just understand what the UI is calling):

| Method | Path | Does |
|---|---|---|
| GET | `/api/spoolmandb/status` | `{ cached, count, fetchedAt }` — whether a cache exists, how many entries, last sync time |
| POST | `/api/spoolmandb/refresh` | Downloads and caches the current dataset; returns the same status shape |
| GET | `/api/spoolmandb/search?q=` | `{ results: [...], cached, count, fetchedAt }` — up to 25 matches |

These require the same auth as the rest of the app's API (if you've set `APP_PASSWORD`).

The underlying code lives in `lib/spoolmandb.js` (fetch/cache/search logic) and `lib/api.js` (the three routes above); the UI is in `public/page-filament.js`.
