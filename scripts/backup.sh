#!/usr/bin/env bash
#
# Consistent, optional-encrypted, offsite-capable mailsift backup.
#
# It does not stop the service: each SQLite database is read through
# `VACUUM INTO` in a short-lived Node container, which is safe while the
# service is writing. The data and secrets volumes go into ONE archive, so a
# restore can never mix a database with the wrong key.
#
# Configuration (environment):
#   BACKUP_DIR             default /home/kenny/mailsift/backups
#   BACKUP_KEEP            number of archives to keep (default 14)
#   BACKUP_GPG_RECIPIENT   encrypt with this GPG recipient (recommended)
#   BACKUP_OFFSITE_DIR     copy the finished archive here (e.g. a mounted NAS)
#   COMPOSE_DIR            directory with docker-compose.yml (default /home/kenny/mailsift)
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$COMPOSE_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
DATA_VOL="${DATA_VOL:-mailsift_mailsift-data}"
SECRETS_VOL="${SECRETS_VOL:-mailsift_mailsift-secrets}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
STAGE="$BACKUP_DIR/staging/$STAMP"
ARCHIVE="$BACKUP_DIR/mailsift-$STAMP.tgz"
LOCK="$BACKUP_DIR/.backup.lock"

umask 077
mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/staging"
chmod 700 "$BACKUP_DIR"

# One backup at a time; a stuck run should not silently overlap the next.
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another mailsift backup is already running ($LOCK)" >&2
  exit 1
fi
cleanup() {
  # Staging is written by the helper container as root; the operator cannot
  # unlink root-owned files in a root-owned directory, so remove it the same way.
  docker run --rm -e STAMP="$STAMP" -v "$BACKUP_DIR:/backup" alpine:3.20 \
    sh -c 'rm -rf "/backup/staging/$STAMP"' >/dev/null 2>&1 || true
  rmdir "$STAGE" 2>/dev/null || true
  rmdir "$BACKUP_DIR/staging" 2>/dev/null || true
  rm -rf "$LOCK"
}
trap cleanup EXIT

echo "Staging a live snapshot of $DATA_VOL and $SECRETS_VOL..."
docker run --rm \
  -e BACKUP_STAMP="$STAMP" \
  -v "${DATA_VOL}:/data:ro" \
  -v "${SECRETS_VOL}:/secrets:ro" \
  -v "${BACKUP_DIR}:/backup" \
  -v "$COMPOSE_DIR/scripts:/scripts:ro" \
  node:26-alpine node /scripts/backup-sqlite.mjs

echo "Archiving data + secrets together..."
tar -C "$STAGE" -czf "$ARCHIVE" .
chmod 600 "$ARCHIVE"

FINAL="$ARCHIVE"
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  echo "Encrypting for $BACKUP_GPG_RECIPIENT..."
  gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "${ARCHIVE}.gpg" "$ARCHIVE"
  rm -f "$ARCHIVE"
  FINAL="${ARCHIVE}.gpg"
  gpg --batch --list-packets "$FINAL" >/dev/null 2>&1 || {
    echo "Encrypted archive did not verify" >&2
    exit 1
  }
else
  echo "WARNING: BACKUP_GPG_RECIPIENT is not set; the archive is not encrypted." >&2
  tar -tzf "$ARCHIVE" >/dev/null
fi

sha256sum "$FINAL" > "${FINAL}.sha256"
chmod 600 "${FINAL}.sha256"

if [[ -n "${BACKUP_OFFSITE_DIR:-}" ]]; then
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp -p "$FINAL" "${FINAL}.sha256" "$BACKUP_OFFSITE_DIR/"
  echo "Offsite copy: $BACKUP_OFFSITE_DIR"
fi

# Keep the newest N archives and their checksums.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'mailsift-*.tgz' -o -name 'mailsift-*.tgz.gpg' \) \
  -printf '%T@ %p\n' | sort -nr | tail -n +"$((BACKUP_KEEP + 1))" | cut -d' ' -f2- |
  while IFS= read -r old; do rm -f "$old" "$old.sha256"; done

echo "Backup complete: $FINAL"
