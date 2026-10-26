#!/usr/bin/env bash
set -euo pipefail

version="$(node -p "require('./package.json').version")"
tool_url="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
update_base_url="https://github.com/piratuks/invoice-builder/releases/download/v${version}"
repo_root="$(pwd)"

shopt -s nullglob
appimages=(release/*.AppImage)
if ((${#appimages[@]} == 0)); then
  echo "No AppImage found in release/" >&2
  exit 1
fi

tool_dir="$(mktemp -d)"
trap 'rm -rf "$tool_dir"' EXIT
tool_path="$tool_dir/appimagetool.AppImage"
curl --fail --location --retry 3 "$tool_url" --output "$tool_path"
chmod +x "$tool_path"

for appimage in "${appimages[@]}"; do
  filename="$(basename "$appimage")"
  work_dir="$tool_dir/$filename-work"
  mkdir "$work_dir"
  update_info="zsync|${update_base_url}/${filename}.zsync"

  (
    cd "$work_dir"
    "$repo_root/$appimage" --appimage-extract
    APPIMAGE_EXTRACT_AND_RUN=1 "$tool_path" \
      --updateinformation "$update_info" \
      "$work_dir/squashfs-root" "$work_dir/$filename"
  )

  mv "$work_dir/$filename" "$appimage"
  mv "$work_dir/$filename.zsync" "release/$filename.zsync"
  chmod +x "$appimage"
done

# Repacking discards electron-builder's appended blockmap and changes the image bytes.
# Do this last: the manifest and zsync must both describe the published image.
node scripts/finalize-appimage-metadata.cjs