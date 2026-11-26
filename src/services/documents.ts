/**
 * PDF text, read locally.
 *
 * The bytes never leave this machine and the model is not shown the text
 * unless someone explicitly asks it about a message. Passwords are the
 * person's own: the empty password first, then the list they stored, and
 * nothing else. A statement that still will not open is reported as locked
 * rather than guessed at.
 */
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
  for (const line of value.split(/\r?\n/)) {
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
