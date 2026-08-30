#!/bin/bash
# scripts/install-mac-service.sh
#
# Sets JustPrintIt up as a permanent background service on macOS via
# launchd: starts automatically at login, restarts itself if it ever
# crashes, and keeps running after you close Terminal or reboot. No extra
# packages needed - launchd is built into macOS, same as this app's own
# zero-dependency approach.
#
# Run this from inside the cloned repo folder:
#   bash scripts/install-mac-service.sh
#
# To pick a different port than the default 3000, set PORT first:
#   PORT=8080 bash scripts/install-mac-service.sh
#
# To turn on the password lock (HTTP Basic Auth), set these too:
#   APP_USERNAME=admin APP_PASSWORD=yourpassword bash scripts/install-mac-service.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_PATH="$(command -v node || true)"
LABEL="com.justprintit.server"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$REPO_DIR/logs"
PORT="${PORT:-3000}"
APP_USERNAME="${APP_USERNAME:-}"
APP_PASSWORD="${APP_PASSWORD:-}"

# Minimal XML-escaping so a username/password with &, <, >, ', or " in it
# doesn't produce a broken plist.
xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e "s/'/\&apos;/g" -e 's/"/\&quot;/g'
}
APP_USERNAME_XML="$(xml_escape "$APP_USERNAME")"
APP_PASSWORD_XML="$(xml_escape "$APP_PASSWORD")"

if [ -z "$NODE_PATH" ]; then
  echo "Couldn't find 'node' on your PATH."
  echo "Install Node.js 20+ first (https://nodejs.org, or 'brew install node' if you use Homebrew), then re-run this script."
  exit 1
fi

if [ ! -f "$REPO_DIR/server.js" ]; then
  echo "Couldn't find server.js next to this script - make sure you're running it from inside the JustPrintIt repo folder."
  exit 1
fi

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${REPO_DIR}/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${PORT}</string>
    <key>APP_USERNAME</key>
    <string>${APP_USERNAME_XML}</string>
    <key>APP_PASSWORD</key>
    <string>${APP_PASSWORD_XML}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/server.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/server.error.log</string>
</dict>
</plist>
EOF

# Reload cleanly if this has been run before (e.g. after a `git pull`
# that changed the repo's location, or just to pick up a new PORT).
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "JustPrintIt is now running in the background and will start automatically at login."
echo "Logs: $LOG_DIR/server.log (and server.error.log if something goes wrong)"
if [ -n "$APP_PASSWORD" ]; then
  echo "Password protection is ON (Basic Auth)."
else
  echo "Password protection is OFF - anyone on your network can reach this. Re-run with APP_USERNAME/APP_PASSWORD set to turn it on."
fi
echo ""
echo "Useful commands:"
echo "  Stop it:     launchctl unload \"$PLIST_PATH\""
echo "  Start it:    launchctl load \"$PLIST_PATH\""
echo "  Restart it:  launchctl kickstart -k gui/\$(id -u)/${LABEL}"
echo "  Remove it:   bash scripts/uninstall-mac-service.sh"
echo ""

sleep 1
if command -v curl >/dev/null 2>&1; then
  if curl -s -o /dev/null -w "Health check: HTTP %{http_code} at http://localhost:${PORT}\n" "http://localhost:${PORT}"; then
    :
  else
    echo "Couldn't reach http://localhost:${PORT} yet - check the logs above if this doesn't resolve in a few seconds."
  fi
fi
