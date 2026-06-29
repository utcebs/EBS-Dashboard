# EBS Project Tracker

A full-featured project portfolio tracking web application built with **React + Vite** (frontend) and **Supabase** (backend/auth/database). Designed for GitHub Pages hosting.

## Features

- **Dashboard** — Auto-generated portfolio summary with charts (status, priority, department, phase breakdowns)
- **Project Tracker** — Full CRUD table with search, filter, sort
- **Project Drill-down** — Click any project to see/manage Key Milestones and Risks & Issues
- **Gantt Chart** — Dynamic timeline auto-generated from project start/end dates and completion %
- **Admin Auth** — Supabase-based login; guests see read-only views, admins can create/edit/delete everything
- **User Management** — Admin can create new admin users and send password reset emails

---

## Setup Guide

### Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Click **New Project**, give it a name (e.g., `ebs-tracker`), set a database password, pick a region
3. Wait for the project to finish provisioning

### Step 2: Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Copy the entire contents of `supabase_schema.sql` and paste it in
4. Click **Run** — this creates the `projects`, `milestones`, and `risks` tables with RLS policies
5. Create another new query, paste the contents of `seed_data.sql`, and run it — this loads all 30 projects plus milestones

### Step 3: Create the Initial Admin User

1. In Supabase dashboard, go to **Authentication → Users**
2. Click **Add user → Create new user**
3. Enter:
   - **Email:** `admin@ebs-tracker.com`
   - **Password:** `EbsAdmin2026!`
   - Check **"Auto Confirm User"**
4. Click **Create user**

> 🔑 **Initial Admin Credentials:**
> - Email: `admin@ebs-tracker.com`
> - Password: `EbsAdmin2026!`
> 
> Change this password after first login via the User Management page.

### Step 4: Get Your API Keys

1. In Supabase dashboard, go to **Settings → API**
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`)
3. Copy the **anon/public** key (the long string under "Project API keys")

### Step 5: Configure the App

1. Clone or download this project
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and paste your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### Step 6: Install & Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Step 7: Deploy to GitHub Pages

1. Create a GitHub repository
2. Push this project to it
3. Update `vite.config.js` — set the `base` to your repo name:
   ```js
   base: '/your-repo-name/',
   ```
4. Build and deploy:
   ```bash
   npm run build
   ```
5. You can either:
   - **Option A:** Use `gh-pages` package:
     ```bash
     npm run deploy
     ```
   - **Option B:** Use GitHub Actions — go to repo Settings → Pages → Deploy from `gh-pages` branch

> **Important:** For GitHub Pages, the app uses `HashRouter` (URLs with `#`), which works without any server configuration.

---

## Architecture

```
Public Visitors (no login)          Admin Users (logged in)
        │                                    │
        │  READ-ONLY access                  │  FULL CRUD access
        ▼                                    ▼
┌─────────────────────────────────────────────────┐
│                React Frontend                    │
│  Dashboard │ Project Tracker │ Gantt │ Detail    │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│               Supabase Backend                   │
│  Auth │ PostgreSQL │ Row-Level Security (RLS)    │
│                                                  │
│  Tables:                                         │
│  - projects (30 fields)                          │
│  - milestones (per project)                      │
│  - risks (per project)                           │
└─────────────────────────────────────────────────┘
```

### Row-Level Security

- **SELECT** (read): Allowed for everyone (public access)
- **INSERT/UPDATE/DELETE** (write): Only for authenticated users (admins)

---

## Project Structure

```
ebs-project-tracker/
├── supabase_schema.sql    # Database tables, RLS policies, indexes
├── seed_data.sql          # Pre-loaded 30 projects + milestones
├── package.json           # Dependencies
├── vite.config.js         # Build config (set base for GitHub Pages)
├── tailwind.config.js     # Tailwind theme
├── postcss.config.js
├── index.html             # Entry HTML
├── .env.example           # Supabase credentials template
├── public/
│   └── 404.html           # GitHub Pages SPA redirect
└── src/
    ├── main.jsx           # React entry point (HashRouter)
    ├── index.css          # Tailwind + custom styles
    ├── supabaseClient.js  # Supabase client init
    └── App.jsx            # All components (Layout, Dashboard,
                           #   ProjectTracker, ProjectDetail,
                           #   GanttChart, Login, AdminUsers,
                           #   all modals and forms)
```

---

## Customization

### Dropdown Values

Edit the constants at the top of `src/App.jsx`:

```js
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const STATUSES = ['On Track', 'At Risk', 'Delayed', 'Completed', 'On Hold']
const PHASES = ['Initiation', 'Planning', 'Execution', 'UAT', 'Go-Live', 'Closed']
```

If you change these, also update the `CHECK` constraints in `supabase_schema.sql`.

### Colors & Theme

Edit `tailwind.config.js` to change the `brand` and `surface` color palettes.

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| "Invalid API key" | Check `.env` values match Supabase dashboard |
| Can't write data | Make sure you're logged in; check RLS policies |
| Blank page on GitHub Pages | Verify `base` in `vite.config.js` matches your repo name |
| User creation fails | Ensure email confirmation is disabled in Supabase Auth settings, or use "Auto Confirm" when creating users manually |

---

## License

Internal use — EBS Projects Portfolio Management
