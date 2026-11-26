/**
 * Fetch the PDFs of one person's already-triaged mail and read their text.
 *
 * On demand, a few at a time: the page calls this until nothing is left. The
 * bytes are read over the same IMAP path an attachment preview uses and are
 * never written to disk; only the extracted text and its bill hints are kept.
 */
import { authorizedUsernames } from '../imap/auth.js';
import { fetchAttachmentByMessageId, fetchAttachmentByUid } from '../imap/client.js';
import { mailboxAccount } from '../config.js';
import { extractAmount, extractDueDate, extractPdfText, looksLikeBill, parsePasswords, parseSenderPasswords, passwordCandidates, PdfPasswordError } from './documents.js';
import { readyAccounts } from './settings-runtime.js';
import { readPersonalValues, readSettingsFor } from './settings-store.js';
import type { StateStore } from './state.js';

export interface IndexResult {
  indexed: number;
  failed: number;
  remaining: number;
  errors: string[];
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function indexPdfDocuments(
  userID: string, store: StateStore, limit = 5,
): Promise<IndexResult> {
  const document = readSettingsFor(userID);
  const accounts = readyAccounts(document, authorizedUsernames()).map((mailbox) => mailboxAccount(mailbox));
  const byAddress = new Map(accounts.map((account) => [account.username, account]));
  const personal = readPersonalValues(userID);
  const globalPasswords = parsePasswords(personal['PDF_PASSWORDS']);
  const senderPasswords = parseSenderPasswords(personal['PDF_SENDER_PASSWORDS']);
  const candidates = store.pdfCandidates(300);
  let indexed = 0;
  let failed = 0;
  let worked = 0;
  const errors: string[] = [];

  outer: for (const candidate of candidates) {
    const account = byAddress.get(candidate.account);
    for (const item of candidate.items) {
      // A row from before the location was kept has no account: index it again.
      if (store.getDocument(candidate.dedupKey, item.partId)?.account) continue;
      if (worked >= limit) break outer;
      worked += 1;
      const name = item.filename ?? `part-${item.partId}.pdf`;
      const base = {
        dedupKey: candidate.dedupKey,
        partId: item.partId,
        name,
        mime: item.contentType || 'application/pdf',
        pages: 0,
        text: '',
        amount: null as string | null,
        dueDate: null as string | null,
        bill: looksLikeBill(name, candidate.subject, candidate.sender),
        subject: candidate.subject,
        sender: candidate.sender,
        mailDate: candidate.mailDate,
        account: candidate.account,
        folder: candidate.folder,
        uid: candidate.uid,
        uidValidity: candidate.uidValidity,
        messageId: candidate.messageId,
        error: null as string | null,
        indexedAt: new Date().toISOString(),
      };
      if (!account || !candidate.messageId) {
        store.saveDocument({ ...base, error: 'mailbox unavailable' });
        failed += 1;
        continue;
      }
      try {
        const hint = candidate.folder
          ? {
            folder: candidate.folder,
            ...(candidate.uid !== null ? { uid: candidate.uid } : {}),
            ...(candidate.uidValidity ? { uidValidity: candidate.uidValidity } : {}),
          }
          : undefined;
        // The exact UID first: a Message-ID can be shared by two messages.
        const downloaded = candidate.folder && candidate.uid !== null && candidate.uidValidity
          ? await fetchAttachmentByUid(account, candidate.folder, candidate.uid, candidate.uidValidity, item.partId, {
            asStored: true, limit: MAX_ATTACHMENT_BYTES,
          })
          : await fetchAttachmentByMessageId(account, candidate.messageId, item.partId, hint, {
            asStored: true, limit: MAX_ATTACHMENT_BYTES,
          });
        if (!downloaded) {
          store.saveDocument({ ...base, error: 'attachment not found' });
          failed += 1;
          continue;
        }
        const pdf = await extractPdfText(downloaded.content, passwordCandidates(candidate.sender, globalPasswords, senderPasswords));
        const amount = extractAmount(pdf.text) ?? null;
        store.saveDocument({
          ...base,
          pages: pdf.pages,
          text: pdf.text,
          amount,
          dueDate: extractDueDate(pdf.text) ?? null,
          bill: base.bill || Boolean(amount),
        });
        indexed += 1;
      } catch (error) {
        failed += 1;
        const reason = error instanceof PdfPasswordError ? 'password' : 'unreadable';
        store.saveDocument({ ...base, error: reason });
        if (errors.length < 5) errors.push(`${name}: ${reason}`);
      }
    }
  }

  return { indexed, failed, remaining: store.documentsPending(1000), errors };
}
