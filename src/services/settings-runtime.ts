/**
 * Hand the stored settings to the rest of mailsift.
 *
 * Scalar settings become the environment variables the code reads; the
 * mailboxes that can be checked become config's accounts. A mailbox is left
 * out while it is disabled, or while it signs in with OAuth and has no
 * authorization stored yet: polling it would only fail and raise alerts.
 */
import { mailboxAccount, setSettingsAccountsFor, type Account } from '../config.js';
import { PROVIDER_PRESETS } from '../config.js';
import { ACCESS_TOKEN_KEYS, FIELD_BY_KEY } from '../settings-catalog.js';
import { listUsers, readSettingsFor, type MailboxSettings, type SettingsDocument } from './settings-store.js';

export type MailboxReadiness = 'ready' | 'disabled' | 'needs-authorization' | 'needs-password' | 'invalid';

export function isOAuthProvider(provider: string): boolean {
  const preset = (PROVIDER_PRESETS as Record<string, { auth: string }>)[provider];
  return Boolean(preset && preset.auth !== 'password');
}

export function mailboxReadiness(mailbox: MailboxSettings, authorized: ReadonlySet<string>): MailboxReadiness {
  if (!mailbox.enabled) return 'disabled';
  if (isOAuthProvider(mailbox.provider)) {
    if (!authorized.has(mailbox.username.toLowerCase())) return 'needs-authorization';
  } else if (!mailbox.password) {
    return 'needs-password';
  }
  try {
    mailboxAccount(mailbox);
    return 'ready';
  } catch {
    return 'invalid';
  }
}

export function readyAccounts(doc: SettingsDocument, authorized: ReadonlySet<string>): Account[] {
  return doc.mailboxes
    .filter((mailbox) => mailboxReadiness(mailbox, authorized) === 'ready')
    .map((mailbox) => mailboxAccount(mailbox));
}

/** What the environment held before any stored setting replaced it. */
const original = new Map<string, string | undefined>();
const projected = new Set<string>();

/**
 * Project the shared scalar settings into process.env. Safe to call again: a
 * value that was removed falls back to what the environment held before
 * mailsift touched it. These values are instance-wide in v1.
 */
export function applySharedSettings(values: Record<string, string>): void {
  const next = new Map<string, string>();
  for (const [key, value] of Object.entries(values)) {
    if (FIELD_BY_KEY.has(key) || (ACCESS_TOKEN_KEYS as readonly string[]).includes(key)) next.set(key, value);
  }
  for (const key of projected) {
    if (next.has(key)) continue;
    const before = original.get(key);
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
    projected.delete(key);
  }
  for (const [key, value] of next) {
    if (!projected.has(key)) original.set(key, process.env[key]);
    process.env[key] = value;
    projected.add(key);
  }
  // The server is always reached through its web view and MCP endpoint.
  process.env.MCP_ENABLED = 'true';
  process.env.WEB_UI_ENABLED = 'true';
  process.env.MCP_PORT ||= '8410';
  process.env.MCP_BIND ||= '127.0.0.1';
}

/** Make one user's ready mailboxes available to config's per-user lookup. */
export function applyUserMailboxes(userID: string, doc: SettingsDocument, authorized: ReadonlySet<string>): Account[] {
  const accounts = readyAccounts(doc, authorized);
  setSettingsAccountsFor(userID, accounts);
  return accounts;
}

/** Legacy single-document entry point: shared values, plus the owner's mailboxes. */
export function applySettings(doc: SettingsDocument, authorized: ReadonlySet<string>): Account[] {
  applySharedSettings(doc.values);
  return applyUserMailboxes('owner', doc, authorized);
}

export interface UserMailboxes {
  userID: string;
  doc: SettingsDocument;
}

function sortedValues(doc: SettingsDocument): Array<[string, string]> {
  return Object.entries(doc.values)
    .filter(([key]) => FIELD_BY_KEY.has(key) || (ACCESS_TOKEN_KEYS as readonly string[]).includes(key))
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * What the running process loaded, reduced to what a restart would change:
 * the shared settings and every enabled user's ready mailboxes. A save that
 * leaves this as it was (a mailbox added that still waits for authorization,
 * a value set back to what it was) needs no restart.
 */
export function runtimeFingerprintFor(
  shared: SettingsDocument, users: readonly UserMailboxes[], authorized: ReadonlySet<string>,
): string {
  const accounts = [...users]
    .sort((a, b) => a.userID.localeCompare(b.userID))
    .flatMap(({ userID, doc }) => readyAccounts(doc, authorized).map((account) => ({ userID, ...account })));
  const setup = [...users]
    .sort((a, b) => a.userID.localeCompare(b.userID))
    .map(({ userID, doc }) => [userID, Boolean(doc.setupCompletedAt)]);
  // Personal overrides (digest hour, push level, rules, quiet hours) change
  // what the runtime does, so they belong in the restart fingerprint too.
  const profiles = [...users]
    .sort((a, b) => a.userID.localeCompare(b.userID))
    .map(({ userID, doc }) => [userID, Object.entries(doc.values).sort(([a], [b]) => a.localeCompare(b))]);
  return JSON.stringify({ values: sortedValues(shared), accounts, setup, profiles });
}

/** The legacy single-document fingerprint, used by unit tests. */
export function runtimeFingerprint(doc: SettingsDocument, authorized: ReadonlySet<string>): string {
  return JSON.stringify({
    values: sortedValues(doc),
    accounts: readyAccounts(doc, authorized).map((account) => ({ ...account })),
    setup: Boolean(doc.setupCompletedAt),
  });
}

/** Every enabled user's mailboxes, as the running process would build them. */
export function currentUserMailboxes(): UserMailboxes[] {
  return listUsers()
    .filter((user) => !user.disabled)
    .map((user) => ({ userID: user.id, doc: readSettingsFor(user.id) }));
}

let bootFingerprint: string | undefined;

export function rememberBootState(doc: SettingsDocument, authorized: ReadonlySet<string>): void {
  bootFingerprint = runtimeFingerprint(doc, authorized);
}

/** Whether the stored settings now differ from what this process started with. */
export function differsFromBoot(doc: SettingsDocument, authorized: ReadonlySet<string>): boolean {
  return bootFingerprint === undefined || runtimeFingerprint(doc, authorized) !== bootFingerprint;
}

/** Startup: remember the shared settings plus every enabled user's mailboxes. */
export function rememberBootStateAll(authorized: ReadonlySet<string>): void {
  bootFingerprint = runtimeFingerprintFor(readSettingsFor('owner'), currentUserMailboxes(), authorized);
}

/** After a save: does the instance now differ from what this process started with? */
export function differsFromBootAll(authorized: ReadonlySet<string>): boolean {
  return bootFingerprint === undefined
    || runtimeFingerprintFor(readSettingsFor('owner'), currentUserMailboxes(), authorized) !== bootFingerprint;
}
