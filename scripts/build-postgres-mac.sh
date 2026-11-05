#!/bin/bash
set -euo pipefail
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Apple Silicon macOS build host required' >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 && "$1" == /* && ! -e "$1" && ! -L "$1" ]] || { echo 'Provide an unused absolute PostgreSQL build directory' >&2; exit 2; }
root=$1
version=18.6
archive=postgresql-$version.tar.bz2
mkdir -m 0700 "$root"
cd "$root"
if [[ $# == 2 ]]; then
  [[ "$2" == /* && -f "$2" && ! -L "$2" ]]
  cp "$2" "$archive"
else
  curl --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 240 \
    "https://ftp.postgresql.org/pub/source/v$version/$archive" -o "$archive"
fi
printf '555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f  %s\n' "$archive" | shasum -a 256 -c -
tar -xjf "$archive"
cd "postgresql-$version"
export MACOSX_DEPLOYMENT_TARGET=13.0
./configure --prefix="$root/install" --disable-rpath --without-readline --without-icu --disable-nls >"$root/configure.log" 2>&1
make -j4 >"$root/make.log" 2>&1
make install >"$root/install.log" 2>&1
bundle="$root/postgres"
mkdir -p "$bundle/bin"
for name in postgres pg_ctl initdb createdb psql pg_dump pg_restore; do
  cp "$root/install/bin/$name" "$bundle/bin/"
done
ditto "$root/install/lib" "$bundle/lib"
ditto "$root/install/share" "$bundle/share"
cp COPYRIGHT "$bundle/COPYRIGHT"
while IFS= read -r -d '' file; do
  if ! file -b "$file" | grep -q 'Mach-O'; then continue; fi
  if [[ "$file" == *.dylib ]]; then
    install_name_tool -id "@rpath/$(basename "$file")" "$file"
  fi
  while IFS= read -r dependency; do
    case "$dependency" in
      "$root/install/lib/"*)
        name=$(basename "$dependency")
        [[ -e "$bundle/lib/$name" ]] || { echo "Missing bundled library $name" >&2; exit 1; }
        install_name_tool -change "$dependency" "@loader_path/../lib/$name" "$file"
        ;;
      /usr/lib/*|/System/Library/*|@rpath/*|@loader_path/*) ;;
      *) echo "Unexpected PostgreSQL dependency $dependency" >&2; exit 1 ;;
    esac
  done < <(otool -L "$file" | awk 'NR > 1 { sub(/^[[:space:]]+/, ""); sub(/ [(]compatibility version.*$/, ""); print }')
  codesign --force --sign - "$file"
done < <(find "$bundle/bin" "$bundle/lib" -type f -print0)
"$bundle/bin/postgres" --version
"$bundle/bin/psql" --version
printf 'PostgreSQL bundle ready at %s\n' "$bundle"
