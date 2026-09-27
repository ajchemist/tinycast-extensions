#!/usr/bin/env bash
# CI only: the gopass CLI the scenarios drive, in /usr/local/bin, which the extension's PATH lists.
set -euo pipefail
version=1.15.18
work=$(mktemp -d)
gh release download "v$version" -R gopasspw/gopass -p "gopass-$version-linux-amd64.tar.gz" -D "$work"
tar -xzf "$work/gopass-$version-linux-amd64.tar.gz" -C "$work" gopass
sudo install -m 0755 "$work/gopass" /usr/local/bin/gopass
gopass --version
