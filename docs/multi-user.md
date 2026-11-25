# Multiple people on one mailsift

One mailsift instance can serve a household or a small team. Each person
signs in with their own **username and password**, has their own mailboxes,
their own triage state, their own browser notifications, and their own MCP
tokens. The AI provider, poll interval, privacy switches and other
instance-wide costs remain shared.

## Adding a person

1. Sign in as the owner.
2. Open **Settings** → **Users** (or `/users` directly).
3. Enter a username and a temporary password, then press **Create**.
4. Tell the person the username and password. They can change the password
   under **Settings → Access → Change password**.

The Users page shows each person's role, mailbox count, last sign-in and any
failed sign-in attempts. Rename, reset a password, disable, re-enable or delete
a member there. A deleted member's state database is removed; mail on their
provider is not touched.

The owner can never be disabled or deleted from the page. Use
`node dist/src/main.js --reset-admin` if the owner password is lost.

## What is per person

- Mailboxes and IMAP/SMTP credentials.
- Triage records, queue, digest queue, sent copies and drafts.
- Browser push subscriptions.
- MCP tokens (Settings → Access → **My MCP tokens**).
- **About you**, always/never-important sender rules, summary language,
  push threshold, digest on/off and hour, digest threshold, and Feishu/webhook
  outputs.

## Models and API keys

By default everyone uses the owner's provider, model and API key. A member may
replace them in **Settings → AI model**:

- a personal **API key** alone is allowed — it is used with the owner's model;
- a personal **model/provider/endpoint** is allowed only together with a
  personal API key.

Saving a different model while the field falls back to the owner's key is
refused, and the runtime makes the same choice again: without a personal key,
the owner's key is only ever paired with the owner's model. The assistant and
drafting tools use the same per-person choice.

## What is shared

- AI provider, endpoint, model and API key, unless a member overrides them as above.
- Poll interval, IMAP IDLE, concurrency and backfill limits.
- Privacy and retention switches.
- Sender keywords used by the local fallback.
- OAuth app registration (Google/Microsoft). A member can still sign in their
  own Gmail/Outlook mailbox with it.
- The MCP endpoint. Each person's token sees only that person's state.

A member sees shared controls greyed out in Settings and can edit only the
fields marked as personal. If the owner changes a shared setting, the service
restarts after the current poll, as before.

## Sign-in protection

- Passwords are scrypt hashes; sign-in is rate-limited per client and per
  account.
- Five failed attempts lock an account for five minutes. The lock survives a
  restart.
- Any user can turn on **two-step sign-in** under Settings → Access. It uses a
  standard TOTP authenticator (six digits, 30 seconds). The owner cannot turn
  it off for another person without resetting their password.
- Every sign-in, settings save, user change, token rotation and second-factor
  change is recorded on the owner's **Activity** page (`/activity`).

## Backups

The state now includes `data/users/<id>.db` for every member.

```bash
scripts/backup.sh                       # live, consistent, optional encryption
scripts/restore.sh backups/mailsift-….tgz
```

`scripts/backup.sh`:

- reads each SQLite database with `VACUUM INTO`, so the service does not stop;
- puts data and the encryption key in **one** archive;
- checks every database with `PRAGMA integrity_check`;
- encrypts with GPG when `BACKUP_GPG_RECIPIENT` is set;
- writes a SHA-256 checksum, copies to `BACKUP_OFFSITE_DIR` when set, and keeps
  the newest `BACKUP_KEEP` archives.

A daily systemd timer is in `deploy/mailsift-backup.timer`; see
[Deployment](deployment.md#backups-and-the-encryption-key).

## Limits

The owner runs the server and has root on the host. Per-user databases isolate
the application, not the filesystem: someone with root can read every member's
database. If that is unacceptable, give each person their own instance.
