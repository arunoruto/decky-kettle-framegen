#!/usr/bin/env bash
# Builds the layer into bin/<arch>/ for the plugin zip. Runs on Linux, natively or with a cross
# compiler: CC=aarch64-linux-gnu-gcc STRIP=aarch64-linux-gnu-strip ARCH=aarch64.
#   VULKAN_HEADERS=<Vulkan-Headers checkout>   when the system headers are too old
#                                              (the layer uses VK_EXT_present_timing)
#   TEST=1                                     also run upstream's tests (needs a Vulkan driver)
set -euo pipefail
cd "$(dirname "$0")/.."

ARCH=${ARCH:-$(uname -m)}
CC=${CC:-cc}
STRIP=${STRIP:-strip}
src=upstream/kettle-framegen
work=build/kettle-framegen-$ARCH
out=bin/$ARCH

[ -f "$src/framegen.c" ] || { echo "missing $src, run: git submodule update --init" >&2; exit 1; }

# build out of tree, so the submodule stays clean
rm -rf "$work"
mkdir -p "$work"
cp -r "$src"/. "$work"/
rm -rf "$work/.git"

cflags="-O2"
[ -n "${VULKAN_HEADERS:-}" ] && cflags="$cflags -I$(realpath "$VULKAN_HEADERS")/include"
make -C "$work" CC="$CC" CFLAGS="$cflags"
if [ -n "${TEST:-}" ]; then
  make -C "$work" CC="$CC" CFLAGS="$cflags" test
fi

mkdir -p "$out"
cp "$work/build/libVkLayer_kettle_framegen.so" "$out/"
"$STRIP" "$out/libVkLayer_kettle_framegen.so"
# the manifest sits next to the library; the loader resolves a relative path from the manifest
sed 's|"library_path": *"[^"]*"|"library_path": "./libVkLayer_kettle_framegen.so"|' \
  "$src/VkLayer_kettle_framegen.json" >"$out/VkLayer_kettle_framegen.json"
git -C "$src" rev-parse HEAD >"$out/UPSTREAM"
cp "$src/LICENSE" "$out/LICENSE.kettle-framegen"

echo "built $out:"
ls -l "$out"
