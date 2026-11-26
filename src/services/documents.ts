/**
 * PDF text, read locally.
 *
 * The bytes never leave this machine and the model is not shown the text
 * unless someone explicitly asks it about a message. Passwords are the
 * person's own: the empty password first, then the list they stored, and
 * nothing else. A statement that still will not open is reported as locked
 * rather than guessed at.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** The extraction needs a password that was neither empty nor in the list. */
export class PdfPasswordError extends Error {
  override name = 'PdfPasswordError';
  constructor() { super('the PDF needs a password'); }
}

export interface PdfText {
  text: string;
  pages: number;
  /** Which stored password opened it, when one did. */
  passwordUsed?: string;
}

const MAX_TEXT = 500_000;

function passwordFailure(error: unknown): boolean {
  const code = (error as { code?: number; name?: string } | undefined);
  return code?.name === 'PasswordException' || code?.code === 1 || code?.code === 2;
}

/** One password per line, trimmed, unique, bounded. */
export function parsePasswords(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of value.split(/\r?\n|;/)) {
    const password = line.trim();
    if (!password || seen.has(password)) continue;
    seen.add(password);
    out.push(password);
    if (out.length >= 20) break;
  }
  return out;
}

function tidy(text: string): string {
  return text
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

/** The sender/domain password map, stored as JSON in the personal settings. */
export function parseSenderPasswords(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, password] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof password === 'string' && password.trim()) out[key.trim().toLowerCase()] = password.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** The passwords to try for one sender: its remembered one, its domain's, then the shared list. */
export function passwordCandidates(
  sender: string | null | undefined, globalList: readonly string[], map: Record<string, string>,
): string[] {
  const address = (sender ?? '').trim().toLowerCase();
  const domain = address.includes('@') ? address.split('@').pop() ?? '' : '';
  const out = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value?.trim()) out.add(value.trim());
  };
  add(map[address]);
  add(map[domain]);
  for (const password of globalList) add(password);
  return [...out];
}

export async function extractPdfText(data: Buffer, passwords: readonly string[] = []): Promise<PdfText> {
  const candidates = ['', ...passwords];
  let lastPasswordError = false;
  for (const password of candidates) {
    let doc: Awaited<ReturnType<typeof getDocument>['promise']> | undefined;
    try {
      doc = await getDocument({
        // A copy: pdf.js transfers the buffer to its worker.
        data: new Uint8Array(data),
        password,
        useSystemFonts: true,
        isEvalSupported: false,
        disableFontFace: true,
      }).promise;
    } catch (error) {
      if (passwordFailure(error)) {
        lastPasswordError = true;
        continue;
      }
      throw error;
    }
    try {
      const pages: string[] = [];
      for (let number = 1; number <= doc.numPages; number += 1) {
        const page = await doc.getPage(number);
        try {
          const content = await page.getTextContent();
          const line = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
          pages.push(line);
        } finally {
          page.cleanup();
        }
      }
      return {
        text: tidy(pages.join('\n')),
        pages: doc.numPages,
        ...(password ? { passwordUsed: password } : {}),
      };
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  }
  throw lastPasswordError ? new PdfPasswordError() : new Error('the PDF could not be read');
}

/**
 * The bytes of a PDF opened with a password, via qpdf, or the original bytes
 * when it was not encrypted. qpdf reads files only, so it gets a private
 * temporary directory that is removed whatever happens.
 */
export async function decryptPdf(data: Buffer, passwords: readonly string[] = []): Promise<Buffer> {
  const candidates = ['', ...passwords.filter(Boolean)];
  let locked = false;
  for (const password of candidates) {
    const result = await runQpdf(data, password);
    if (result.ok) return result.output;
    if (result.locked) {
      locked = true;
      continue;
    }
    throw new Error(result.error);
  }
  throw locked ? new PdfPasswordError() : new Error('the PDF could not be opened');
}

async function runQpdf(data: Buffer, password: string): Promise<
  { ok: true; output: Buffer } | { ok: false; locked: boolean; error: string }
> {
  const dir = await mkdtemp(join(tmpdir(), 'mailsift-pdf-'));
  const input = join(dir, 'in.pdf');
  const output = join(dir, 'out.pdf');
  const secret = join(dir, 'password');
  try {
    await writeFile(input, data, { mode: 0o600 });
    if (password) await writeFile(secret, password, { mode: 0o600 });
    const args = ['--decrypt'];
    if (password) args.push(`--password-file=${secret}`);
    args.push(input, output);
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn('qpdf', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        resolve({ code: null, stderr: error.message });
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stderr });
      });
    });
    const text = result.stderr.toLowerCase();
    if (text.includes('invalid password') || text.includes('incorrect password')) {
      return { ok: false, locked: true, error: 'password' };
    }
    // qpdf exits 3 when it repaired a slightly damaged file but still wrote it;
    // bank statements are not always perfectly formed. Only a missing output is
    // a failure when the exit code is 0 or 3.
    if (result.code === 0 || result.code === 3) {
      try {
        const bytes = await readFile(output);
        if (bytes.length) return { ok: true, output: bytes };
      } catch {
        // No output written; fall through to the error below.
      }
    }
    return { ok: false, locked: false, error: result.stderr.trim().slice(0, 200) || `qpdf exited ${result.code}` };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const BILL = /\b(statement|billing|invoice|faktur|tagihan|receipt|kuitansi|e-?statement)\b/i;

/** A bill, so far as the file name and subject can say. */
export function looksLikeBill(...parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => Boolean(part && BILL.test(part)));
}

/** The first amount, as it was written. */
export function extractAmount(text: string): string | undefined {
  const match = /(?:IDR|Rp\.?|USD|US\$|\$)\s*([0-9][0-9.,]{1,})/i.exec(text);
  return match ? match[0].replace(/\s+/g, ' ').trim() : undefined;
}

const DATE = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/;

/** A date near a "due" label, as it was written. */
export function extractDueDate(text: string): string | undefined {
  const label = /(?:jatuh tempo|tanggal jatuh tempo|due date|date due|payment due|pay by|bayar sebelum)/i.exec(text);
  if (!label) return undefined;
  const tail = text.slice(label.index + label[0].length, label.index + label[0].length + 80);
  const date = DATE.exec(tail);
  return date ? date[1]!.trim() : undefined;
}
