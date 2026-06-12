#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "==> Installing dependencies..."
python3 -m pip install -r "$BACKEND_DIR/requirements.txt" --quiet

echo "==> Starting Artus AI... Tarayıcıda http://localhost:8000 adresini açın."
cd "$BACKEND_DIR"
exec python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
