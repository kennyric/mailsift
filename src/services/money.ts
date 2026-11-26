/**
 * One way to write an amount.
 *
 * The model and the regular expressions keep money as it was printed, which
 * means the same currency arrives as "IDR 2.432.334" from one bank and
 * "Rp. 2,741,577.39" from another. The list shows both in one column, so the
 * stored text is parsed once and written again in the currency's own style:
 * rupiah with Rp and Indonesian separators, other currencies with their
 * narrow symbol and English separators. Text that is not an amount is left
 * untouched.
 */

interface Money {
  currency: string;
  value: number;
  /** The source carried a decimal part, so keep two places. */
  fraction: boolean;
}

/** Longest forms first: US$, S$, HK$ and A$ all end in a dollar sign. */
const PREFIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:US\$|USD)\s*/i, 'USD'],
  [/^(?:S\$|SGD)\s*/i, 'SGD'],
  [/^(?:HK\$|HKD)\s*/i, 'HKD'],
  [/^(?:A\$|AUD)\s*/i, 'AUD'],
  [/^(?:C\$|CAD)\s*/i, 'CAD'],
  [/^(?:CN¥|CNY|RMB)\s*/i, 'CNY'],
  [/^(?:IDR|Rp\.?)\s*/i, 'IDR'],
  [/^(?:MYR|RM)\s*/i, 'MYR'],
  [/^(?:EUR|€)\s*/i, 'EUR'],
  [/^(?:GBP|£)\s*/i, 'GBP'],
  [/^(?:JPY|¥)\s*/i, 'JPY'],
  [/^(?:CHF)\s*/i, 'CHF'],
  [/^(?:THB|฿)\s*/i, 'THB'],
  [/^(?:PHP|₱)\s*/i, 'PHP'],
  [/^(?:VND|₫)\s*/i, 'VND'],
  [/^(?:INR|₹)\s*/i, 'INR'],
  [/^\$\s*/, 'USD'],
];

/** Symbols written after the number, as in "1.234,56 €". */
const SUFFIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s*(?:€|EUR)$/i, 'EUR'],
  [/\s*(?:£|GBP)$/i, 'GBP'],
  [/\s*(?:¥|JPY)$/i, 'JPY'],
  [/\s*(?:₫|VND)$/i, 'VND'],
  [/\s*(?:₹|INR)$/i, 'INR'],
];

/** The separator rules of these currencies put the decimal point last. */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND']);

/** Their narrow symbols are all just "$", so write the code to tell them apart. */
const CODE_DISPLAY = new Set(['SGD', 'AUD', 'CAD', 'HKD', 'CNY', 'CHF']);

/** A list of a hundred documents should not build a hundred formatters. */
const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(key: string, locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let format = FORMATTERS.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    FORMATTERS.set(key, format);
  }
  return format;
}

function parseNumber(raw: string): { value: number; fraction: boolean } | undefined {
  let text = raw.replace(/[^\d.,'\s-]/g, '').replace(/['\s]/g, '');
  if (!/\d/.test(text)) return undefined;
  const negative = text.startsWith('-');
  text = text.replace(/-/g, '');

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let decimal = '';
  if (lastComma >= 0 && lastDot >= 0) {
    decimal = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = text.split(sep);
    const after = parts[parts.length - 1] ?? '';
    // 1.006.507 and 1,006,507 are groups; 10.00 and 611.94 are decimals.
    if (parts.length > 2) decimal = '';
    else if (after.length === 3 && parts[0] !== '0') decimal = '';
    else decimal = sep;
  }

  const grouping = decimal === ',' ? '.' : decimal === '.' ? ',' : (lastComma >= 0 && lastDot < 0 ? ',' : '.');
  const normalized = text.split(grouping).join('').replace(decimal || '.', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  return { value: negative ? -value : value, fraction: decimal !== '' };
}

function readMoney(text: string): Money | undefined {
  let rest = text.trim();
  let currency = '';
  for (const [pattern, code] of PREFIXES) {
    const match = pattern.exec(rest);
    if (!match) continue;
    currency = code;
    rest = rest.slice(match[0].length);
    break;
  }
  if (!currency) {
    for (const [pattern, code] of SUFFIXES) {
      const match = pattern.exec(rest);
      if (!match) continue;
      currency = code;
      rest = rest.slice(0, match.index);
      break;
    }
  }
  if (!currency) return undefined;
  const number = parseNumber(rest);
  if (!number) return undefined;
  return { currency, ...number };
}

/** Write an amount the same way every time, or leave text that is not one. */
export function formatAmount(text: string | null | undefined): string | null | undefined {
  if (!text) return text;
  const money = readMoney(text);
  if (!money) return text;

  if (money.currency === 'IDR') {
    const rupiah = formatter(`IDR-${money.fraction ? 2 : 0}`, 'id-ID', {
      minimumFractionDigits: money.fraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(money.value);
    return `Rp ${rupiah}`.replace(/\u00a0/g, ' ');
  }

  const digits = ZERO_DECIMAL.has(money.currency) ? 0 : 2;
  const display = CODE_DISPLAY.has(money.currency) ? 'code' : 'narrowSymbol';
  return formatter(`${money.currency}-${digits}-${display}`, 'en-US', {
    style: 'currency',
    currency: money.currency,
    currencyDisplay: display,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(money.value).replace(/\u00a0/g, ' ');
}
