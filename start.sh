#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "==> Installing dependencies..."
pip install -r "$BACKEND_DIR/requirements.txt" --quiet

echo "==> Starting Artus AI..."
cd "$BACKEND_DIR"
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
