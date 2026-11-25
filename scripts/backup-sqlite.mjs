#!/usr/bin/env node
/**
 * Copy mailsift's data and secrets into a consistent staging directory.
 *
 * SQLite databases are copied with `VACUUM INTO`, which reads a live database
 * (WAL included) without stopping the service and writes a compact, consistent
 * snapshot. Everything else is copied as it is. The shell wrapper encrypts and
 * archives the staged directory.
 */
import { chmodSync, cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const stamp = process.env.BACKUP_STAMP?.trim();
if (!stamp || !/^[0-9A-Za-z._-]+$/.test(stamp)) {
  console.error('BACKUP_STAMP is required and must be a simple name');
  process.exit(2);
}

const data = '/data';
const secrets = '/secrets';
const stage = join('/backup/staging', stamp);
const outData = join(stage, 'data');
const outSecrets = join(stage, 'secrets');

rmSync(stage, { recursive: true, force: true });
mkdirSync(outData, { recursive: true, mode: 0o755 });
mkdirSync(outSecrets, { recursive: true, mode: 0o755 });

/** Every regular file under a directory, as paths relative to it. */
function filesUnder(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(relative(root, full));
    }
  };
  walk(root);
  return found;
}

for (const file of filesUnder(data)) {
  const target = join(outData, file);
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
  cpSync(join(data, file), target, { force: true });
}
for (const file of filesUnder(secrets)) {
  const target = join(outSecrets, file);
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
  cpSync(join(secrets, file), target, { force: true });
}

/** A SQLite database, and its -wal / -shm companions. */
const isDatabase = (file) => file.endsWith('.db');
const databases = filesUnder(data).filter(isDatabase);

for (const file of databases) {
  const source = join(data, file);
  const target = join(outData, file);
  rmSync(target, { force: true });
  rmSync(`${target}-wal`, { force: true });
  rmSync(`${target}-shm`, { force: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    const escaped = target.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    db.close();
  }
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    const row = check.prepare('PRAGMA integrity_check').get();
    if (!row || String(row.integrity_check ?? row['integrity_check']) !== 'ok') {
      throw new Error(`${file}: integrity_check did not return ok`);
    }
  } finally {
    check.close();
  }
}

// The helper writes as root into a directory owned by the operator. The
// archive is mode 600; staging only has to be readable long enough for tar.
for (const root of [outData, outSecrets]) {
  const chmodTree = (dir) => {
    chmodSync(dir, 0o755);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) chmodTree(full);
      else if (entry.isFile()) chmodSync(full, 0o644);
    }
  };
  chmodTree(root);
}
chmodSync(stage, 0o755);

const bytes = databases.reduce((sum, file) => sum + statSync(join(outData, file)).size, 0);
console.log(`staged ${databases.length} SQLite database(s), ${bytes} bytes, at ${stage}`);
