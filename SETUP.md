# Waypoint — Setup Instructions

## Overview
Waypoint is a static web app hosted on GitHub Pages with Supabase as the backend.
No servers, no installs, no build tools required. Everything runs in the browser.

---

## Step 1 — Create a New Supabase Project

1. Go to https://supabase.com and sign in (or create a free account)
2. Click **New project**
3. Fill in:
   - **Name:** waypoint (or anything you like)
   - **Database password:** choose a strong password and save it somewhere safe
   - **Region:** choose the closest to you (e.g. US East)
4. Click **Create new project** and wait ~2 minutes for it to provision

---

## Step 2 — Run the Database Schema

1. In your new Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `sql/schema.sql` from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **Run** (or press Cmd+Enter)
6. You should see "Success. No rows returned" — this means it worked
7. Click **Table Editor** in the sidebar to confirm you see all the tables:
   - templates, template_phases, template_sections, template_items
   - families, family_contacts, family_phases, family_sections, family_items
   - reminders, dismissed_reminders, activity_log

---

## Step 3 — Get Your Supabase Credentials

1. In your Supabase project, click **Project Settings** (gear icon, bottom of sidebar)
2. Click **API** in the settings menu
3. You need two values — copy and save them both:
   - **Project URL** — looks like: `https://abcdefghijklmn.supabase.co`
   - **anon / public key** — a long string starting with `eyJ...`
   - ⚠️ Do NOT copy the service_role key — that one stays secret and server-side only

---

## Step 4 — Create a GitHub Repository

1. Go to https://github.com and sign in
2. Click the **+** icon → **New repository**
3. Fill in:
   - **Repository name:** waypoint (or funeral-checklist, your choice)
   - **Visibility:** Public (required for free GitHub Pages)
   - **Do NOT** initialize with README, .gitignore, or license (we'll add files directly)
4. Click **Create repository**

---

## Step 5 — Add the App Files to GitHub

You have two options depending on your comfort level:

### Option A — GitHub Web Editor (easiest, no tools needed)

1. In your new empty repository, click **creating a new file**
2. Add each file one at a time:
   - Type the filename (e.g. `index.html`) in the name field
   - Paste the file contents
   - Click **Commit changes**
3. For files inside folders (e.g. `js/config.js`):
   - Type `js/config.js` in the filename field — GitHub will create the folder automatically

### Option B — Git Command Line

If you have git installed on any computer:
```bash
git clone https://github.com/YOUR_USERNAME/waypoint.git
cd waypoint
# copy all app files into this folder
git add .
git commit -m "Initial Waypoint setup"
git push origin main
```

---

## Step 6 — Configure Your Supabase Credentials in the App

1. Open the file `js/config.js` in the GitHub web editor
2. Replace the placeholder values with your actual credentials from Step 3:

```javascript
export const SUPABASE_URL = 'https://your-project-id.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJyour-anon-key-here';
```

3. Commit the change

⚠️ The anon key is safe to commit to a public repo because Supabase Row Level
Security (RLS) is enabled on every table. The key alone cannot access any data
without a valid authenticated session.

---

## Step 7 — Enable GitHub Pages

1. In your GitHub repository, click **Settings** (top tab bar)
2. Click **Pages** in the left sidebar
3. Under **Source**, select:
   - Branch: **main**
   - Folder: **/ (root)**
4. Click **Save**
5. GitHub will show you a URL like `https://gfountain.github.io/waypoint`
6. Wait ~2 minutes and visit that URL to confirm the app loads

---

## Step 8 — Configure Supabase Auth Redirect URLs

1. Go back to your Supabase project
2. Click **Authentication** in the left sidebar
3. Click **URL Configuration**
4. Under **Site URL**, enter your GitHub Pages URL:
   `https://gfountain.github.io/waypoint`
5. Under **Redirect URLs**, add both:
   - `https://gfountain.github.io/waypoint`
   - `https://waypoint.gregfountain.com` (for after CNAME is set up)
6. Click **Save**

---

## Step 9 — Set Up Your CNAME (waypoint.gregfountain.com)

### In GitHub:
1. In your repository, create a new file called exactly: `CNAME`
2. The file contents should be just one line:
   ```
   waypoint.gregfountain.com
   ```
3. Commit the file

### In your DNS provider (wherever gregfountain.com is managed):
1. Log into your domain registrar or DNS provider
2. Add a new DNS record:
   - **Type:** CNAME
   - **Name:** funeral
   - **Value:** gfountain.github.io
   - **TTL:** 3600 (or Auto)
3. Save the record
4. DNS changes can take anywhere from a few minutes to 48 hours to propagate

### Confirm it's working:
- Visit `https://waypoint.gregfountain.com`
- You should see the Waypoint app

---

## Step 10 — Update Supabase with Your Custom Domain

Once your CNAME is working:
1. Go back to Supabase → Authentication → URL Configuration
2. Update **Site URL** to: `https://waypoint.gregfountain.com`
3. Confirm `https://waypoint.gregfountain.com` is in your Redirect URLs list
4. Click **Save**

---

## Step 11 — Create Your Account

1. Visit `https://waypoint.gregfountain.com`
2. You'll see the Waypoint login screen
3. Click **Create Account**
4. Enter your name, email, and password
5. Check your email for a confirmation link from Supabase and click it
6. Return to the app and sign in
7. You're in — start by going to Settings and creating your first template

---

## Day-to-Day Workflow

**Making changes to the app:**
- Edit files directly in the GitHub web editor
- Changes go live automatically within ~60 seconds of committing
- No build step, no deployment process

**Updating the database schema:**
- If a future update requires schema changes, you'll get a new SQL snippet to run in the Supabase SQL Editor
- Existing data is always preserved

**Backups:**
- Supabase automatically backs up your database
- You can also export data manually via Supabase → Database → Backups

---

## Troubleshooting

**App loads but I can't log in:**
- Check that your SUPABASE_URL and SUPABASE_ANON_KEY in `js/config.js` are correct
- Make sure you confirmed your email via the verification link

**CNAME not working:**
- DNS propagation can take up to 48 hours
- Try visiting the github.io URL directly to confirm the app itself works

**SQL schema errors:**
- Make sure you're running the entire schema.sql file, not just a portion
- If you get "already exists" errors, the tables may have been partially created —
  contact support or drop and recreate the database from Supabase settings

**Changes not showing up:**
- Hard refresh the browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- GitHub Pages can take up to 60 seconds to reflect new commits

---

## File Reference

```
/
├── index.html              Main HTML shell
├── CNAME                   Your custom domain
├── css/
│   └── styles.css          All app styles
├── js/
│   ├── config.js           ← Your Supabase credentials go here
│   ├── supabase.js         Supabase client initialization
│   ├── auth.js             Login / session management
│   ├── router.js           Page navigation
│   ├── notifications.js    Bell badge + due item checking
│   ├── activity-log.js     Case activity logging
│   ├── pages/
│   │   ├── dashboard.js    Dashboard page
│   │   ├── families.js     Families list page
│   │   ├── family-detail.js  Family detail + checklist
│   │   ├── settings.js     Settings + template management
│   │   ├── help.js         Help section
│   │   └── template-roadmap.js  Template logic visualizer
│   ├── components/
│   │   ├── family-card.js           Family card component
│   │   ├── checklist.js             Checklist container
│   │   ├── checklist-item.js        Individual checklist item
│   │   ├── checklist-section.js     Section with collapse/pills
│   │   ├── conditional-logic-editor.js  Logic rule builder UI
│   │   ├── template-editor.js       Template builder UI
│   │   ├── reminder.js              Standalone reminder component
│   │   ├── veteran-badge.js         Veteran/spouse icons
│   │   ├── modal.js                 Modal dialog system
│   │   ├── toast.js                 Toast notifications
│   │   └── notifications-panel.js   Bell dropdown panel
│   └── utils/
│       ├── conditional-engine.js    Evaluates all conditional logic
│       ├── variable-resolver.js     Resolves {{variable}} references
│       ├── drag-sort.js             Drag to reorder sections/items
│       └── dates.js                 Date helpers and formatting
└── sql/
    └── schema.sql          Run this in Supabase SQL Editor
```
