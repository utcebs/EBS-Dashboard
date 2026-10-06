# EBS Tracker — Setup Guide

A professional work tracking web app for teams. Built with plain HTML/CSS/JS, hosted on GitHub Pages, powered by Supabase.

---

## What You Get

- **Dashboard** — team-wide task log with filters by person, category, sub-category, month
- **Log Task** — individual task logging form + bulk Excel upload
- **My Performance** — personal KPI dashboard with RPG level system, streaks, badges, working time analysis
- **My Tasks** — personal priority board (Urgent / Important / Medium / Low)
- **Admin Panel** — user management, records, comparison analytics, employee analysis, export, settings

---

## Prerequisites

- A **GitHub account** (free) to host the app
- A **Supabase account** (free) for the database
- A web browser — no server or coding required

---

## Step 1 — Set Up Supabase

### 1.1 Create a project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Give it a name (e.g. `ebs-tracker`), set a database password, pick the region closest to your team
4. Click **Create new project** and wait ~2 minutes

### 1.2 Run the database setup

1. In Supabase, click **SQL Editor** in the left sidebar → **New query**
2. Open `DATABASE_SETUP.sql` from this folder, copy all its contents
3. Paste into the SQL editor and click **Run** (without RLS)
4. You should see `Success. No rows returned`

### 1.3 Get your API credentials

1. Go to **Project Settings** (gear icon) → **API**
2. Copy and save:
   - **Project URL** — e.g. `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** — long string starting with `eyJ...`

---

## Step 2 — Set Up GitHub Pages

### 2.1 Create a repository

1. Go to [github.com](https://github.com) → **+** → **New repository**
2. Name it `worktracker` (note the name — used in URLs)
3. Set to **Public** → **Create repository**

### 2.2 Upload the files

1. Click **uploading an existing file** on the repository page
2. Upload everything from this folder — maintaining the folder structure:
   ```
   css/style.css
   js/auth.js  js/config.js  js/utils.js
   admin.html  dashboard.html  index.html
   log.html    performance.html  tasks.html
   manifest.json  sw.js
   logo.png  logo-light.png
   icon-192.png  icon-512.png  icon-192-light.png  icon-512-light.png
   ```
3. Click **Commit changes**

### 2.3 Enable GitHub Pages

1. Repository → **Settings** → **Pages**
2. Source: **Deploy from a branch** → branch: `main` → folder: `/ (root)`
3. Click **Save** and wait 2–3 minutes
4. Your live URL will be: `https://YOUR-USERNAME.github.io/worktracker/`

---

## Step 3 — Connect Supabase to the App

### 3.1 Edit js/config.js

1. In GitHub, click `js/` → `config.js` → pencil icon to edit
2. Replace lines 6–7:
   ```js
   const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
   ```
3. Set your tracker start date (line 15):
   ```js
   const TRACKER_START_DATE = '2026-03-03'; // Change to your actual start date
   ```
4. Click **Commit changes**

### 3.2 Update manifest.json

1. Edit `manifest.json` in GitHub
2. Update `start_url` and `scope` with your repo name:
   ```json
   "start_url": "/worktracker/index.html",
   "scope": "/worktracker/"
   ```
3. Commit changes

### 3.3 Update sw.js

1. Edit `sw.js` in GitHub
2. In the `ASSETS` array, confirm all paths have `/worktracker/` prefix (change if your repo name differs)
3. Commit changes

---

## Step 4 — First Login

1. Open `https://YOUR-USERNAME.github.io/worktracker/`
2. Log in: **username:** `admin` / **password:** `Admin@123`
3. **Immediately change the password:** Admin Panel → 👥 Users → 🔑 Reset Password

---

## Step 5 — Initial Configuration

### Set Tracker Start Date
Admin Panel → ⚙️ Settings → Tracker Config → set date → Save

### Add Team Members
Admin Panel → 👥 Users → Create User → fill name, username, email, password, role → Create

### Configure Sub-Categories
Admin Panel → ⚙️ Settings → Sub-Category Management

Default sub-categories (add/remove as needed):
- **Support:** User Support, D365 User Support, Report Support
- **Testing:** Hardware Testing, Software Testing
- **Project:** Development, Implementation, Planning, Documentation

### Update Kuwait Public Holidays (if needed)
Edit `js/config.js` in GitHub → find `KUWAIT_HOLIDAYS_2026` array → update dates in `YYYY-MM-DD` format

### Set Up Email Notifications (optional)

1. Go to [emailjs.com](https://emailjs.com) → sign up (free, 200 emails/month)
2. Add Email Service → Gmail → copy **Service ID**
3. Create Email Template:
   - To Email field: `{{to_email}}`
   - Subject: `📋 New Task Assigned: {{task_title}}`
   - Body (HTML):
   ```html
   <p>Hello <strong>{{to_name}}</strong>,</p>
   <p><strong>{{from_name}}</strong> assigned you a task:</p>
   <p><strong>{{task_title}}</strong> · Priority: {{task_priority}} · Due: {{task_due}}</p>
   <a href="{{app_url}}">View My Tasks →</a>
   ```
   - Copy the **Template ID**
4. Account → copy **Public Key**
5. Admin Panel → ⚙️ Settings → Email Notifications → enter all three values → Save
6. Admin Panel → ⚙️ Settings → User Email Addresses → set each user's email

---

## Step 6 — Install as Mobile App

**iPhone (Safari):** Open URL in Safari → Share button → Add to Home Screen → Add

**Android (Chrome):** Open URL in Chrome → ⋮ menu → Add to Home screen → Install

Opens fullscreen with no browser bar, like a native app.

---

## Daily Usage

### Logging a task
Log Task page → fill Task name, select Sub-Category, enter Hours → Submit

### Bulk uploading
Log Task page → **⬇️ Download Template** → fill Sheet 1 (Sheet 2 shows valid sub-categories) → **📤 Bulk Upload Excel** → review preview → Confirm & Insert

### Priority tasks
My Tasks → Add Task → set priority and due date. Tasks stay on the board across multiple days — log time against them as you work. Mark Done when complete.

### Admin: assign a task to a user
My Tasks page → **📋 Assign to User** button (admin only) → select user, title, priority

### Admin: add leave or war days
Admin Panel → ⚙️ Settings → Employee Leave or War/Conflict Days Off → enter date range → Add

### Admin: view employee dashboard
Admin Panel → 🔬 Employee Analysis → select employee

### Admin: export data
Admin Panel → 📤 Export → apply filters → Download Filtered CSV

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Connection error. Check your Supabase config." | Wrong URL or anon key in `js/config.js` — double-check both |
| Page shows old version | Hard refresh: `Ctrl+Shift+R` (Win) or `Cmd+Shift+R` (Mac) |
| Settings page loads forever | Run `DATABASE_SETUP.sql` in Supabase — `war_day_ranges` table missing |
| Sub-categories not showing | Admin Panel → Settings → add sub-categories for each category |
| Email not sending | Check EmailJS credentials in Settings; test with Send Test Email button |
| "This Week" shows no data | Ensure logs have been submitted this week; refresh the comparison tab |
| Bulk upload fails | Use the downloaded template; must be `.xlsx` format |
| PWA shows 404 after install | Check `manifest.json` — `start_url` and `scope` must match your repo name |

---

## Database Tables

| Table | Purpose |
|---|---|
| `users` | Team members, credentials, roles, emails |
| `task_logs` | All work log entries |
| `priority_tasks` | Personal task board items |
| `app_settings` | Admin-configurable settings |
| `support_subcategories` | Sub-categories for Support |
| `testing_subcategories` | Sub-categories for Testing |
| `project_subcategories` | Sub-categories for Project |
| `employee_leaves` | Per-employee leave date ranges |
| `war_day_ranges` | Team-wide closure date ranges |

---

## Customisation

**Logo:** Replace `logo.png` (dark mode) and `logo-light.png` (light mode) in GitHub

**Category names:** Admin Panel → ⚙️ Settings → Category Labels

**Working hours:**
```js
// In js/config.js
const RAMADAN_DAILY_HOURS = 6;
const NORMAL_DAILY_HOURS  = 8;
```

**Theme:** Click the ☀️/🌙 toggle (top-right corner, saved automatically)

---

## Security Notes

- Passwords are stored as SHA-256 hashes — never plain text
- The Supabase anon key is visible in browser source — acceptable for internal team tools
- Row Level Security is disabled — access is controlled at the application level
- Do not store sensitive data beyond work logs without enabling RLS

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Database | Supabase (PostgreSQL) |
| Hosting | GitHub Pages |
| Charts | Chart.js v4 |
| Excel | SheetJS (xlsx) |
| Email | EmailJS |
| Fonts | Playfair Display + DM Sans |
| PWA | Web App Manifest + Service Worker |

---

*EBS Tracker — Built for the EBS team.*
