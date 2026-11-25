/**
 * Time-based one-time passwords (RFC 6238), without a dependency.
 *
 * The secret is 20 random bytes in base32, the period 30 seconds, six digits
 * and SHA-1, which every authenticator app supports. Verification accepts the
 * previous and next step, because phone clocks drift.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_MS = 30_000;

export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / PERIOD_MS);
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  message.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Whether a six-digit code matches this secret now, one step either side. */
export function totpMatches(secret: string, code: string, at = Date.now()): boolean {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return false;
  const wanted = Buffer.from(typed);
  for (const step of [-1, 0, 1]) {
    const candidate = Buffer.from(totpCode(secret, at + step * PERIOD_MS));
    if (candidate.length === wanted.length && timingSafeEqual(candidate, wanted)) return true;
  }
  return false;
}

export function otpauthUrl(account: string, secret: string): string {
  const label = encodeURIComponent(`mailsift:${account}`);
  const issuer = encodeURIComponent('mailsift');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
