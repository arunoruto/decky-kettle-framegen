#!/usr/bin/env bash
# Assembles out/decky-kettle-framegen.zip from the built frontend (dist/) and layer (bin/).
set -euo pipefail
cd "$(dirname "$0")/.."

name=decky-kettle-framegen
stage=out/$name

[ -f dist/index.js ] || { echo "missing dist/index.js, run: pnpm build" >&2; exit 1; }
ls bin/*/libVkLayer_kettle_framegen.so >/dev/null 2>&1 || {
  echo "missing bin/<arch>/libVkLayer_kettle_framegen.so, run: just layer (Linux) or just fetch-layer" >&2
  exit 1
}

rm -rf out
mkdir -p "$stage"
cp -r dist bin main.py package.json plugin.json README.md LICENSE "$stage"/
cp upstream/kettle-framegen/LICENSE "$stage/LICENSE.kettle-framegen"
rsync -a --exclude __pycache__ py_modules "$stage"/
rm -f "$stage"/dist/*.map

(cd out && zip -qr "$name.zip" "$name")
echo "out/$name.zip"
unzip -l "out/$name.zip"
