import { describe, expect, it } from 'vitest';
import { extractAmount, extractDueDate, looksLikeBill, parsePasswords } from '../src/services/documents.js';
import { inQuietHours } from '../src/services/push-dispatcher.js';

describe('PDF passwords', () => {
  it('keeps one per line, trimmed, unique and bounded', () => {
    expect(parsePasswords(' 123456 \n\n123456\n01-01-1990\n')).toEqual(['123456', '01-01-1990']);
    expect(parsePasswords('')).toEqual([]);
    expect(parsePasswords(Array.from({ length: 30 }, (_, i) => `p${i}`).join('\n'))).toHaveLength(20);
  });
});

describe('bill hints', () => {
  it('spots a bill from a file name or subject', () => {
    expect(looksLikeBill('Billing Statement Tokopedia Card', 'Card Center BRI')).toBe(true);
    expect(looksLikeBill('Invoice-11KP7P5R-0001.pdf')).toBe(true);
    expect(looksLikeBill('Tagihan Kartu Kredit')).toBe(true);
    expect(looksLikeBill('holiday-photo.jpg', 'Trip photos')).toBe(false);
  });

  it('reads a rupiah or dollar amount as written', () => {
    expect(extractAmount('Total Rp 1.234.567,00')).toBe('Rp 1.234.567,00');
    expect(extractAmount('Amount due: IDR 250.000')).toBe('IDR 250.000');
    expect(extractAmount('Total $10.00 USD due')).toBe('$10.00');
    expect(extractAmount('no money here')).toBeUndefined();
  });

  it('reads a due date near the label', () => {
    expect(extractDueDate('Jatuh tempo 17 November 2026')).toBe('17 November 2026');
    expect(extractDueDate('Date due November 18, 2026')).toBe('November 18, 2026');
    expect(extractDueDate('Payment due: 2026-12-01')).toBe('2026-12-01');
    expect(extractDueDate('No due date here')).toBeUndefined();
  });
});

describe('quiet hours', () => {
  const at = (hour: number, minute = 0): Date => new Date(2026, 0, 1, hour, minute);

  it('handles a window inside one day', () => {
    expect(inQuietHours({ start: 9 * 60, end: 17 * 60 }, at(8))).toBe(false);
    expect(inQuietHours({ start: 9 * 60, end: 17 * 60 }, at(12))).toBe(true);
    expect(inQuietHours({ start: 9 * 60, end: 17 * 60 }, at(17))).toBe(false);
  });

  it('handles a window across midnight', () => {
    expect(inQuietHours({ start: 22 * 60, end: 7 * 60 }, at(23))).toBe(true);
    expect(inQuietHours({ start: 22 * 60, end: 7 * 60 }, at(3))).toBe(true);
    expect(inQuietHours({ start: 22 * 60, end: 7 * 60 }, at(12))).toBe(false);
  });

  it('is off when there is no window', () => {
    expect(inQuietHours(undefined, at(3))).toBe(false);
    expect(inQuietHours({ start: 60, end: 60 }, at(3))).toBe(false);
  });
});
