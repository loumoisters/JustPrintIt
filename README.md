# Print Fleet Manager (FoxTrack-style)

A self-hosted 3D printing shop manager, styled and structured after [FoxTrack](https://foxtrack.studio) (based on saved pages of the actual app): quotes, orders, invoices, customers, printer fleet, maintenance, filament, products, inventory, expenses, and reports, all in one dashboard.

**Zero install required.** No npm packages, no build step, no framework — just Node's built-in `http` server and vanilla JS on the frontend. Data lives in a local JSON file (`data/db.json`).

## Run it

Requires Node.js 20+ (uses the global `fetch` API).

```bash
node server.js
```

Then open http://localhost:3000

To change the port: `PORT=8080 node server.js`

**Your data is safe from `git pull`.** `data/db.json` is gitignored - it's your live data, not code. On first run (or if it's ever missing), the app bootstraps it from the checked-in `data/db.example.json` seed. After that, `git pull`ing new code changes will never touch, overwrite, or reset your real data.

Environment variables (all optional, see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DATA_DIR` | Where `db.json` is stored (default `./data`) - point this at a persistent volume when hosting |
| `APP_USERNAME` / `APP_PASSWORD` | Set both to require an HTTP Basic Auth login. Unset = no auth (fine for local use only) |

**Want this running on a real URL with Claude Code set up for ongoing changes?** See [`SETUP-AND-DEPLOY.md`](./SETUP-AND-DEPLOY.md) for a full beginner-friendly walkthrough (Git/GitHub, Claude Code, and deploying to Railway with persistent storage).

## Demo data

The app comes pre-seeded with a believable small print shop's worth of data across every section — customers, quotes, orders in every kanban status, invoices, a filament shelf, a product catalog, maintenance history, and several months of expenses (so the Reports charts have something to show). Reset it any time with:

```bash
node scripts/seed.js
```

Two printers use the `mock` connection type and simulate progress/temperatures with no real hardware, so the whole app — including the live printer status on Dashboard/Printers — works out of the box.

## What's mirrored from FoxTrack vs. simplified

This matches FoxTrack's page structure, navigation order, layout patterns (stat cards, kanban board, tabs, settings sidebar), and visual design (colors, spacing, type) as closely as hand-written vanilla JS/CSS reasonably allows. A few things are intentionally simplified since they either need a real backend/SaaS layer or weren't visible in the saved pages:

- **Settings**: General, Quoting, and Numbering tabs are fully functional. Billing, Team, Integrations, and similar SaaS-only tabs are stubbed with a placeholder — they don't apply to a self-hosted, single-user app.
- **CSV import / CSV & PDF export**: buttons are present for visual fidelity but disabled — wiring them up is a good next step if you need it.
- **Charts**: hand-rolled inline SVG bar charts (no charting library, so this stays dependency-free) rather than FoxTrack's actual chart component.
- **Auth**: none. This is meant for a single user on a home network. Don't expose it to the open internet as-is.
- **Quote → Order → Invoice automation**: creating one doesn't currently auto-generate the next (e.g. accepting a quote doesn't create an order). They're linked by ID (`order.customerId`, `invoice.orderId`, etc.) but the workflow is manual for now.

## Connecting real printers

Edit a printer (Printers page → Edit) and set:

- **OctoPrint** — Connection type `OctoPrint`, host like `http://octopi.local`, and an API key from OctoPrint's Settings → API.
- **Klipper (Moonraker)** — Connection type `Klipper (Moonraker)`, host like `http://<printer-ip>:7125`. API key only needed if Moonraker's trusted-client auth is disabled.

Status polls every 5 seconds while Dashboard, or the Printers page in "Live" view, is open.

## Project layout

```
server.js              # HTTP server entry point (static files + API)
lib/
  db.js                 # JSON-file data store (generic CRUD + settings singleton)
  api.js                # REST routes, dashboard + reports aggregation
  printers/
    octoprint.js          # OctoPrint REST adapter
    moonraker.js           # Moonraker (Klipper) REST adapter
    mock.js                 # Simulated printer for demos
    index.js                # Unified adapter dispatch
public/
  index.html             # Shell page, loads all scripts below in order
  styles.css              # Design tokens + components (shadcn-style, light/dark)
  core.js                 # State, API helper, modal/toast, icons, router
  page-dashboard.js       # Dashboard: stat cards, mini charts, kanban preview, deadlines
  page-orders.js           # Orders: drag-and-drop kanban + table, also used by Dashboard
  page-resource.js          # Generic CRUD table page (Customers, Quotes, Invoices, Filament, Products, Inventory, Expenses)
  page-printers.js           # Printer fleet cards with live status
  page-maintenance.js         # Maintenance schedules + service log
  page-reports.js              # Reports: summary + hand-rolled SVG charts
  page-settings.js              # Tabbed settings
  app-init.js                    # Boots the app, theme toggle
data/
  db.json                # All app data lives here
scripts/
  seed.js                 # Resets db.json with demo data
```

## API

All endpoints return JSON. Every collection below supports `GET /api/<collection>`, `POST /api/<collection>`, `GET/PUT/DELETE /api/<collection>/:id`:

`customers`, `quotes`, `orders`, `invoices`, `printers`, `maintenanceSchedules`, `maintenanceLog`, `spools` (Filament page), `products`, `inventoryItems` (Inventory page), `expenses`.

Plus computed/singleton endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Revenue/profit MTD, order status counts, upcoming deadlines, low-stock spools |
| GET | `/api/reports?months=6` | Revenue/expense/filament/downtime trends, top products, top customers |
| GET/PUT | `/api/settings` | Workspace settings (single object, not a list) |
| GET | `/api/printers/status` | Live status for all printers |
| GET | `/api/printers/:id/status` | Live status for one printer |

## Extending it ("vibe coding" this further)

- **Auth**: add a password check in `server.js` before routing — there's none today.
- **Wire up quote → order → invoice automation**: e.g. accepting a quote creates an order; fulfilling an order offers "Create invoice."
- **Auto-decrement filament**: when an order's status flips to `fulfilled`, subtract its `filamentUsedGrams` from the linked spool's `remainingWeightGrams`.
- **CSV import/export**: the buttons are stubbed in the UI — hook them to a simple CSV parser/writer on top of the existing CRUD endpoints.
- **Real-time push**: swap the 5s polling in the printer pages for Server-Sent Events or WebSockets.
- **Bigger dataset / multi-user**: swap `lib/db.js`'s JSON file for `node:sqlite` (still dependency-free, built into Node 22+) if you need concurrent writers.

If you get npm/internet access wherever you deploy this, the data model and API shape are already defined, so swapping in a real framework (Next.js, Prisma, shadcn/ui itself) is mostly a matter of replacing `lib/db.js` and the `public/` frontend with equivalents that talk to the same `/api/*` routes.
