#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN vacío. Ejecuta: read -rs GH_TOKEN; export GH_TOKEN"
  exit 1
fi
printf '%s' "$GH_TOKEN" | gh auth login --hostname github.com --with-token
gh auth setup-git
git remote set-url origin "https://github.com/gdaniel159/whatsapp-integration-grok.git"
git push -u origin main
echo "OK https://github.com/gdaniel159/whatsapp-integration-grok"
