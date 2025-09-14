#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi
python3 - <<'PY'
import webbrowser; webbrowser.open("http://localhost:8080")
PY
node server.js
