#!/usr/bin/env sh
cd "$(dirname "$0")"
npm ci
exec node index.js
