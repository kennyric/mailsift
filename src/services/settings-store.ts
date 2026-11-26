/**
 * The server's own configuration, kept in its database instead of a file the
 * operator edits.
 *
 * Everything an administrator enters on the settings page lives in one
 * document: the scalar settings (named as the environment variables the rest
 * of the code has always read), the mailboxes, and whether first-run setup has
 * been finished. The document and the OAuth token records are encrypted with
 * AES-256-GCM under a key kept in a file of its own (MAILSIFT_KEY_FILE, by
 * default beside the database). In the container that file sits on a separate
 * volume, so a copy of the database alone does not carry a single credential.
 *
 * Administrator access is stored here as well: an scrypt hash of the password,
 * the hash of the one-time setup code printed while no password exists, and
 * the hashes of signed-in browser sessions.
 */
import {
  createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual,
} from 'node:crypto';
import { newTotpSecret, totpMatches } from './totp.js';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = import('node:sqlite').DatabaseSync;

const SETTINGS_ROW = 'settings.v2';
const TOKENS_ROW = 'oauth-tokens.v1';
const PENDING_ROW = 'oauth-pending.v1';
const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 1024;

export class SettingsKeyError extends Error {
  override name = 'SettingsKeyError';
}

/** One monitored mailbox, as the settings page edits it. */
export interface MailboxSettings {
  /** Stable identifier; the address can be edited, this cannot. */
  id: string;
  provider: string;
  username: string;
  /** App password or IMAP password; absent for OAuth mailboxes. */
  password?: string;
  name?: string;
  host?: string;
  port?: number;
  ssl?: boolean;
  /** IMAP folder paths or the keywords `all` and `spam`; empty means INBOX and spam. */
  folders?: string[];
  smtpHost?: string;
  smtpPort?: number;
  fromName?: string;
  authservId?: string;
  /** A disabled mailbox stays configured but is not polled or shown. */
  enabled: boolean;
}

export interface SettingsDocument {
  /** Scalar settings, keyed by their environment names. Absent means default. */
  values: Record<string, string>;
  mailboxes: MailboxSettings[];
  /** When the administrator finished first-run setup; monitoring starts after it. */
  setupCompletedAt?: string;
}

export type UserRole = 'owner' | 'member';

/** Someone who can sign in: the owner, or a member the owner created. */
export interface User {
  id: string;
  username: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
  lastFailedLoginAt?: string;
  failedAttempts?: number;
  lockedUntil?: number;
  totpEnabled?: boolean;
}

/**
 * Settings that belong to the person whose mail is being judged, not to the
 * instance. They live in a sealed per-user document, so a member never
 * inherits the owner's "About you" text, sender rules, language or outputs.
 */
export const PERSONAL_KEYS: ReadonlySet<string> = new Set([
  'MAIL_CONTEXT', 'MAIL_ALWAYS_IMPORTANT', 'MAIL_NEVER_IMPORTANT',
  'LLM_OUTPUT_LANGUAGE', 'PUSH_MIN_IMPORTANCE', 'DIGEST_ENABLED', 'DIGEST_HOUR', 'DIGEST_MIN_IMPORTANCE',
  'FEISHU_WEBHOOK_URL', 'FEISHU_WEBHOOK_SECRET', 'FEISHU_MIN_IMPORTANCE',
  'WEBHOOK_URL', 'WEBHOOK_TOKEN',
  'QUIET_HOURS_START', 'QUIET_HOURS_END', 'PDF_PASSWORDS',
]);

/**
 * Settings a person may replace for their own mail while still inheriting the
 * owner's value when they leave them blank.
 *
 * The row itself is personal only when the person typed a value. The key
 * invariant is enforced in updateSettingsFor: a personal model/provider/
 * endpoint without a personal API key would spend the owner's token on a
 * model the owner did not choose, so it is refused.
 */
export const OVERRIDABLE_KEYS: ReadonlySet<string> = new Set([
  'LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY',
]);

/** A member tried to point the owner's API key at their own model. */
export class LlmOverrideDenied extends Error {
  override name = 'LlmOverrideDenied';
  constructor() { super('Set your own API key before choosing a different model or provider.'); }
}

export interface AdminAuditEvent {
  id: number;
  at: string;
  actorID: string | null;
  actor: string | null;
  action: string;
  target: string | null;
  success: boolean;
  detail: string | null;
}

export interface UserMcpToken {
  id: string;
  writable: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

const emptyDocument = (): SettingsDocument => ({ values: {}, mailboxes: [] });

// ---------------------------------------------------------------------------
// Database and key
// ---------------------------------------------------------------------------

export function settingsDbPath(): string {
  return process.env.STATE_DB_PATH?.trim() || 'data/mailsift.db';
}

/** Where the encryption key lives. In the image this is a volume of its own. */
export function settingsKeyPath(): string {
  const configured = process.env.MAILSIFT_KEY_FILE?.trim();
  return resolve(configured || resolve(dirname(settingsDbPath()), 'mailsift.key'));
}

let connection: { path: string; db: DatabaseSync } | undefined;
const memoryKey = randomBytes(32);
let cachedKey: { path: string; key: Buffer } | undefined;

function database(): DatabaseSync {
  const path = settingsDbPath();
  if (connection?.path === path) return connection.db;
  closeSettingsStore();
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings_admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT,
      setup_code_hash TEXT,
      changed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings_admin_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
      disabled      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      changed_at    TEXT NOT NULL,
      last_login_at TEXT,
      last_failed_login_at TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      actor_id TEXT,
      actor TEXT,
      action TEXT NOT NULL,
      target TEXT,
      success INTEGER NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
    CREATE TABLE IF NOT EXISTS user_mcp_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      writable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_mcp_tokens_user ON user_mcp_tokens(user_id);
  `);
  addColumnIfMissing(db, 'user_sessions', 'credential', "TEXT NOT NULL DEFAULT ''");
  for (const [column, declaration] of [
    ['last_login_at', 'TEXT'],
    ['last_failed_login_at', 'TEXT'],
    ['failed_attempts', 'INTEGER NOT NULL DEFAULT 0'],
    ['locked_until', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) addColumnIfMissing(db, 'users', column, declaration);
  if (path !== ':memory:') {
    try { chmodSync(path, 0o600); } catch { /* not ours to change, e.g. a read-only mount */ }
  }
  connection = { path, db };
  migrateUsers(db);
  ensureSplit(db);
  return db;
}

/** Close the shared connection; the next call opens it again (tests, CLI tools). */
export function closeSettingsStore(): void {
  try { connection?.db.close(); } catch { /* already closed */ }
  connection = undefined;
  cachedKey = undefined;
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, declaration: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Turn the single administrator of an older install into the owner user.
 *
 * Runs once: the first boot that finds no users and an existing password hash
 * copies that hash to `users` under the username `owner`, and drops the old
 * browser sessions. Fresh installs have no hash yet, so they stay empty until
 * the first claim.
 */
function migrateUsers(db: DatabaseSync): void {
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (users.n > 0) return;
  const admin = db.prepare('SELECT password_hash FROM settings_admin WHERE id = 1').get() as
    { password_hash: string | null } | undefined;
  if (!admin?.password_hash) return;
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare(`INSERT INTO users (id, username, password_hash, role, disabled, created_at, changed_at)
      VALUES ('owner', 'owner', ?, 'owner', 0, ?, ?)`).run(admin.password_hash, now, now);
    db.prepare('DELETE FROM settings_admin_sessions').run();
  });
}

/** Split a pre-multi-user document once: shared values, and the owner's mailboxes. */
function ensureSplit(db: DatabaseSync): void {
  const already = db.prepare('SELECT 1 FROM settings_store WHERE key = ?').get(SHARED_ROW);
  if (already) return;
  const legacyRaw = readSealed(SETTINGS_ROW);
  if (legacyRaw === undefined) return;
  const legacy = parseDocument(legacyRaw);
  transaction(db, () => {
    writeSealed(SHARED_ROW, JSON.stringify({ values: legacy.values }));
    writeSealed(mailboxRow('owner'), JSON.stringify({
      mailboxes: legacy.mailboxes,
      ...(legacy.setupCompletedAt ? { setupCompletedAt: legacy.setupCompletedAt } : {}),
    }));
  });
}

function readKeyFile(path: string): Buffer | undefined {
  try {
    const key = readFileSync(path);
    if (key.length !== 32) throw new SettingsKeyError(`The settings key at ${path} is not a 32-byte key.`);
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * The key, created on first use. Never created when encrypted data already
 * exists: a fresh key could not read it, and writing over it would silently
 * destroy every stored credential.
 */
function encryptionKey(): Buffer {
  if (settingsDbPath() === ':memory:') return memoryKey;
  const path = settingsKeyPath();
  if (cachedKey?.path === path) return cachedKey.key;
  let key = readKeyFile(path);
  if (!key) {
    const existing = database().prepare('SELECT COUNT(*) AS n FROM settings_store WHERE key IN (?, ?, ?)')
      .get(SETTINGS_ROW, TOKENS_ROW, PENDING_ROW) as { n: number };
    if (existing.n > 0) {
      throw new SettingsKeyError(
        `The stored settings are encrypted, but the key file ${path} is missing. ` +
        'Restore it from the backup of the secrets volume, or start with an empty data volume.',
      );
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      writeFileSync(path, randomBytes(32), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    key = readKeyFile(path);
    if (!key) throw new SettingsKeyError(`Could not create the settings key at ${path}.`);
  }
  try { chmodSync(path, 0o600); } catch { /* read-only secret mounts are fine */ }
  cachedKey = { path, key };
  return key;
}

function encrypt(purpose: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`mailsift:${purpose}`));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

function decrypt(purpose: string, sealed: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || body === undefined) {
    throw new SettingsKeyError('Stored settings have an unknown format.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`mailsift:${purpose}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof SettingsKeyError) throw error;
    throw new SettingsKeyError(
      `The stored settings cannot be decrypted with the key at ${settingsKeyPath()}. ` +
      'It is not the key they were written with.',
    );
  }
}

function readSealed(row: string): string | undefined {
  const found = database().prepare('SELECT value FROM settings_store WHERE key = ?').get(row) as { value: string } | undefined;
  return found ? decrypt(row, found.value) : undefined;
}

function writeSealed(row: string, plaintext: string): void {
  database().prepare('INSERT INTO settings_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(row, encrypt(row, plaintext));
}

// ---------------------------------------------------------------------------
// The settings document
// ---------------------------------------------------------------------------

function normalizeMailbox(raw: unknown): MailboxSettings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const m = raw as Record<string, unknown>;
  const str = (key: string): string | undefined => typeof m[key] === 'string' && m[key] ? m[key] as string : undefined;
  const num = (key: string): number | undefined => typeof m[key] === 'number' && Number.isFinite(m[key]) ? m[key] as number : undefined;
  const id = str('id');
  const provider = str('provider');
  const username = str('username');
  if (!id || !provider || !username) return undefined;
  const folders = Array.isArray(m['folders']) ? (m['folders'] as unknown[]).filter((f): f is string => typeof f === 'string' && f !== '') : [];
  const out: MailboxSettings = { id, provider, username, enabled: m['enabled'] !== false };
  const optional: Array<[keyof MailboxSettings, unknown]> = [
    ['password', str('password')], ['name', str('name')], ['host', str('host')], ['port', num('port')],
    ['ssl', typeof m['ssl'] === 'boolean' ? m['ssl'] : undefined], ['smtpHost', str('smtpHost')],
    ['smtpPort', num('smtpPort')], ['fromName', str('fromName')], ['authservId', str('authservId')],
  ];
  for (const [key, value] of optional) if (value !== undefined) (out as unknown as Record<string, unknown>)[key] = value;
  if (folders.length) out.folders = folders;
  return out;
}

function parseDocument(raw: string | undefined): SettingsDocument {
  if (!raw) return emptyDocument();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyDocument();
  const p = parsed as Record<string, unknown>;
  const values: Record<string, string> = {};
  if (p['values'] && typeof p['values'] === 'object' && !Array.isArray(p['values'])) {
    for (const [key, value] of Object.entries(p['values'] as Record<string, unknown>)) {
      if (typeof value === 'string') values[key] = value;
    }
  }
  const mailboxes = Array.isArray(p['mailboxes'])
    ? (p['mailboxes'] as unknown[]).map(normalizeMailbox).filter((m): m is MailboxSettings => Boolean(m))
    : [];
  return {
    values,
    mailboxes,
    ...(typeof p['setupCompletedAt'] === 'string' && p['setupCompletedAt'] ? { setupCompletedAt: p['setupCompletedAt'] } : {}),
  };
}

// ---------------------------------------------------------------------------
// The split documents: shared scalars, and one mailbox list per user
// ---------------------------------------------------------------------------

const SHARED_ROW = 'shared.v1';
const mailboxRow = (userID: string): string => `mailboxes.v1:${userID}`;
const personalRow = (userID: string): string => `personal.v1:${userID}`;
const totpRow = (userID: string): string => `totp.v1:${userID}`;

interface TotpRecord { secret: string; enabled: boolean }

function readTotp(userID: string): TotpRecord | undefined {
  const raw = readSealed(totpRow(userID));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<TotpRecord>;
    return typeof parsed.secret === 'string' && parsed.secret.length >= 16
      ? { secret: parsed.secret, enabled: parsed.enabled === true }
      : undefined;
  } catch {
    return undefined;
  }
}

export function totpEnabledFor(userID: string): boolean {
  return readTotp(userID)?.enabled === true;
}

/** Start (or restart) an authenticator setup. The second factor stays off until a code proves it. */
export function beginTotp(userID: string): string {
  const secret = newTotpSecret();
  writeSealed(totpRow(userID), JSON.stringify({ secret, enabled: false } satisfies TotpRecord));
  return secret;
}

export function enableTotp(userID: string, code: string): boolean {
  const record = readTotp(userID);
  if (!record || record.enabled || !totpMatches(record.secret, code)) return false;
  writeSealed(totpRow(userID), JSON.stringify({ secret: record.secret, enabled: true } satisfies TotpRecord));
  return true;
}

export function disableTotp(userID: string): void {
  database().prepare('DELETE FROM settings_store WHERE key = ?').run(totpRow(userID));
}

/** The personal overrides this user has saved. Empty for a fresh member. */
export function readPersonalValues(userID: string): Record<string, string> {
  const raw = readSealed(personalRow(userID));
  if (!raw) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseDocument(raw).values)) {
    if (PERSONAL_KEYS.has(key) || OVERRIDABLE_KEYS.has(key)) values[key] = value;
  }
  return values;
}

/** The shared (owner) values, without any member's overrides. Never includes personal keys. */
export function readSharedValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(readShared().values)) {
    // Personal keys never fall back to the owner; LLM overrides do, because a
    // member who has not chosen a model should use the owner's without spending
    // anything of their own.
    if (PERSONAL_KEYS.has(key)) continue;
    values[key] = value;
  }
  return values;
}

/** One person's explicit overrides, which is what the model/key rule is checked against. */
export function readLlmOverrides(userID: string): Record<string, string> {
  const personal = readPersonalValues(userID);
  const out: Record<string, string> = {};
  for (const key of OVERRIDABLE_KEYS) {
    if (personal[key]?.trim()) out[key] = personal[key]!;
  }
  return out;
}

/** Shared values as one person may see them: a member does not inherit the owner's personal keys. */
function effectiveValues(userID: string): Record<string, string> {
  const shared = readShared().values;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(shared)) {
    if (roleOf(userID) === 'member' && PERSONAL_KEYS.has(key)) continue;
    values[key] = value;
  }
  return { ...values, ...readPersonalValues(userID) };
}

function writePersonalValues(userID: string, values: Record<string, string>): void {
  const personal: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (PERSONAL_KEYS.has(key) || OVERRIDABLE_KEYS.has(key)) personal[key] = value;
  }
  writeSealed(personalRow(userID), JSON.stringify({ values: personal }));
}

/** A mailbox address already belongs to somebody else on this instance. */
export class MailboxConflictError extends Error {
  override name = 'MailboxConflictError';
  constructor(readonly address: string, readonly ownerID: string) {
    super(`${address} is already monitored by another account.`);
  }
}

/** A member tried to change the owner's shared scalar settings. */
export class SharedSettingsDenied extends Error {
  override name = 'SharedSettingsDenied';
  constructor() { super('Only the owner can change the shared settings.'); }
}

function readShared(): { values: Record<string, string> } {
  const raw = readSealed(SHARED_ROW);
  if (raw) return { values: parseDocument(raw).values };
  // Before the split, one document held everything.
  return { values: parseDocument(readSealed(SETTINGS_ROW)).values };
}

function readMailboxDocument(userID: string): { mailboxes: MailboxSettings[]; setupCompletedAt?: string } {
  const raw = readSealed(mailboxRow(userID));
  if (raw) {
    const doc = parseDocument(raw);
    return { mailboxes: doc.mailboxes, ...(doc.setupCompletedAt ? { setupCompletedAt: doc.setupCompletedAt } : {}) };
  }
  if (userID === 'owner') {
    const legacy = parseDocument(readSealed(SETTINGS_ROW));
    return { mailboxes: legacy.mailboxes, ...(legacy.setupCompletedAt ? { setupCompletedAt: legacy.setupCompletedAt } : {}) };
  }
  return { mailboxes: [] };
}

/** The document a user sees: shared scalars, their personal overrides, and their own mailboxes. */
export function readSettingsFor(userID: string): SettingsDocument {
  const boxes = readMailboxDocument(userID);
  return {
    values: effectiveValues(userID),
    mailboxes: boxes.mailboxes,
    ...(boxes.setupCompletedAt ? { setupCompletedAt: boxes.setupCompletedAt } : {}),
  };
}

/** The owner's view, kept for CLI tools and paths that predate the split. */
export function readSettings(): SettingsDocument {
  return readSettingsFor('owner');
}

function roleOf(userID: string): UserRole | undefined {
  const row = database().prepare('SELECT role FROM users WHERE id = ?').get(userID) as { role: UserRole } | undefined;
  return row?.role;
}

/** The first other user who already lists one of these addresses, if any. */
function mailboxClash(userID: string, mailboxes: MailboxSettings[]): { address: string; ownerID: string } | undefined {
  const wanted = new Map<string, string>();
  for (const mailbox of mailboxes) {
    const address = mailbox.username.trim().toLowerCase();
    if (address) wanted.set(address, mailbox.username);
  }
  if (wanted.size === 0) return undefined;
  const rows = database().prepare("SELECT key FROM settings_store WHERE key LIKE 'mailboxes.v1:%'").all() as unknown as { key: string }[];
  for (const { key } of rows) {
    const otherID = key.slice('mailboxes.v1:'.length);
    if (otherID === userID) continue;
    let doc: SettingsDocument;
    try {
      doc = parseDocument(readSealed(key));
    } catch {
      continue; // an unreadable document cannot be compared; the save still must not touch it
    }
    for (const mailbox of doc.mailboxes) {
      const address = mailbox.username.trim().toLowerCase();
      if (wanted.has(address)) return { address: wanted.get(address)!, ownerID: otherID };
    }
  }
  return undefined;
}

/**
 * Change one user's document atomically. Shared values are written only for
 * the owner (or a legacy/test call with no user row); a member's change that
 * touches them is refused rather than silently ignored.
 */
export function updateSettingsFor(userID: string, change: (doc: SettingsDocument) => void): SettingsDocument {
  const db = database();
  return transaction(db, () => {
    const shared = readShared();
    const before = effectiveValues(userID);
    const boxes = readMailboxDocument(userID);
    const doc: SettingsDocument = {
      values: { ...before },
      mailboxes: boxes.mailboxes.map((mailbox) => ({ ...mailbox })),
      ...(boxes.setupCompletedAt ? { setupCompletedAt: boxes.setupCompletedAt } : {}),
    };
    change(doc);
    const clash = mailboxClash(userID, doc.mailboxes);
    if (clash) throw new MailboxConflictError(clash.address, clash.ownerID);

    // Work out which keys actually changed, and split them by scope. A member
    // may change the personal ones; only the owner may change the shared ones.
    const changed = new Set<string>();
    for (const key of new Set([...Object.keys(before), ...Object.keys(doc.values)])) {
      if (before[key] !== doc.values[key]) changed.add(key);
    }
    const role = roleOf(userID);
    const personalChanged = new Set([...changed].filter((key) =>
      PERSONAL_KEYS.has(key) || (role === 'member' && OVERRIDABLE_KEYS.has(key))));
    const sharedChanges = [...changed].filter((key) => !personalChanged.has(key));
    if (sharedChanges.length && role === 'member') throw new SharedSettingsDenied();
    if (personalChanged.size) {
      const nextPersonal = { ...readPersonalValues(userID) };
      for (const key of personalChanged) {
        const value = doc.values[key];
        if (value === undefined || value === '') delete nextPersonal[key];
        else nextPersonal[key] = value;
      }
      // The rule that makes a shared key safe: an admin token may only spend
      // on the admin model. A personal model/provider/endpoint is allowed only
      // alongside a personal API key.
      if (role === 'member' && !nextPersonal['LLM_API_KEY']?.trim()
        && (nextPersonal['LLM_MODEL']?.trim() || nextPersonal['LLM_PROVIDER']?.trim() || nextPersonal['LLM_BASE_URL']?.trim())) {
        throw new LlmOverrideDenied();
      }
      writePersonalValues(userID, nextPersonal);
    }
    if (sharedChanges.length) {
      const nextShared = { ...shared.values };
      for (const key of sharedChanges) {
        const value = doc.values[key];
        if (value === undefined || value === '') delete nextShared[key];
        else nextShared[key] = value;
      }
      writeSealed(SHARED_ROW, JSON.stringify({ values: nextShared }));
    }
    writeSealed(mailboxRow(userID), JSON.stringify({
      mailboxes: doc.mailboxes,
      ...(doc.setupCompletedAt ? { setupCompletedAt: doc.setupCompletedAt } : {}),
    }));
    if (role !== 'member') {
      // One release of rollback compatibility: the previous image reads this
      // row, so it must contain the owner's data and never a member's.
      writeSealed(SETTINGS_ROW, JSON.stringify({
        values: readSettingsFor(userID).values,
        mailboxes: doc.mailboxes,
        ...(doc.setupCompletedAt ? { setupCompletedAt: doc.setupCompletedAt } : {}),
      }));
    }
    return readSettingsFor(userID);
  });
}

/** Change the owner's document; kept for CLI tools and tests. */
export function updateSettings(change: (doc: SettingsDocument) => void): SettingsDocument {
  return updateSettingsFor('owner', change);
}

export function newMailboxId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Random API credentials, created once so MCP and the page always have a key of their own. */
export function ensureAccessTokens(): { read: string; write: string } {
  const values = readSettings().values;
  if (values['MCP_TOKEN'] && values['MCP_WRITE_TOKEN'] && values['MCP_TOKEN'] !== values['MCP_WRITE_TOKEN']) {
    return { read: values['MCP_TOKEN'], write: values['MCP_WRITE_TOKEN'] };
  }
  const doc = updateSettings((d) => {
    if (!d.values['MCP_TOKEN']) d.values['MCP_TOKEN'] = newAccessToken();
    if (!d.values['MCP_WRITE_TOKEN'] || d.values['MCP_WRITE_TOKEN'] === d.values['MCP_TOKEN']) {
      d.values['MCP_WRITE_TOKEN'] = newAccessToken();
    }
  });
  return { read: doc.values['MCP_TOKEN']!, write: doc.values['MCP_WRITE_TOKEN']! };
}

export function newAccessToken(): string {
  return `ms_${randomBytes(24).toString('base64url')}`;
}

// ---------------------------------------------------------------------------
// OAuth token records (read and written by imap/auth.ts)
// ---------------------------------------------------------------------------

export function readOAuthTokens(): string | undefined {
  return readSealed(TOKENS_ROW);
}

/** Read, change and write the token records in one transaction, so two refreshes cannot overwrite each other. */
export function updateOAuthTokens(change: (current: string | undefined) => string): void {
  const db = database();
  transaction(db, () => {
    writeSealed(TOKENS_ROW, change(readSealed(TOKENS_ROW)));
  });
}

/**
 * An OAuth sign-in between its start and the provider's redirect. Kept in the
 * database rather than in memory, because saving the mailbox it belongs to
 * may restart the service in between.
 */
export interface PendingSignIn {
  /** The person whose mailbox is being authorized; absent on records from before multi-user. */
  userID?: string;
  mailboxId: string;
  username: string;
  verifier: string;
  redirectUri: string;
  scope: string;
  /** The page's own origin, to go back to after the provider's redirect. */
  returnTo: string;
  expiresAt: number;
}

function readPending(): Record<string, PendingSignIn> {
  const raw = readSealed(PENDING_ROW);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const now = Date.now();
  const out: Record<string, PendingSignIn> = {};
  for (const [state, value] of Object.entries(parsed as Record<string, PendingSignIn>)) {
    if (value && typeof value === 'object' && typeof value.expiresAt === 'number' && value.expiresAt > now) out[state] = value;
  }
  return out;
}

export function savePendingSignIn(state: string, pending: PendingSignIn): void {
  const db = database();
  transaction(db, () => {
    const all = readPending();
    // One sign-in per mailbox at a time: starting again replaces the earlier one.
    for (const [key, value] of Object.entries(all)) if (value.mailboxId === pending.mailboxId) delete all[key];
    all[state] = pending;
    writeSealed(PENDING_ROW, JSON.stringify(all));
  });
}

/** The pending sign-in for this state, removed so it is used once. */
export function takePendingSignIn(state: string): PendingSignIn | undefined {
  if (!state || state.length > 200) return undefined;
  const db = database();
  return transaction(db, () => {
    const all = readPending();
    const found = all[state];
    if (!found) return undefined;
    delete all[state];
    writeSealed(PENDING_ROW, JSON.stringify(all));
    return found;
  });
}

// ---------------------------------------------------------------------------
// Administrator access
// ---------------------------------------------------------------------------

const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

function digestMatches(expected: string, presented: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(digest(presented), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const SCRYPT = { N: 32_768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt$32768$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function passwordMatches(encoded: string, password: string): boolean {
  const [scheme, cost, salt, hash] = encoded.split('$');
  if (scheme !== 'scrypt' || !cost || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    ...SCRYPT, N: Number(cost),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordProblem(password: string): 'short' | 'long' | undefined {
  if ([...password].length < MIN_PASSWORD) return 'short';
  if (password.length > MAX_PASSWORD) return 'long';
  return undefined;
}

export const ADMIN_PASSWORD_MIN = MIN_PASSWORD;

/** Crockford's alphabet: nothing that reads as another character in a log. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newSetupCode(): string {
  const bytes = randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i += 1) code += CODE_ALPHABET[bytes[i]! % 32];
  return code.match(/.{4}/g)!.join('-');
}

/** How a typed code is compared: case, spaces and dashes do not matter, nor O for 0 or I/L for 1. */
export function normalizeSetupCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

interface AdminRow { password_hash: string | null; setup_code_hash: string | null }

function adminRow(): AdminRow | undefined {
  return database().prepare('SELECT password_hash, setup_code_hash FROM settings_admin WHERE id = 1').get() as AdminRow | undefined;
}

export function adminPasswordSet(): boolean {
  return Boolean(adminRow()?.password_hash);
}

/**
 * A new one-time setup code while no administrator password exists, else
 * nothing. Each start replaces the previous code, so a code lost with a
 * rotated log is never a dead end: restarting prints a fresh one.
 */
export function issueSetupCode(): string | undefined {
  const db = database();
  return transaction(db, () => {
    if (adminRow()?.password_hash) return undefined;
    const code = newSetupCode();
    db.prepare(`INSERT INTO settings_admin (id, password_hash, setup_code_hash, changed_at) VALUES (1, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET setup_code_hash = excluded.setup_code_hash, changed_at = excluded.changed_at`)
      .run(digest(normalizeSetupCode(code)), new Date().toISOString());
    return code;
  });
}

/** Forget the password and every session, and return a new setup code (`--reset-admin`). */
export function resetAdmin(): string {
  const db = database();
  return transaction(db, () => {
    const code = newSetupCode();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO settings_admin (id, password_hash, setup_code_hash, changed_at) VALUES (1, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET password_hash = NULL, setup_code_hash = excluded.setup_code_hash, changed_at = excluded.changed_at`)
      .run(digest(normalizeSetupCode(code)), now);
    db.exec('DELETE FROM settings_admin_sessions');
    // Lock the owner row with a password nobody knows; claiming sets a new one.
    db.prepare("UPDATE users SET password_hash = ?, changed_at = ? WHERE role = 'owner'")
      .run(hashPassword(randomBytes(32).toString('base64url')), now);
    db.prepare("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'owner')").run();
    // A reset must not leave the old authenticator as the only way in.
    db.prepare('DELETE FROM settings_store WHERE key = ?').run(totpRow('owner'));
    return code;
  });
}

// ---------------------------------------------------------------------------
// Users and sessions
// ---------------------------------------------------------------------------

interface UserRow {
  id: string; username: string; password_hash: string; role: UserRole;
  disabled: number; created_at: string;
  last_login_at?: string | null;
  last_failed_login_at?: string | null;
  failed_attempts?: number;
  locked_until?: number;
}

const toUser = (row: UserRow): User => ({
  id: row.id, username: row.username, role: row.role, disabled: Boolean(row.disabled), createdAt: row.created_at,
  ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {}),
  ...(row.last_failed_login_at ? { lastFailedLoginAt: row.last_failed_login_at } : {}),
  failedAttempts: Number(row.failed_attempts ?? 0),
  lockedUntil: Number(row.locked_until ?? 0),
});

const withTotp = (user: User): User => ({ ...user, totpEnabled: totpEnabledFor(user.id) });

/** Check the current password without creating a session (for disabling a second factor). */
export function verifyUserPassword(userID: string, password: string): boolean {
  const row = database().prepare('SELECT password_hash, disabled FROM users WHERE id = ?').get(userID) as
    { password_hash: string; disabled: number } | undefined;
  return Boolean(row && !row.disabled && password && passwordMatches(row.password_hash, password));
}

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFKC').trim();
}

export function usernameShapeProblem(username: string): 'empty' | 'long' | 'chars' | undefined {
  const name = normalizeUsername(username);
  if (!name) return 'empty';
  if ([...name].length > 64) return 'long';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return 'chars';
  return undefined;
}

/** Why a username cannot be used, for the form to say. */
export function usernameProblem(username: string, exceptID = ''): 'empty' | 'long' | 'chars' | 'taken' | undefined {
  const shape = usernameShapeProblem(username);
  if (shape) return shape;
  const name = normalizeUsername(username);
  const taken = database().prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id <> ?').get(name, exceptID);
  return taken ? 'taken' : undefined;
}

/**
 * Whether somebody can sign in as the owner right now.
 *
 * A pending setup code means the owner is locked out on purpose (a reset), so
 * this is false even when the row exists: the claim page is what reopens it.
 */
export function ownerClaimed(): boolean {
  const row = database().prepare(`
    SELECT 1 FROM users u JOIN settings_admin a ON a.id = 1
    WHERE u.role = 'owner' AND u.disabled = 0 AND a.setup_code_hash IS NULL
    LIMIT 1
  `).get();
  return Boolean(row);
}

/** The mark a push subscription made in this session carries (see credentialMark in web-http). */
function sessionCredential(token: string): string {
  return createHash('sha256').update(`mailsift-credential:session:${token}`, 'utf8').digest('hex').slice(0, 24);
}

function newUserSession(db: DatabaseSync, userID: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO user_sessions (token_hash, user_id, credential, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(digest(token), userID, sessionCredential(token), now, now + ADMIN_SESSION_TTL_MS);
  return token;
}

/**
 * Claim the instance: the setup code plus the owner's username and password.
 *
 * Re-usable after `resetAdmin`, which leaves the owner row in place but sets a
 * fresh code and an unusable password; claiming updates that row rather than
 * creating a second owner.
 */
export function claimOwner(code: string, username: string, password: string): string | undefined {
  const name = normalizeUsername(username);
  if (passwordProblem(password) || usernameShapeProblem(name) !== undefined) return undefined;
  const db = database();
  // Hash outside the transaction: scrypt takes a moment and must not hold the write lock.
  const hashed = hashPassword(password);
  return transaction(db, () => {
    const admin = adminRow();
    if (!admin?.setup_code_hash) return undefined;
    if (!digestMatches(admin.setup_code_hash, normalizeSetupCode(code))) return undefined;
    const existing = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get() as { id: string } | undefined;
    const clash = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id <> ?')
      .get(name, existing?.id ?? '');
    if (clash) return undefined;
    const now = new Date().toISOString();
    const id = existing?.id ?? 'owner';
    if (existing) {
      db.prepare('UPDATE users SET username = ?, password_hash = ?, disabled = 0, changed_at = ? WHERE id = ?')
        .run(name, hashed, now, id);
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    } else {
      db.prepare(`INSERT INTO users (id, username, password_hash, role, disabled, created_at, changed_at)
        VALUES (?, ?, ?, 'owner', 0, ?, ?)`).run(id, name, hashed, now, now);
    }
    // Kept in step for one release so the previous image can still sign in on rollback.
    db.prepare('UPDATE settings_admin SET password_hash = ?, setup_code_hash = NULL, changed_at = ? WHERE id = 1')
      .run(hashed, now);
    return newUserSession(db, id);
  });
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 5 * 60_000;

/**
 * Sign a person in, counting failures per account.
 *
 * The per-client rate window in web.ts is the first line; this one survives a
 * restart and stops a distributed guess against one username. A locked account
 * still spends the same scrypt time, so the reason is not revealed.
 */
export function signIn(username: string, password: string, code = ''): string | undefined {
  const db = database();
  const name = normalizeUsername(username);
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(name) as UserRow | undefined;
  if (!row) {
    // Spend the same scrypt time, so an unknown name cannot be told from a wrong password.
    hashPassword(password || 'unknown-user');
    recordAdminAudit({ action: 'signin', target: name.slice(0, 64), success: false, detail: 'unknown user' });
    return undefined;
  }
  const locked = Number(row.locked_until ?? 0) > Date.now();
  const secondFactor = readTotp(row.id);
  const okPassword = Boolean(password) && password.length <= MAX_PASSWORD &&
    passwordMatches(row.password_hash, password);
  const okSecond = !secondFactor?.enabled || totpMatches(secondFactor.secret, code);
  const ok = !locked && okPassword && okSecond;
  if (!ok || row.disabled) {
    const attempts = Number(row.failed_attempts ?? 0) + 1;
    const until = attempts >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : 0;
    const now = new Date().toISOString();
    db.prepare(`UPDATE users SET failed_attempts = ?, last_failed_login_at = ?, locked_until = ? WHERE id = ?`)
      .run(until ? 0 : attempts, now, until, row.id);
    recordAdminAudit({
      actorID: row.id, actor: row.username, action: 'signin', target: row.username,
      success: false,
      detail: locked ? 'account locked' : row.disabled ? 'account disabled'
        : okPassword ? 'wrong authenticator code' : 'wrong password',
    });
    return undefined;
  }
  db.prepare(`UPDATE users SET failed_attempts = 0, last_failed_login_at = NULL, locked_until = 0,
    last_login_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  recordAdminAudit({ actorID: row.id, actor: row.username, action: 'signin', target: row.username, success: true });
  return newUserSession(db, row.id);
}

/** The signed-in user behind a session token, or undefined when it is expired or disabled. */
export function sessionUser(token: string): User | undefined {
  if (!token) return undefined;
  const row = database().prepare(`
    SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0
  `).get(digest(token), Date.now()) as UserRow | undefined;
  return row ? withTotp(toUser(row)) : undefined;
}

export function startUserSession(userID: string): string {
  return newUserSession(database(), userID);
}

/** End this session and return the push credential it carried, so its subscriptions can go too. */
export function endUserSession(token: string): string | undefined {
  if (!token) return undefined;
  const db = database();
  const row = db.prepare('SELECT credential FROM user_sessions WHERE token_hash = ?').get(digest(token)) as
    { credential: string } | undefined;
  db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(digest(token));
  return row?.credential || undefined;
}

/** The push credentials of every live session of a user. */
export function userCredentialMarks(userID: string): string[] {
  const rows = database().prepare(`SELECT credential FROM user_sessions WHERE user_id = ? AND expires_at > ? AND credential <> ''`)
    .all(userID, Date.now()) as unknown as Array<{ credential: string }>;
  return rows.map((row) => row.credential);
}

/** End every session of this user except the one that asked. */
export function endOtherUserSessions(userID: string, keepToken: string): number {
  const result = database().prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?')
    .run(userID, digest(keepToken));
  return Number(result.changes);
}

/** Change one user's password; every session of theirs ends with it. */
export function changeUserPassword(userID: string, current: string, next: string): boolean {
  if (passwordProblem(next)) return false;
  const db = database();
  const row = db.prepare('SELECT password_hash, role FROM users WHERE id = ?').get(userID) as
    { password_hash: string; role: UserRole } | undefined;
  if (!row || !passwordMatches(row.password_hash, current)) return false;
  const hashed = hashPassword(next);
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare('UPDATE users SET password_hash = ?, changed_at = ? WHERE id = ?').run(hashed, now, userID);
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userID);
    // Rollback compatibility for the owner only.
    if (row.role === 'owner') {
      db.prepare('UPDATE settings_admin SET password_hash = ?, changed_at = ? WHERE id = 1').run(hashed, now);
    }
  });
  return true;
}

export function listUsers(): User[] {
  const rows = database().prepare('SELECT * FROM users ORDER BY created_at, username').all() as unknown as UserRow[];
  return rows.map((row) => withTotp(toUser(row)));
}

/** Create a member (the owner is created by the claim). Undefined when the name or password is unsuitable. */
export function createUser(username: string, password: string, role: UserRole = 'member'): User | undefined {
  const name = normalizeUsername(username);
  if (passwordProblem(password) || usernameProblem(name) !== undefined) return undefined;
  const hashed = hashPassword(password);
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();
  const db = database();
  transaction(db, () => {
    db.prepare(`INSERT INTO users (id, username, password_hash, role, disabled, created_at, changed_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`).run(id, name, hashed, role, now, now);
    // A member is past the first-run wizard the moment the owner creates them.
    writeSealed(mailboxRow(id), JSON.stringify({ mailboxes: [], setupCompletedAt: now }));
  });
  return { id, username: name, role, disabled: false, createdAt: now };
}

// ---------------------------------------------------------------------------
// User management (owner actions)
// ---------------------------------------------------------------------------

export function userByID(id: string): User | undefined {
  const row = database().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? withTotp(toUser(row)) : undefined;
}

export function countUsers(): number {
  return Number((database().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n);
}

/** A cap that keeps the laptop's memory and IMAP connections honest. */
export const MAX_USERS = 20;

export function setUserDisabled(id: string, disabled: boolean): boolean {
  const db = database();
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: UserRole } | undefined;
  if (!row || (row.role === 'owner' && disabled)) return false;
  return transaction(db, () => {
    const changed = db.prepare('UPDATE users SET disabled = ?, changed_at = ? WHERE id = ?')
      .run(disabled ? 1 : 0, new Date().toISOString(), id);
    if (disabled) db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    return Number(changed.changes) > 0;
  });
}

/** An owner-set password, for a member who lost theirs. Ends that user's sessions. */
export function resetUserPassword(id: string, password: string): boolean {
  if (passwordProblem(password)) return false;
  const hashed = hashPassword(password);
  const db = database();
  return transaction(db, () => {
    const changed = db.prepare('UPDATE users SET password_hash = ?, changed_at = ? WHERE id = ?')
      .run(hashed, new Date().toISOString(), id);
    if (!Number(changed.changes)) return false;
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    return true;
  });
}

export function renameUser(id: string, username: string): boolean {
  const name = normalizeUsername(username);
  if (usernameProblem(name, id) !== undefined) return false;
  const changed = database().prepare('UPDATE users SET username = ?, changed_at = ? WHERE id = ?')
    .run(name, new Date().toISOString(), id);
  return Number(changed.changes) > 0;
}

/** Delete a member: the row, its sessions, and its mailbox document. Never the owner. */
export function deleteUser(id: string): User | undefined {
  const db = database();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row || row.role === 'owner') return undefined;
  transaction(db, () => {
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_mcp_tokens WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM settings_store WHERE key = ?').run(mailboxRow(id));
    db.prepare('DELETE FROM settings_store WHERE key = ?').run(personalRow(id));
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  return toUser(row);
}

/** The mailboxes of a user, for cleanup before the row goes. */
export function mailboxAddresses(userID: string): string[] {
  return readMailboxDocument(userID).mailboxes.map((mailbox) => mailbox.username);
}

// ---------------------------------------------------------------------------
// Admin audit
// ---------------------------------------------------------------------------

/** Write one administrator or security event. A failure here must never fail the action it records. */
export function recordAdminAudit(input: {
  actorID?: string;
  actor?: string;
  action: string;
  target?: string;
  success: boolean;
  detail?: string;
}): void {
  try {
    database().prepare(
      `INSERT INTO admin_audit (created_at, actor_id, actor, action, target, success, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      new Date().toISOString(),
      input.actorID ?? null,
      input.actor ?? null,
      input.action.slice(0, 80),
      input.target?.slice(0, 200) ?? null,
      input.success ? 1 : 0,
      input.detail?.slice(0, 500) ?? null,
    );
  } catch {
    // The audit is evidence, not the action itself.
  }
}

export function listAdminAudit(limit = 100): AdminAuditEvent[] {
  const rows = database().prepare(
    `SELECT id, created_at, actor_id, actor, action, target, success, detail
     FROM admin_audit ORDER BY id DESC LIMIT ?`,
  ).all(Math.max(1, Math.min(Math.floor(limit), 500))) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: Number(row['id']),
    at: String(row['created_at']),
    actorID: (row['actor_id'] as string) ?? null,
    actor: (row['actor'] as string) ?? null,
    action: String(row['action']),
    target: (row['target'] as string) ?? null,
    success: Boolean(row['success']),
    detail: (row['detail'] as string) ?? null,
  }));
}

/** Drop old audit rows; called with the same retention as the mail records. */
export function pruneAdminAudit(keepDays = 365): number {
  const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString();
  return Number(database().prepare('DELETE FROM admin_audit WHERE created_at < ?').run(cutoff).changes);
}

// ---------------------------------------------------------------------------
// Per-user MCP tokens
// ---------------------------------------------------------------------------

/** A token for one person, so an assistant sees only that person's mail. */
export function createUserMcpToken(userID: string, writable: boolean): { token: string; id: string } {
  const token = `ms_${randomBytes(32).toString('base64url')}`;
  const id = digest(token);
  database().prepare(
    'INSERT INTO user_mcp_tokens (token_hash, user_id, writable, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, userID, writable ? 1 : 0, new Date().toISOString());
  return { token, id };
}

/** Resolve a presented token to its owner and scope. Disabled users lose access at once. */
export function resolveUserMcpToken(token: string): { userID: string; writable: boolean } | undefined {
  if (!token || token.length > 200) return undefined;
  const row = database().prepare(`
    SELECT t.user_id, t.writable, t.token_hash
    FROM user_mcp_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND u.disabled = 0
  `).get(digest(token)) as { user_id: string; writable: number; token_hash: string } | undefined;
  if (!row) return undefined;
  try {
    database().prepare('UPDATE user_mcp_tokens SET last_used_at = ? WHERE token_hash = ?')
      .run(new Date().toISOString(), row.token_hash);
  } catch { /* a used token remains valid even if the timestamp cannot be written */ }
  return { userID: row.user_id, writable: Boolean(row.writable) };
}

export function listUserMcpTokens(userID: string): UserMcpToken[] {
  const rows = database().prepare(
    'SELECT token_hash, writable, created_at, last_used_at FROM user_mcp_tokens WHERE user_id = ? ORDER BY created_at DESC',
  ).all(userID) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row['token_hash']),
    writable: Boolean(row['writable']),
    createdAt: String(row['created_at']),
    lastUsedAt: (row['last_used_at'] as string) ?? null,
  }));
}

/** Revoke one token. The owner's own id and another user's id are both scoped by userID. */
export function revokeUserMcpToken(userID: string, id: string): boolean {
  const result = database().prepare('DELETE FROM user_mcp_tokens WHERE user_id = ? AND token_hash = ?').run(userID, id);
  return Number(result.changes) > 0;
}
