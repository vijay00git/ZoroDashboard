# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ZORO's Productivity Suite** — a locally-hosted, full-stack productivity dashboard. The backend serves both the REST API and the built React frontend as a single application on port 3000. All user data (notes, timesheets, matrices, etc.) is persisted to the `data/` directory on the local filesystem — no database, no cloud.

## Commands

### Running the App

```bash
# Production mode (serves built React from client/dist/)
node server.js
# or use the launcher (kills any existing server, then opens browser)
./start.sh
```

### Frontend Development (hot-reload)

Run both simultaneously in separate terminals:
```bash
# Terminal 1 — backend
node server.js

# Terminal 2 — frontend dev server at http://localhost:5173
cd client
npm run dev
```

In dev mode, the Vite dev server runs at `:5173` and the backend API is at `:3000`. The Vite config currently has no proxy configured, so API calls from the dev server will need CORS (already enabled on the backend).

### Build Frontend

```bash
cd client
npm run build
# Output goes to client/dist/ — this is what server.js serves in production
```

### Lint

```bash
cd client
npm run lint
```

### Install Dependencies

```bash
# Root (backend)
npm install

# Frontend
cd client && npm install
```

## Architecture

### Backend (`server.js` + `routes/`)

Express.js, CommonJS (`require`). `server.js` holds only the shared setup (middleware, `data/` directories, `writeFileAtomic`/`writeJsonAtomic`, multer), the SPA fallback and `listen`. Each feature area lives in `routes/<area>.js` as `module.exports = function register(app, ctx)`:

- `ctx` carries the shared setup plus the helpers other areas export (each module `return`s the names others use). Modules that others depend on — `jenkinsRunner`, `testrail`, `helperTools`, `testRuns` — are registered first; the list is in `server.js`.
- No two areas share a route path prefix, so registration order doesn't affect routing. Keep it that way when adding routes.
- In a route module use `ROOT` (the app folder, from `ctx`) instead of `__dirname`, and `require('../x')` for files at the app root.
- A module-level `let` must only be reassigned inside its own module — export a function instead (e.g. `tcdResetConfigCaches()` in `jenkinsRunner.js`, used by the restore route).
- **Case mode (since 2026-11-17)**: when `~/.claude/ic-tokyo-case-manifest.json` (`TCD_CASE_MANIFEST_PATH`) exists at boot, Jenkins Runner, Cypress Runner and RunMyTCs work from owned TestRail case IDs instead of the spec manifest. `tcdBuildCaseData()` scans every spec under `cypress/e2e` (mtime-cached) and builds `/api/testcases/data` rows for owned cases only, wherever they currently live. Every run is narrowed with `grepTags="@C… @setup"`: locally via `envExtra` (plus `grepOmitFiltered`), on Jenkins via a `GREP_TAGS` build parameter, which the jobs must define. Queue items may carry `cases` to narrow further. Endpoints: `/api/testcases/case-manifest` (+ `/add`, `/remove`, `/update`, `/download`), `/api/testcases/jenkins-param-check`. Case tracking uses its own `case-tracking-owned*.json` files and logs `case_moved`. Delete the case manifest and restart to go back to spec mode.
- **Test-ID view**: `routes/caseView.js` (registered after `cypress`) serves `/api/cases/overview` (one record per owned case: specs, tracker state, local results and last 10 local runs, last Jenkins job, manual marks, tags, bugs, notes, setup warnings) and `/api/cases/history/:id` (that case's full timeline). Both pages render it with `testcase-dashboard/CaseTable.jsx` + `CaseDetailDrawer.jsx`, behind a Test IDs / Specs toggle. A run of cases always adds the spec's setup-like tags (`tcdSetupTagsForSpec`) and the manifest `deps`. Tracker changes are logged with dates, shown as a page banner until "Mark reviewed" (no Telegram, by choice). Also in `caseView.js`: `POST /api/cases/testrail-sync` stores every owned case's status in a TestRail run (`data/testcase-dashboard/testrail-sync.json`, newest first per case; re-syncing a run replaces it) and powers the TestRail column, filters and per-case run history. `/api/cases/locate/:id` (git log -S --all + git grep) and `/api/cases/retire` handle missing IDs; retired cases stay in the manifest but are hidden, not run and not tracked. `/api/cases/run-preview` shows each spec's grepTags and the it() blocks they select; the table always previews before queueing. Saved filter views live in localStorage (`<storageKey>-views`).
- Biggest module: `routes/jenkinsRunner.js` (manifest, case tracking, TestRail/Jenkins config, job queue, integrations, Telegram) — a candidate for a further split.

Key patterns:

- **File-based storage**: All persistence is raw `fs.readFileSync`/`fs.writeFileSync` on JSON/CSV/Markdown files in `data/`. No ORM or database.
- **AI proxy**: `/api/ai/chat` and `/api/ai/models` proxy requests to either Gemini (`generativelanguage.googleapis.com`) or Groq (`api.groq.com`) depending on the `provider` field in the request body. API keys come from the client — the server never stores them.
- **TestRail proxy**: `/api/testrail/sync` and `/api/testrail/fetch-run` proxy to the hardcoded TestRail instance (`elosystemsteam.testrail.com`). Auth is passed as a Base64 Basic Auth string from the client.
- **SPA fallback**: The last route (`app.use`) sends `client/dist/index.html` for all unmatched routes, enabling React Router client-side navigation.
- **File naming convention**: All user-provided names are sanitized with `.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()` before being used as filenames.

### Frontend (`client/src/`)

React 19 SPA using React Router v7. Entry: `main.jsx` → `App.jsx`.

**Routing**: All routes defined in `App.jsx`. Each route maps directly to a page component in `client/src/pages/`.

| Route | Page | Feature |
|---|---|---|
| `/` | `Dashboard` | Overview, stats, clock |
| `/synchub` | `SyncHub` | TestRail matrix management |
| `/notebook` | `Notebook` | Markdown notes editor |
| `/task-manager` | `TaskManager` | Drag-and-drop tasks + Pomodoro |
| `/timesheet` | `Timesheet` | CSV timesheet management |
| `/water` | `Water` | Hydration tracker |
| `/quicklaunch` | `QuickLaunch` | Bookmark folders |
| `/status` | `Status` | AI-powered standup reports |
| `/csv-organizer` | `CSVOrganizer` | Generic CSV viewer/editor |
| `/test-runs` | `TestRuns` | TestRail run dashboards (status mix, testers, bugs) |
| `/filter-rail` | `FilterRail` | One TestRail run's full test list: section tree, multi-filter, multi-level sort |
| `/settings` | `Settings` | API keys, theme, preferences |

**Global state / cross-cutting concerns**:
- **Theme**: `dark` / `light` / `lava` — cycled in `App.jsx`, stored in `localStorage` under key `tr-theme`, applied via `data-theme` attribute on `<html>`.
- **Toasts**: `ToastContext` (`client/src/contexts/ToastContext.jsx`) — wrap `useToast()` to call `showToast(message, type)`. Types: `'info'`, `'success'`, `'warning'`, `'error'`.
- **Alerts/Confirms/Prompts**: Use `showAlert`, `showConfirm`, `showPrompt` from `client/src/utils/Alerts.js` — these are custom modal replacements for `window.alert/confirm/prompt`.
- **AI calls**: `client/src/utils/ai.js` — shared utility for calling `/api/ai/chat`. Reads the user's API key and provider from `localStorage`.
- **Keyboard shortcuts**: Ctrl+0–9 for page navigation, configured in `localStorage` under `tr-shortcuts`.

**SyncHub** (`/synchub`) is the most complex page — it manages TestRail test run matrices. State is persisted across sessions using both `localStorage` (credentials, pinned state, folder order) and `sessionStorage` (in-progress test case edits, filters). Test cases are stored server-side as JSON files in `data/matrices/`.

### Data Directory Layout

```
data/
├── matrices/      # SyncHub: one JSON file per saved test matrix
├── notes/         # Notebook: one .md file per note
├── timesheets/    # Timesheet: CSV files named {EmpName}_{YYYY-MM}_Timesheet.csv
├── quicklaunch/   # QuickLaunch: single data.json
├── templates/     # Daily Status: .md files with <!-- name: ... --> frontmatter
├── csv-organizer/ # CSVOrganizer: arbitrary CSV files
├── test-runs/     # TestRuns: cached run-<id>.json summaries + settings.json (tester names, Jira URL, run list)
├── filter-rail/   # FilterRail: run-<id>.json (one row per test), suite-<id>.json (section tree + case→section map), index.json
└── calendar.ics   # Uploaded calendar file
```

### CSS / Theming

Styles use CSS custom properties (variables) defined per theme via `data-theme` attribute on `<html>`. Key variable names follow `--bg-*`, `--text-*`, `--accent-*`, `--border-*` conventions. Glassmorphism styling is common (`--glass-blur`, backdrop-filter). Global styles in `client/src/index.css`; component-level styles are either inline or in `App.css`.
