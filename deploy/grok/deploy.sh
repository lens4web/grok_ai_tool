#!/usr/bin/env bash
set -euo pipefail
umask 027

ROOT=/srv/grok
release=${1:?Usage: grok-deploy RELEASE_ID}
[[ "$release" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }

archive="$ROOT/incoming/$release.tgz"
target="$ROOT/releases/$release"
[[ -f "$archive" && ! -e "$target" ]] || { echo 'Archive missing or release already exists' >&2; exit 1; }
previous=$(readlink -f "$ROOT/current" || true)
if [[ ! -d "$previous" ]]; then previous=''; fi

mkdir "$target"
tar -xzf "$archive" --no-same-owner -C "$target"
[[ -f "$target/server.js" && -d "$target/.next/static" ]] || { echo 'Incomplete standalone archive' >&2; exit 1; }
rm "$archive"

activate() {
  ln -s "$1" "$ROOT/current.next"
  mv -Tf "$ROOT/current.next" "$ROOT/current"
}

healthy() {
  for attempt in {1..30}; do
    if curl -fsS --max-time 3 -H 'X-Grok-Request: 1' -H 'Origin: https://grok.lens4web.com' http://127.0.0.1:3002/api/session > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

activate "$target"
if sudo -n /usr/bin/systemctl restart grok.service && healthy; then
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$ROOT/previous.next"
    mv -Tf "$ROOT/previous.next" "$ROOT/previous"
  fi
  echo "Deployed $release"
else
  echo 'New release failed its health check; rolling back' >&2
  if [[ -n "$previous" ]]; then
    activate "$previous"
    sudo -n /usr/bin/systemctl restart grok.service
    healthy || { echo 'Previous release also failed its health check' >&2; exit 1; }
  else
    sudo -n /usr/bin/systemctl stop grok.service
    rm "$ROOT/current"
  fi
  rm -rf -- "$target"
  exit 1
fi

# Keep the current and previous release to fit the server's small disk.
saved_previous=$(readlink -f "$ROOT/previous" || true)
for directory in "$ROOT"/releases/*; do
  [[ -d "$directory" ]] || continue
  if [[ "$directory" != "$target" && "$directory" != "$saved_previous" ]]; then
    rm -rf -- "$directory"
  fi
done
