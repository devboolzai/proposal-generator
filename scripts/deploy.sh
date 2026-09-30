#!/usr/bin/env bash
# Builds both apps locally and ships them to the droplet.
#
# Builds happen here, not there: the droplet has one core, and a Vite build
# competing with two live services is a bad trade for a box this size.
#
# Files travel as a tar stream over ssh. This workstation has no rsync, and
# the code is small enough that shipping all of it every time costs nothing.
#
# Usage:  ./scripts/deploy.sh [gen|sign|both]
set -euo pipefail

HOST=${DEPLOY_HOST:-root@46.101.139.175}
TARGET=${1:-both}
STAMP=$(date -u +%Y%m%d-%H%M%S)
KEEP=3
ROOT=$(cd "$(dirname "$0")/.." && pwd)

case "$TARGET" in
  gen | sign | both) ;;
  *) echo "usage: $0 [gen|sign|both]" >&2; exit 2 ;;
esac

# What is going out, so a release can always be traced back to a commit.
REVISION=$(git -C "$ROOT" rev-parse --short HEAD)
if [[ -n $(git -C "$ROOT" status --porcelain) ]]; then
  REVISION="$REVISION+uncommitted"
  echo "!! the working tree has uncommitted changes; they will be deployed"
fi

# deploy_app NAME SRV SERVICE OWNER APPDIR
#   APPDIR is "" for the generator (its release root is the repo root) and
#   "sign" for the signing app, whose release keeps the repo's shape —
#   <release>/sign next to <release>/shared — so ../shared resolves inside it.
deploy_app() {
  local name=$1 srv=$2 service=$3 owner=$4 appdir=$5
  local release="/srv/$srv/releases/$STAMP"
  local app="$release${appdir:+/$appdir}"
  local src="$ROOT${appdir:+/$appdir}"
  local paths

  echo "==> building $name"
  (cd "$src" && npm ci --no-audit --no-fund && npm run build)

  if [[ -z $appdir ]]; then
    paths=(dist api shared server.js package.json package-lock.json)
  else
    paths=("$appdir/dist" "$appdir/api" "$appdir/server.js"
           "$appdir/package.json" "$appdir/package-lock.json" shared)
  fi

  echo "==> shipping $name to $release"
  # node_modules never travels: it is installed on the far side, so a Windows
  # tree never reaches Linux.
  tar -C "$ROOT" --exclude='*.test.js' -czf - "${paths[@]}" |
    ssh "$HOST" "mkdir -p '$release' && tar -xzf - -C '$release' --no-same-owner"

  ssh "$HOST" "
    set -euo pipefail
    echo '$REVISION' > '$release/REVISION'
    cd '$app'
    npm ci --omit=dev --no-audit --no-fund
    chown -R $owner:proposals '$release'
    ln -sfn '$release' /srv/$srv/current
    systemctl restart $service
    sleep 2
    systemctl is-active --quiet $service || { journalctl -u $service -n 40 --no-pager; exit 1; }
    ls -1dt /srv/$srv/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
  "
  echo "==> $name is live at $release ($REVISION)"
}

if [[ $TARGET == gen || $TARGET == both ]]; then
  deploy_app "generator" "proposal-generator" "proposal-gen" "proposal-gen" ""
fi

if [[ $TARGET == sign || $TARGET == both ]]; then
  deploy_app "signing app" "proposal-sign" "proposal-sign" "proposal-sign" "sign"
fi

echo "==> reloading nginx"
ssh "$HOST" 'nginx -t && systemctl reload nginx'
