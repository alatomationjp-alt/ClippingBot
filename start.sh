#!/usr/bin/env sh
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install
fi
exec node index.js
