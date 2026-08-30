#!/bin/bash
# scripts/uninstall-mac-service.sh
# Undoes install-mac-service.sh: stops the background service and removes
# it from launchd, so it no longer starts at login. Doesn't touch your
# code or data/db.json - just the background-service registration.

set -e

LABEL="com.justprintit.server"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "No JustPrintIt background service is installed (nothing found at $PLIST_PATH)."
  exit 0
fi

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "JustPrintIt's background service has been stopped and removed."
echo "You can still run it manually any time with: node server.js"
