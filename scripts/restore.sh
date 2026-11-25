#!/usr/bin/env bash
#
# Restore a mailsift archive made by scripts/backup.sh.
#
#   scripts/restore.sh backups/mailsift-20261125-210000.tgz.gpg
#   scripts/restore.sh --yes backups/mailsift-20261125-210000.tgz
#
# The service is stopped first, the two volumes are replaced, and it is started
# again. Mail on the providers is never touched. This is destructive: the
# current data and secrets volumes are replaced.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
DATA_VOL="${DATA_VOL:-mailsift_mailsift-data}"
SECRETS_VOL="${SECRETS_VOL:-mailsift_mailsift-secrets}"
ASSUME_YES=0
if [[ "${1:-}" == "--yes" ]]; then ASSUME_YES=1; shift; fi
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 [--yes] <archive.tgz|archive.tgz.gpg>" >&2
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$ARCHIVE" == *.gpg ]]; then
  echo "Decrypting..."
  gpg --batch --yes --output "$WORK/archive.tgz" --decrypt "$ARCHIVE"
  TARBALL="$WORK/archive.tgz"
else
  TARBALL="$ARCHIVE"
fi

tar -tzf "$TARBALL" >/dev/null
tar -C "$WORK" -xzf "$TARBALL"
if [[ ! -f "$WORK/data/mailsift.db" || ! -f "$WORK/secrets/mailsift.key" ]]; then
  echo "The archive does not contain both data/mailsift.db and secrets/mailsift.key." >&2
  exit 1
fi

if [[ "$ASSUME_YES" != "1" ]]; then
  echo "This will replace the live data and secrets volumes with:"
  echo "  $ARCHIVE"
  read -r -p "Type 'restore' to continue: " answer
  [[ "$answer" == "restore" ]] || { echo "Cancelled."; exit 1; }
fi

cd "$COMPOSE_DIR"
docker compose stop mailsift
cleanup() { docker compose start mailsift >/dev/null 2>&1 || true; }
trap 'cleanup; rm -rf "$WORK"' EXIT

docker run --rm \
  -v "${DATA_VOL}:/data" \
  -v "${SECRETS_VOL}:/secrets" \
  -v "$WORK:/restore:ro" \
  alpine:3.20 sh -c '
    set -eu
    find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    find /secrets -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a /restore/data/. /data/
    cp -a /restore/secrets/. /secrets/
  '

docker compose start mailsift
trap 'rm -rf "$WORK"' EXIT
echo "Restore complete. Check: docker compose logs --tail=50 mailsift"
