#!/usr/bin/env bash
# Builds sommel-impresora.exe (Windows x64) on Linux with MinGW.
#   apt-get install -y mingw-w64 autoconf automake libtool make
#   tools/windows-printer/build.sh
# Output: public/descargas/sommel-impresora.exe (served by the site).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$(mktemp -d)}"
LIBWDI_COMMIT=30df0c0  # pbatard/libwdi, 2025-07-17
HOST=x86_64-w64-mingw32

git clone -q https://github.com/pbatard/libwdi.git "$WORK/libwdi"
cd "$WORK/libwdi"
git checkout -q "$LIBWDI_COMMIT"
git apply "$HERE/libwdi-inbox-winusb.patch"
./bootstrap.sh >/dev/null
./configure -q --host=$HOST --disable-shared --enable-static --disable-32bit
make -s -C libwdi

cd "$HERE"
printf '1 24 "sommel-impresora.manifest"\n' > "$WORK/res.rc"
$HOST-windres -I "$HERE" "$WORK/res.rc" -O coff -o "$WORK/res.o"
mkdir -p "$ROOT/public/descargas"
$HOST-gcc -O2 -municode -mwindows -static -I "$WORK/libwdi/libwdi" \
  sommel-impresora.c "$WORK/res.o" -o "$ROOT/public/descargas/sommel-impresora.exe" \
  -L "$WORK/libwdi/libwdi/.libs" -lwdi -lsetupapi -lole32 -lshell32 -lcomctl32 -lgdi32 -luuid
$HOST-strip "$ROOT/public/descargas/sommel-impresora.exe"
sha256sum "$ROOT/public/descargas/sommel-impresora.exe"
