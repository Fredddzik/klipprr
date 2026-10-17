#!/bin/bash
# Installs (or reinstalls) the daily health check as a launchd agent for this user.
#   scripts/launchd/install-health-check.sh            # install
#   scripts/launchd/install-health-check.sh --remove   # uninstall
set -euo pipefail
LABEL=com.klipprr.health-check
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = --remove ]; then
  rm -f "$DEST"
  echo "Removed $LABEL."
  exit 0
fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Klipprr/health"
sed -e "s|__REPO__|$REPO|g" -e "s|__HOME__|$HOME|g" "$(dirname "$0")/$LABEL.plist" > "$DEST"
plutil -lint "$DEST" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "Installed $LABEL: runs $REPO/scripts/health-check.py daily at 09:30."
