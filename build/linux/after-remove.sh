#!/bin/bash
# Clean leftover desktop entries after deb uninstall
set -e
rm -f /usr/share/applications/watch-x.desktop 2>/dev/null || true
rm -f /usr/share/icons/hicolor/*/apps/watch-x.png 2>/dev/null || true
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
