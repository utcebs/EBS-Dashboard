# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read `memory.md` first

`memory.md` at the repo root is the authoritative project context — full history, decisions, gotchas, and the post-launch iteration log. It's the page-one read. This file is a quick-reference; defer to `memory.md` when they disagree (it's kept up to date).

## Commands

```bash
npm install                     # install deps (first time, or after pull)
npm run dev                     # Vite dev server on localhost:5173
npm run build                   # production build → dist/ (CI runs this)
npm run preview                 # serve dist/ locally to verify the build

git add <files> && git commit -m "..." && git push
# Pushing to main auto-triggers GitHub Actions → deploys to gh-pages → Pages
# Watch: https://github.com/utcebs/EBS-/actions
```

No test suite exists. No lint command is wired. `npm run build` is the closest thing to a CI check — it type/import-errors if React code is broken.

## Architecture — the two-app + two-client pattern

The repo ships **two apps** at one origin:

- **React app** — Vite build in `src/`; lives at `/` and all `/#/*` hash routes.
- **EBS Tracker** — vanilla HTML/CSS/JS in `ebs-tracker/`; NOT built by Vite — the deploy workflow literally `cp -r ebs-tracker dist/ebs-tracker` into the build output.

Both apps share **one Supabase project** (`hddfkkojfvmjuxsyhcgh`). A user logged into one is logged into the other — the Supabase session in `localStorage` is the shared token.

### Two Supabase clients (critical)

`src/supabaseClient.js` exports two clients and you must pick the right one:

- `supabase` — auth-enabled. Use for **login, session, and any write** (insert/update/delete).
- `supabasePublic` — no session persistence, isolated `storageKey`. Use for **every public read** (projects, milestones, risks, profiles, landing content).

Reason: the EBS Tracker's session in localStorage made the shared auth client deadlock on the React app's first read after cross-app navigation. `supabasePublic` sidesteps that by refusing to see any session at all. See `memory.md` §7 for the full debugging story.

**Corollary rule:** never `await` a `supabase.*` call inside an `onAuthStateChange` listener or the `.then()` of `getSession()` — the GoTrue lock is still held and you'll self-deadlock. Fire-and-forget, or use `supabasePublic`.

### React app layout

All React code lives in the single file `src/App.jsx` (~1900 lines). Components defined top-to-bottom: `AuthProvider` → `ProjectsProvider` → utilities → `Layout` → `Dashboard` → `ProjectTracker` → `ProjectFormModal` → `ProjectDetail` → milestone/risk modals → `GanttChartPage` → `LoginPage` → `AdminUsersPage` → `AdminTeamPage` → `App` default export.

Broken-out components in `src/components/`: `LandingPage.jsx`, `ParticleNetwork.jsx` (R3F — lazy-loaded), `Editable.jsx` (inline-edit primitives used by the landing).

Routing: `HashRouter` (URLs use `#`) because GitHub Pages can't do server-side SPA routing. Scroll-reset on nav lives in `Layout` — it targets `#main-scroll` (the scrollable `<main>`, not `window`).

### EBS Tracker page map

Each HTML file is its own page (no SPA). Shared globals: `db` (Supabase client) from `js/config.js`, `session` from `js/auth.js::requireAuth()`, helpers from `js/utils.js`. Chart.js 4 loaded via CDN where charts exist.

| File | Owns |
|---|---|
| `index.html` | Login / landing |
| `dashboard.html` | User's task log table — clickable rows open a view modal |
| `log.html` | Log a new task entry (with admin-managed category picker) |
| `tasks.html` | Priority tasks board · admin Assign-to-User · admin assigned-task analytics card · admin per-employee dashboard · admin Task Completion Analysis sub-tab (5-bucket breakdown w/ drill-down) |
| `performance.html` | "My Performance" — hero, KPIs, weekly/category charts, 🏆 Approved Achievements list, 🏅 Badges grid |
| `admin.html` | Admin panel: Users · Records · 🕒 Pending Approvals · Comparison · Employee Analysis · Export · Settings (incl. categories CRUD) · 🏅 Badges · 📊 Project Analytics |

### Theme

Dark monochrome is applied via a single `.app-dark` CSS override layer in `src/index.css`. `Layout` adds `app-dark` to `<main>` on every non-landing route. **The landing page is deliberately not wrapped** — it has its own self-contained styling. If you need to change theme tokens, edit `src/index.css`, not the hundreds of className strings.

## Gotchas that have bitten before

- **Wrong Supabase project.** More than one project ref exists. The real one is `hddfkkojfvmjuxsyhcgh`. Before running ANY migration SQL, check the Supabase dashboard URL `/dashboard/project/<ref>/…`. Debug trick: UPDATE a known row to a marker string, then `curl` the live REST endpoint for that table. If curl doesn't return the marker you're on the wrong project.
- **Migration FK target table.** Use `REFERENCES profiles(id)`, NOT `users(id)`. The legacy `ebs-tracker/DATABASE_SETUP.sql` uses a `users` table but the deployed schema uses `profiles` (which mirrors `auth.users`). `users(id)` migrations fail with `relation "users" does not exist`.
- **PostgREST 300 Multiple Choices on embedded resources.** Adding a second FK from table A→B (e.g. both `task_logs.user_id` and `task_logs.approved_by` → `profiles(id)`) makes every existing `select('*, profiles(...)')` ambiguous and PostgREST returns HTTP 300. Fix: use the column-hint syntax `profiles!user_id(...)`. Audit every existing embed before merging a migration that adds a second FK.
- **PostgREST schema cache after DDL.** Sometimes a freshly-added column isn't visible to the REST API until you run `NOTIFY pgrst, 'reload schema';` in the SQL Editor. Symptoms: INSERT/SELECT errors that only mention the new column.
- **Email rate limit.** Supabase's built-in SMTP is capped at ~4/hr. Creating more users than that fails with `email rate limit exceeded`. Fix: Authentication → Providers → **Email** → turn **"Confirm email"** OFF (do not disable the Email provider entirely — that kills login). An `auto_confirm_auth_user` trigger is also installed as belt-and-suspenders; `confirmed_at` is a generated column so never UPDATE it directly, only `email_confirmed_at`.
- **lucide-react silent import misses.** Missing a named icon from the top-of-file lucide import doesn't error at build time — it blows up at runtime with `ReferenceError: X is not defined` and shows a white screen. When adding an icon to `App.jsx`, double-check it's in the import list.
- **CI transient failures.** `peaceiris/actions-gh-pages@v4` occasionally 500s on the gh-pages push with `expected packfile`. Just re-run the workflow.
- **GitHub Pages deploy ≠ workflow green.** Two phases: (1) Actions builds + pushes gh-pages, (2) Pages picks up and re-deploys. Phase 2 can still be `in_progress` after Actions goes green. Wait another 1-3 min before debugging cache issues.
- **Browser HTTP cache on stale Supabase errors.** When PostgREST returns an error (e.g. before a migration is applied), the browser may cache that response and keep serving it from disk cache even after the migration runs. Symptom in Network tab: status 4xx/3xx with source `(disk cache)`. Fix: DevTools → Disable cache, or open in incognito.

## Adding new features

- **New public read query** → `supabasePublic`.
- **New write / auth-gated op** → `supabase`.
- **New route** → add to the `<Routes>` block in `Layout` (`App.jsx`).
- **New Supabase column / table** → write a migration to `supabase/migrations/YYYY-MM-DD_<name>.sql`, mirror into `COMBINED_SETUP.sql` for fresh installs, hand the SQL to the user to paste into Supabase SQL Editor (project `hddfkkojfvmjuxsyhcgh`). Code that uses the new column should fall back gracefully if the migration hasn't been applied yet — wrap reads in try/catch and show a "run the migration" hint instead of crashing.
- **New form input** → always give it `id`, `name`, and `autoComplete` (browser autofill warning otherwise).
- **New EBS tracker feature that should respect avatars** → tag your avatar element with `data-user-id="<uuid>"`. The sync selector is `#sb-avatar, [data-user-id="<currentUser>"]`; elements without a matching `data-user-id` are left alone.
- **New surface that displays a Key Accomplishment** → render through `displayAccomplishment(log)` (in `js/utils.js`), not `log.accomplishment` directly. The helper substitutes "🕒 Pending admin approval" / "⛔ Rejected — reason" based on `accomplishment_status`. `calculateStats` only counts approved entries.

## Verification

The regression checklist is in `memory.md` §10 (initial release) plus the per-batch checklists in §14 (April rework) and §15 (late-April follow-up). Run in an incognito window after any auth / Supabase-client / service-worker / migration change. The highest-value assertion is: fresh incognito → `/EBS-/` loads → projects list loads → visit `/ebs-tracker/`, log in as admin → navigate back to `/EBS-/` → data still loads. If the final step fails, the two-client pattern has been broken somewhere.
