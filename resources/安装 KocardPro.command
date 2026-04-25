#!/bin/bash
# KocardPro Installer — removes macOS quarantine and copies to /Applications
set -e

APP="KocardPro.app"
DMG_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DMG_DIR/$APP"

if [ ! -d "$SRC" ]; then
  osascript -e 'display alert "找不到 KocardPro.app" message "请确保此脚本和 KocardPro.app 在同一个 DMG 中。" as critical'
  exit 1
fi

DEST="/Applications/$APP"

# Copy to /Applications (overwrite if exists)
cp -R "$SRC" "$DEST"

# Remove quarantine attribute recursively
xattr -rd com.apple.quarantine "$DEST" 2>/dev/null || true

osascript -e 'display notification "KocardPro 已安装到应用程序文件夹，可直接打开。" with title "安装完成 ✓"'

open /Applications
