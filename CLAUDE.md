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

### Backend (`server.js`)

Single Express.js file — all API routes are defined here. No separate router files. Uses CommonJS (`require`). Key patterns:

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
└── calendar.ics   # Uploaded calendar file
```

### CSS / Theming

Styles use CSS custom properties (variables) defined per theme via `data-theme` attribute on `<html>`. Key variable names follow `--bg-*`, `--text-*`, `--accent-*`, `--border-*` conventions. Glassmorphism styling is common (`--glass-blur`, backdrop-filter). Global styles in `client/src/index.css`; component-level styles are either inline or in `App.css`.
