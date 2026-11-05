#!/bin/bash
set -euo pipefail
project=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$project"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo 'Apple Silicon macOS build host required' >&2; exit 2; }
[[ $# -le 1 ]] || { echo 'Usage: build-desktop-mac.sh [absolute-output-directory]' >&2; exit 2; }
output=$project/release-mac
if [[ $# == 1 ]]; then output=$1; fi
[[ "$output" == /* && ! -e "$output" && ! -L "$output" ]] || { echo 'Use an unused absolute output directory' >&2; exit 2; }
[[ -x .desktop-runtime/postgres-mac-arm64/bin/postgres ]] || { echo 'Build the Mac PostgreSQL bundle first' >&2; exit 2; }
electron_dist=$project/node_modules/electron/dist
if [[ -n "${MATRIX_MAC_ELECTRON_DIST:-}" ]]; then electron_dist=$MATRIX_MAC_ELECTRON_DIST; fi
[[ -x "$electron_dist/Electron.app/Contents/MacOS/Electron" ]] || { echo 'Provide the matching extracted arm64 Electron runtime' >&2; exit 2; }
file "$electron_dist/Electron.app/Contents/MacOS/Electron" | grep -q arm64
version=$(node -p "require('./package.json').version")
electron_version=$(node -p "require('./package.json').build.electronVersion")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]]
[[ "$(ELECTRON_RUN_AS_NODE=1 "$electron_dist/Electron.app/Contents/MacOS/Electron" -p 'process.versions.electron')" == "$electron_version" ]]
export NODE_ENV=production MIAODA_BUILD_TARGET=standalone CSC_IDENTITY_AUTO_DISCOVERY=false
node node_modules/@nestjs/cli/bin/nest.js build
mkdir -p dist/desktop
cp desktop/publish-capabilities.json dist/desktop/publish-capabilities.json
node node_modules/vite/bin/vite.js build --config vite.config.ts
if [[ -f dist/client/client/index.html ]]; then cp dist/client/client/index.html dist/client/index.html; fi
test -f dist/client/index.html
node node_modules/electron-builder/out/cli/cli.js --mac dir --arm64 --publish never \
  "--config.electronDist=$electron_dist" "--config.directories.output=$output" "--config.mac.executableName=远效" --config.npmRebuild=false
app="$output/mac-arm64/远效.app"
[[ -d "$app" && ! -L "$app" && -f "$app/Contents/Info.plist" ]]
node scripts/sign-desktop-mac.cjs "$app"
codesign --verify --deep --strict "$app"
exe=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
node scripts/verify-packaged-runtime.cjs "$app/Contents/MacOS/$exe"
app_resources="$app/Contents/Resources"
test -x "$app_resources/postgres/bin/postgres"
test ! -e "$app_resources/edge-host"
file "$app_resources/postgres/bin/postgres" | grep -q arm64

artifact="$output/YuanXiao-$version-Mac-arm64"
dmg_stage=$(mktemp -d "$output/.dmg-stage-XXXXXX")
ditto "$app" "$dmg_stage/远效.app"
ln -s /Applications "$dmg_stage/Applications"
hdiutil create -volname '远效' -srcfolder "$dmg_stage" -format UDZO "$artifact.dmg"
productbuild --component "$app" /Applications "$artifact.pkg"
ditto -c -k --sequesterRsrc --keepParent "$app" "$artifact.zip"
(cd "$output" && shasum -a 256 "$(basename "$artifact").dmg" "$(basename "$artifact").pkg" "$(basename "$artifact").zip" > SHA256SUMS-mac.txt)
printf 'Built Mac arm64 artifacts in %s\n' "$output"
