#!/usr/bin/env bash
set -e

echo "==> Installing Node.js dependencies..."
npm install --production=false

echo "==> Installing yt-dlp Python package..."
python3 -m pip install --upgrade --user yt-dlp certifi || pip3 install yt-dlp || true

echo "==> Verifying yt-dlp binary..."
export PATH="$HOME/.local/bin:/opt/render/.local/bin:$PATH"
which yt-dlp || echo "yt-dlp will be resolved at runtime"

echo "==> Build finished successfully!"
