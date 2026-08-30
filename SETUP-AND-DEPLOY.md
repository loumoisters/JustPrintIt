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

## Part 4 — Deploy it

A few good options depending on what you need:

- **Option A: Railway** — a real public URL, reachable from anywhere on the internet. Costs a few dollars a month.
- **Option B: Your own Mac** — runs permanently in the background on a Mac you own, reachable from your home network (your computer, phone, etc. on the same Wi-Fi). Free, and nothing leaves your house.
- **Option C: A home server/NAS (Unraid, TrueNAS, Proxmox, etc.)** — the best fit if you want one always-on copy that every device (PC, Mac, phone) connects to as a client, instead of each device running its own separate copy with its own separate data. Also free.

Pick whichever matches what you actually need. If you're using multiple devices day-to-day, Option C is worth the extra setup - Option B (running it on more than one machine) means each copy has its own independent orders/customers/etc. that never sync with each other.

### Option A: Railway (cloud, reachable from anywhere)

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

### Option B: Your own Mac (home network, free)

This runs the app permanently in the background on a Mac you own — it starts automatically when you log in, restarts itself if it ever crashes, and keeps running after you close Terminal or reboot. It's reachable from any device on the same Wi-Fi (your computer, phone, etc.), same as running `node server.js` manually, just without needing to keep a Terminal window open forever. There's no public URL - only devices on your home network can reach it, and no password is needed for that reason (add one anyway if you want the extra layer, see step 4).

**1. Make sure Node.js is installed on the Mac.** Open Terminal and run `node -v` — if that fails, install it from [nodejs.org](https://nodejs.org) (or `brew install node` if you use Homebrew).

**2. Clone the repo onto the Mac:**
```bash
git clone https://github.com/yourusername/print-fleet-manager.git
cd print-fleet-manager
```
(Use your actual GitHub URL from Part 2 - if you're not sure, find it on your repo's GitHub page under the green **Code** button.)

**3. Set it up as a background service:**
```bash
bash scripts/install-mac-service.sh
```
This script (already in the repo) generates a small macOS service definition, points it at this exact folder, and starts it - no manual file editing needed. It prints the app's URL and a quick health check when it's done. To use a port other than 3000: `PORT=8080 bash scripts/install-mac-service.sh`.

**4. (Optional) Turn on the password lock.** Even on a home network, if other people share your Wi-Fi (roommates, guests) and you'd rather they not have access, set `APP_USERNAME`/`APP_PASSWORD` when running the install script instead of the plain version in step 3:
```bash
APP_USERNAME=admin APP_PASSWORD=yourpassword bash scripts/install-mac-service.sh
```
Re-run that command any time to change the password later - it's safe to run repeatedly, it just reloads the service with whatever settings you pass it.

**5. Find the app on your network.** The service prints its URL when it starts, but if you need it again later, run `node server.js` once manually (Ctrl+C to stop it right after) - it prints both the `localhost` URL and the LAN URL to use from your phone/other devices, e.g. `http://192.168.1.23:3000`.

**Updating later:** `cd` into the repo, run `git pull`, then restart the service so it picks up the change:
```bash
git pull
launchctl kickstart -k gui/$(id -u)/com.justprintit.server
```

**Removing it:** `bash scripts/uninstall-mac-service.sh` (stops it and removes it from startup - doesn't touch your code or data).

### Option C: A home server/NAS via Docker (Unraid, TrueNAS, Proxmox, etc.)

This runs the app as a Docker container on an always-on server you already have, using the `Dockerfile` and `docker-compose.yml` already in the repo. Every device on your network - PC, Mac, phone - just opens a browser to the server's address, so there's one shared copy of your data instead of several that drift apart. This is the right choice if you're using more than one computer day-to-day (see the note at the top of this Part).

**1. Get the code onto the server.** Either `git clone` the repo directly on the server if it has shell access (same command as Option B, step 2), or copy the folder over from wherever you've been editing it (network share, `scp`, etc.) - whatever's normal for how you manage that server.

**2. Bring it up with Docker Compose**, from inside the repo folder on the server:
```bash
docker compose up -d --build
```
That builds the image (first time only) and starts the container in the background, set to restart automatically if the server reboots or the container crashes (`restart: unless-stopped` in `docker-compose.yml`). Your data lives in a `data/` folder next to the compose file, mounted into the container - it persists across rebuilds/restarts.

**3. Find it on your network.** By default it's on port 3000 - `http://<server-ip>:3000` from any device on the same network. If you don't know the server's IP, check your NAS/router's dashboard, or run `hostname -I` (Linux) on the server itself.

**4. (Optional) Turn on the password lock.** Edit `docker-compose.yml`, uncomment the `APP_USERNAME`/`APP_PASSWORD` lines under `environment:`, set a real password, then `docker compose up -d --build` again to apply it.

**Updating later:**
```bash
git pull
docker compose up -d --build
```

**Removing it:** `docker compose down` (stops and removes the container; your `data/` folder is untouched since it's just a mounted host folder, not stored inside the container).

**Notes for specific platforms** - the `docker compose` commands above are identical everywhere; these are just where to run them:
- **Unraid:** SSH in and run the commands from the repo folder, or use the *Compose Manager* plugin (Community Applications) to manage it from the web UI instead of the command line. Put the repo (and its `data/` folder) somewhere under `/mnt/user/appdata/` or a share of your choosing.
- **TrueNAS SCALE:** Enable a shell/SSH for your user (or use the built-in Shell in the web UI) and run the commands from there. TrueNAS's own "Apps" section is built for prebuilt images from a registry rather than building from a local Dockerfile, so `docker compose` from the shell is the more direct path here.
- **Proxmox:** Doesn't run Docker containers directly - create an LXC container or small VM first (a lightweight Debian/Ubuntu LXC with Docker installed works well), then follow the same steps inside that.

## Troubleshooting

- **"EADDRINUSE" locally** — something's already using that port. Run with a different one: `$env:PORT=8080; node server.js`.
- **Railway build fails** — check the build logs in the Railway dashboard; since this app has zero dependencies, failures are almost always a start-command misconfiguration (see step 3 above).
- **Data disappeared after a redeploy** — the volume isn't attached, or `DATA_DIR` isn't set to match its mount path. Re-check steps 4–5.
- **Locked out after setting a password** — remove the `APP_PASSWORD` variable in Railway to disable auth again, or double check `APP_USERNAME`/`APP_PASSWORD` match exactly what you're typing.
- **Windows blocks the installer scripts** — if PowerShell refuses to run the Claude Code install command, run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` first (approve the prompt), then retry.
- **Mac service won't start / site unreachable after `install-mac-service.sh`** — check the logs it printed the path to (`logs/server.error.log` in the repo folder) for the actual error. Most common cause is another process already using the port; pick a different one and re-run: `PORT=8080 bash scripts/install-mac-service.sh`.
- **Mac service didn't pick up a `git pull`** — the background service keeps running the old code until restarted: `launchctl kickstart -k gui/$(id -u)/com.justprintit.server`.
- **Can't reach the Mac from your phone** — make sure both are on the same Wi-Fi network (not a guest network, which is often isolated), and that macOS's own firewall (System Settings → Network → Firewall) isn't blocking incoming connections to Node - if it's on, allow Node.js when macOS prompts, or add it manually under Firewall Options.
- **`docker compose: command not found`** — older Docker installs use a hyphen: try `docker-compose up -d --build` instead. If neither works, Docker itself isn't installed/enabled on that server yet.
- **Container starts then immediately exits** — check `docker compose logs` for the actual error. A common cause is the `data/` folder not existing yet or having permissions the container's user can't write to; `mkdir -p data` next to the compose file first and try again.
- **Data reset after rebuilding the container** — the volume mount is missing or pointing somewhere unexpected; double-check the `volumes:` line in `docker-compose.yml` matches where you actually expect `data/` to live.

Sources: [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart), [Railway Docs](https://docs.railway.com), [Render free tier limitations](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
