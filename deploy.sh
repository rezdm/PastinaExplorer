#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/dist"

if [ ! -d "$DIST" ]; then
    echo "Error: dist/ not found. Run build.sh first."
    exit 1
fi

rsync -avz --delete "$DIST/" pastina:~/htdocs/
