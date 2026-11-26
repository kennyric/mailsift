import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import './setup.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { routeWeb } from '../src/web.js';
import { enterUser } from '../src/web-actions.js';
import { StateStore, storePathFor } from '../src/services/state.js';
import { setSettingsAccountsFor, type Account } from '../src/config.js';
import {
  claimOwner, closeSettingsStore, createUser, issueSetupCode, listUsers, MailboxConflictError,
  newMailboxId, readPersonalSettings, readSettingsFor, readSharedValues, SharedSettingsDenied, signIn,
  updatePersonalSettings, updateSettingsFor, type User,
} from '../src/services/settings-store.js';

let dir: string;
let owner: User;
let member: User;

const account = (address: string): Account => ({
  name: address,
  provider: 'imap',
  username: address,
  host: 'imap.example.com',
  port: 993,
  auth: 'password',
  password: 'app-password',
  folders: ['INBOX'],
  useSsl: true,
});

function addMailbox(userID: string, address: string): void {
  updateSettingsFor(userID, (doc) => {
    doc.mailboxes.push({
      id: newMailboxId(), provider: 'imap', username: address, password: 'app-password',
      name: address, enabled: true,
    });
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mailsift-multiuser-'));
  process.env.STATE_DB_PATH = join(dir, 'mailsift.db');
  process.env.MAILSIFT_KEY_FILE = join(dir, 'mailsift.key');
  claimOwner(issueSetupCode()!, 'owner', 'owner password');
  member = createUser('friend', 'member password')!;
  owner = listUsers().find((user) => user.role === 'owner')!;
  enterUser(owner.id);
});

afterEach(() => {
  closeSettingsStore();
  rmSync(dir, { recursive: true, force: true });
});

function request(path: string, cookie = ''): IncomingMessage {
  const stream = Readable.from([]);
  return Object.assign(stream, {
    method: 'GET',
    url: path,
    headers: { host: '127.0.0.1:8410', ...(cookie ? { cookie } : {}) },
  }) as unknown as IncomingMessage;
}

async function get(path: string, userID: string, store: StateStore): Promise<{ status: number; body: any }> {
  const token = userID === owner.id ? signIn('owner', 'owner password')! : signIn('friend', 'member password')!;
  const answer = await routeWeb(
    request(path, `mailsift_admin=${encodeURIComponent(token)}`),
    new URL(path, 'http://127.0.0.1:8410'),
    'read-token', store, `client-${userID}`,
    { adminAuth: true, writeToken: 'write-token' },
  );
  let body: any = {};
  try { body = JSON.parse(String(answer.body)); } catch { /* a page */ }
  return { status: answer.status, body };
}

describe('per-user settings', { timeout: 30_000 }, () => {
  it('keeps each mailbox list separate', () => {
    addMailbox(owner.id, 'owner@example.com');
    addMailbox(member.id, 'friend@example.com');
    expect(readSettingsFor(owner.id).mailboxes.map((m) => m.username)).toEqual(['owner@example.com']);
    expect(readSettingsFor(member.id).mailboxes.map((m) => m.username)).toEqual(['friend@example.com']);
  });

  it('shares the owner-only scalars but lets a member keep personal ones', () => {
    updateSettingsFor(owner.id, (doc) => { doc.values['POLL_INTERVAL_SECONDS'] = '300'; });
    expect(readSettingsFor(member.id).values['POLL_INTERVAL_SECONDS']).toBe('300');
    expect(() => updateSettingsFor(member.id, (doc) => { doc.values['POLL_INTERVAL_SECONDS'] = '60'; }))
      .toThrow(SharedSettingsDenied);
    expect(readSettingsFor(owner.id).values['POLL_INTERVAL_SECONDS']).toBe('300');

    updateSettingsFor(member.id, (doc) => { doc.values['DIGEST_HOUR'] = '21'; });
    expect(readSettingsFor(member.id).values['DIGEST_HOUR']).toBe('21');
    expect(readSettingsFor(owner.id).values['DIGEST_HOUR']).not.toBe('21');
  });

  it('stores personal overrides without touching the shared values', () => {
    updatePersonalSettings(member.id, (doc) => {
      doc.values['DIGEST_HOUR'] = '21';
      doc.values['QUIET_HOURS_START'] = '22:00';
      doc.values['QUIET_HOURS_END'] = '07:00';
      doc.values['PDF_PASSWORDS'] = 'a secret';
    });
    expect(readSettingsFor(member.id).values['DIGEST_HOUR']).toBe('21');
    expect(readSettingsFor(owner.id).values['DIGEST_HOUR']).not.toBe('21');
    expect(readSharedValues()['DIGEST_HOUR']).not.toBe('21');
    expect(readPersonalSettings(member.id)).toMatchObject({
      DIGEST_HOUR: '21', QUIET_HOURS_START: '22:00', QUIET_HOURS_END: '07:00', PDF_PASSWORDS: 'a secret',
    });
  });

  it('keeps the owner\'s quiet hours when shared settings are saved', () => {
    updatePersonalSettings(owner.id, (doc) => {
      doc.values['QUIET_HOURS_START'] = '22:00';
      doc.values['QUIET_HOURS_END'] = '07:00';
    });
    updateSettingsFor(owner.id, (doc) => { doc.values['POLL_INTERVAL_SECONDS'] = '600'; });
    expect(readPersonalSettings(owner.id)).toMatchObject({ QUIET_HOURS_START: '22:00', QUIET_HOURS_END: '07:00' });
  });

  it('refuses the same address in two accounts', () => {
    addMailbox(owner.id, 'shared@example.com');
    expect(() => addMailbox(member.id, 'shared@example.com')).toThrow(MailboxConflictError);
    expect(readSettingsFor(member.id).mailboxes).toEqual([]);
  });

  it('gives every user a database of their own, and the owner keeps the old path', () => {
    expect(storePathFor(owner.id)).toBe(process.env.STATE_DB_PATH);
    expect(storePathFor(member.id)).not.toBe(process.env.STATE_DB_PATH);
    expect(storePathFor(member.id)).toContain(`users/${member.id}.db`);
  });
});

describe('per-user web isolation', { timeout: 30_000 }, () => {
  it('shows a user only their own mail', async () => {
    addMailbox(owner.id, 'owner@example.com');
    addMailbox(member.id, 'friend@example.com');
    setSettingsAccountsFor(owner.id, [account('owner@example.com')]);
    setSettingsAccountsFor(member.id, [account('friend@example.com')]);

    const ownerStore = new StateStore(storePathFor(owner.id));
    const memberStore = new StateStore(storePathFor(member.id));
    try {
      ownerStore.markSeen('owner-key', 'owner@example.com', 'owner subject');
      ownerStore.recordOutcome('owner-key', 'critical', false, { messageId: '<owner@x>', sender: 'a@x', folder: 'INBOX' });
      memberStore.markSeen('member-key', 'friend@example.com', 'member subject');
      memberStore.recordOutcome('member-key', 'critical', false, { messageId: '<member@x>', sender: 'b@x', folder: 'INBOX' });

      const memberMail = await get('/api/mail?hours=24', member.id, memberStore);
      expect(memberMail.status).toBe(200);
      expect((memberMail.body['mail'] as Array<{ dedupKey: string }>).map((m) => m.dedupKey)).toEqual(['member-key']);

      const ownerMail = await get('/api/mail?hours=24', owner.id, ownerStore);
      expect(ownerMail.status).toBe(200);
      expect((ownerMail.body['mail'] as Array<{ dedupKey: string }>).map((m) => m.dedupKey)).toEqual(['owner-key']);
    } finally {
      ownerStore.close();
      memberStore.close();
    }
  });

  it('gives a member their own settings state and refuses the shared ones', async () => {
    addMailbox(member.id, 'friend@example.com');
    setSettingsAccountsFor(member.id, [account('friend@example.com')]);
    const memberStore = new StateStore(storePathFor(member.id));
    try {
      const state = await get('/api/admin/state', member.id, memberStore);
      expect(state.status).toBe(200);
      expect(state.body['readOnlyShared']).toBe(true);
      expect(state.body['user']).toMatchObject({ username: 'friend', role: 'member' });
      expect((state.body['mailboxes'] as Array<{ username: string }>).map((m) => m.username)).toEqual(['friend@example.com']);
    } finally {
      memberStore.close();
    }
  });
});
