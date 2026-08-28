# Getting this app online + set up with Claude Code

This walks through everything from scratch: installing the tools, putting the project in GitHub, using Claude Code to keep iterating on it, and deploying it to a real URL with data that survives restarts. Commands below are for Windows (PowerShell), since that's what you're on — noted where Mac/Linux differs.

Do the parts in order. Part 1 and 2 are prerequisites for everything else.

## Part 1 — Install the basics

You need three things on your computer: Node.js (to run the app), Git (to track changes and talk to GitHub), and a GitHub account (where your code will live, and what most hosting platforms deploy from).

**1. Node.js** — you already have this (you ran the app with `node server.js`). If you ever need to check: open PowerShell and run `node -v`. Anything 20 or higher is fine.

**2. Git** — download from [git-scm.com](https://git-scm.com/download/win) and run the installer. Default options are fine the whole way through. Verify it worked:
```powershell
git --version
```

**3. GitHub account** — go to [github.com](https://github.com) and sign up if you don't have an account. It's free.

**4. Tell Git who you are** (one-time setup, run in PowerShell):
```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```
Use the same email as your GitHub account.

## Part 2 — Put the project in Git, then push it to GitHub

**1. Open PowerShell in the project folder.** Navigate to wherever you unzipped `print-fleet-manager`:
```powershell
cd "C:\path\to\print-fleet-manager"
```

**2. Turn it into a Git repository:**
```powershell
git init
git add .
git commit -m "Initial commit"
```

**3. Create an empty repository on GitHub:**
- Go to [github.com/new](https://github.com/new)
- Name it `print-fleet-manager` (or whatever you like)
- Leave "Add a README" **unchecked** (you already have files)
- Click **Create repository**

**4. Connect your local folder to that GitHub repo and push.** GitHub shows you the exact commands right after creating the repo, but they'll look like this (replace `yourusername`):
```powershell
git remote add origin https://github.com/yourusername/print-fleet-manager.git
git branch -M main
git push -u origin main
```
The first push will ask you to log in — GitHub will open a browser window to authenticate. Approve it.

That's it — your code is now on GitHub. Any time you make changes going forward:
```powershell
git add .
git commit -m "describe what you changed"
git push
```

## Part 3 — Install and use Claude Code

Claude Code is a command-line tool that runs in your project folder and can read, write, and run your code directly — a good way to keep iterating on this app conversationally, similar to how we've been working here.

**1. Install it.** Open PowerShell and run:
```powershell
irm https://claude.ai/install.ps1 | iex
```
This is the official installer for Windows. (Mac/Linux would use `curl -fsSL https://claude.ai/install.sh | bash` instead.)

**2. Start it up in your project folder:**
```powershell
cd "C:\path\to\print-fleet-manager"
claude
```
The first time, it'll prompt you to log in with your Claude account (same login as claude.ai) — it opens a browser window for this.

**3. Just talk to it.** Once you're in, you're in an interactive session inside your project. Examples of what you'd type:
```
add a "duplicate order" button on the Orders page
the filament low-stock threshold isn't showing the right color, can you check page-resource.js
write a script that backs up data/db.json to a timestamped copy
```
It can read your files, make edits, and run commands (like `node -c` to check syntax, or start the server to test) — all inside this project folder.

**4. A few useful things to know:**
- Type `exit` or press `Ctrl+C` twice to leave a session.
- It works best when you give it one focused task at a time, the same way we've been doing here.
- After it makes changes you're happy with, commit and push them (`git add . && git commit -m "..." && git push`) so they're saved to GitHub and ready to redeploy.
- Full docs if you want to go deeper: [code.claude.com/docs](https://code.claude.com/docs)

## Part 4 — Deploy it online (Railway)

This app stores its data in a plain file (`data/db.json`), not a database — which is great for simplicity, but means whatever host you pick needs to keep that file around between restarts ("persistent storage"). A lot of free hosting tiers wipe the filesystem on every redeploy, which would silently erase your orders/customers/etc. **Railway** is a good fit: simple GitHub-connected deploys, and it supports an attached persistent volume for exactly this case. It's not free forever (~$5/month in usage covers a small app like this comfortably), but it's the least fiddly option for something at this stage.

**1. Create a Railway account:** go to [railway.app](https://railway.app) and sign up with your GitHub account (recommended — makes step 2 seamless).

**2. Create a new project from your repo:**
- Click **New Project**
- Choose **Deploy from GitHub repo**
- Pick the `print-fleet-manager` repo you pushed in Part 2
- Railway will detect it's a Node.js app automatically and start a build

**3. Check the start command.** Railway should auto-run `npm start`, which is already wired to `node server.js` in this project's `package.json` — you shouldn't need to change anything. If it doesn't auto-detect, go to your service → **Settings** → **Deploy** and set the start command to `node server.js` manually.

**4. Add a persistent volume** (critical — skip this and your data resets on every redeploy):
- In your Railway service, go to the **Volumes** tab (or **Settings** → **Volumes**)
- Click **New Volume**
- Set the **mount path** to `/app/data`
- Save

**5. Point the app at that volume with an environment variable:**
- Go to your service's **Variables** tab
- Add a variable: `DATA_DIR` = `/app/data`
- Railway will redeploy automatically after you save

**6. (Recommended) Turn on the password lock**, since this will now be reachable from the open internet:
- In the same **Variables** tab, add:
  - `APP_PASSWORD` = pick something strong
  - `APP_USERNAME` = whatever you want (optional, defaults to `admin`)
- Once set, the app will show a browser login prompt (HTTP Basic Auth) before letting anyone in.

**7. Seed the first deploy with demo/starting data.** The `data/db.json` file already in your repo will be copied in on first deploy, so you'll see the seeded demo data immediately. Once the volume is attached, edits made through the app persist there instead — future `git push`es won't touch your live data.

**8. Get your URL.** Railway → your service → **Settings** → **Networking** → **Generate Domain**. That gives you a public `*.up.railway.app` URL. You can point a custom domain at it later from the same screen if you want.

From here on, your workflow is: edit locally (or with Claude Code) → `git push` → Railway auto-redeploys in about a minute.

### If you'd rather not pay anything right now

Render.com has a free tier for Node apps, but free services **don't support persistent disks** and spin down after 15 minutes of inactivity (each new visit "wakes it up" with a few seconds' delay) — meaning your data would reset on every redeploy and possibly every restart. That's fine for kicking the tires publicly, but not for anything you want to actually rely on. If you go this route, treat it as a demo link, not where your real business data lives, until you're ready to move to Railway (or Fly.io, which also supports persistent volumes) for the real thing.

## Troubleshooting

- **"EADDRINUSE" locally** — something's already using that port. Run with a different one: `$env:PORT=8080; node server.js`.
- **Railway build fails** — check the build logs in the Railway dashboard; since this app has zero dependencies, failures are almost always a start-command misconfiguration (see step 3 above).
- **Data disappeared after a redeploy** — the volume isn't attached, or `DATA_DIR` isn't set to match its mount path. Re-check steps 4–5.
- **Locked out after setting a password** — remove the `APP_PASSWORD` variable in Railway to disable auth again, or double check `APP_USERNAME`/`APP_PASSWORD` match exactly what you're typing.
- **Windows blocks the installer scripts** — if PowerShell refuses to run the Claude Code install command, run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` first (approve the prompt), then retry.

Sources: [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart), [Railway Docs](https://docs.railway.com), [Render free tier limitations](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
