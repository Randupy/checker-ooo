#!/usr/bin/env bash
set -euo pipefail

cd /workspace/checker-ooo
export npm_config_cache=/tmp/checker-npm-cache
export electron_config_cache=/tmp/checker-electron-cache
export ELECTRON_BUILDER_CACHE=/tmp/checker-builder-cache
export XDG_CACHE_HOME=/tmp/checker-xdg-cache
if [[ -n "${HTTPS_PROXY:-}${HTTP_PROXY:-}${https_proxy:-}${http_proxy:-}" ]]; then
  export ELECTRON_GET_USE_PROXY=1
fi

npm ci
npm run setup:desktop
npm run build
