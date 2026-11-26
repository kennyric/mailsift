/**
 * The amount and due date of a bill, read by the model instead of guessed by
 * a regular expression.
 *
 * Only the extracted text is sent, never the PDF. The person's own model and
 * key are used when they configured one; otherwise the shared model is. Any
 * failure returns nothing and the caller keeps the regex hint.
 */
import { getLogger } from '../logger.js';
import { aiGatewayHeaders } from './decider.js';
import { llmConfigForUser } from './llm-config.js';
import { resolveLlmBaseUrl } from './triage.js';

const log = getLogger('bill-ai');
const MAX_TEXT = 12_000;

export interface BillFields {
  amount?: string;
  dueDate?: string;
}

function clean(value: unknown, max: number): string | undefined {
  const text = typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'none') return undefined;
  return text.slice(0, max);
}

/** An amount that already names its money, in letters or a symbol. */
const NAMED_AMOUNT = /[A-Za-z$€£¥₹₩₽]/;

/**
 * The currency a statement is written in, for the total that is printed as a
 * bare number. Banks often show "IDR" in a table header and then the total
 * without repeating it, and a model faithfully copies only what it sees.
 */
const CURRENCY_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bIDR\b/gi, 'IDR'], [/\bUSD\b/gi, 'USD'], [/\bEUR\b/gi, 'EUR'], [/\bGBP\b/gi, 'GBP'],
  [/\bSGD\b/gi, 'SGD'], [/\bMYR\b/gi, 'MYR'], [/\bTHB\b/gi, 'THB'], [/\bPHP\b/gi, 'PHP'],
  [/\bVND\b/gi, 'VND'], [/\bINR\b/gi, 'INR'], [/\bAUD\b/gi, 'AUD'], [/\bCAD\b/gi, 'CAD'],
  [/\bCNY\b/gi, 'CNY'], [/\bJPY\b/gi, 'JPY'], [/\bCHF\b/gi, 'CHF'], [/\bHKD\b/gi, 'HKD'],
  [/\bRp\.?(?=\s*\d)/gi, 'Rp'], [/\bRM(?=\s*\d)/gi, 'RM'], [/\bS\$(?=\s*\d)/gi, 'S$'],
];

export function detectCurrency(text: string): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [pattern, code] of CURRENCY_PATTERNS) {
    const count = (text.match(pattern) ?? []).length;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function amountWithCurrency(amount: string | undefined, currency: string | undefined): string | undefined {
  if (!amount || NAMED_AMOUNT.test(amount)) return amount;
  const code = currency?.trim();
  if (!code) return amount;
  // A local symbol sits against the digits; an ISO code reads with a space.
  const symbol = /^(?:rp\.?|rm|s\$|[$€£¥₹₩₽])$/i.exec(code);
  if (symbol) {
    const lower = symbol[0].toLowerCase();
    const written = lower.startsWith('rp') ? 'Rp' : lower === 'rm' ? 'RM' : lower === 's$' ? 'S$' : symbol[0];
    return `${written}${amount}`;
  }
  return /^[A-Za-z]{2,4}$/.test(code) ? `${code.toUpperCase()} ${amount}` : `${code} ${amount}`;
}

function parseJson(content: string): Record<string, unknown> | undefined {
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function extractBillWithAI(userID: string, text: string): Promise<BillFields> {
  const config = llmConfigForUser(userID);
  if (!config.apiKey || !text.trim()) return {};
  const base = resolveLlmBaseUrl(config.source).replace(/\/+$/, '');
  const body = (jsonMode: boolean): Record<string, unknown> => ({
    model: config.model,
    temperature: 0,
    max_tokens: 400,
    messages: [
      {
        role: 'system',
        content: 'You read a bill or statement and return only JSON: '
          + '{"amount": string|null, "currency": string|null, "due_date": string|null}. '
          + 'amount is the total amount due, exactly as written, including its currency '
          + '(for example "IDR 1.234.567" or "$10.00"). If the total is printed as a bare '
          + 'number but the document states its currency elsewhere, put that currency in '
          + 'front of the number, for example "IDR 2.432.334". '
          + 'currency is the ISO code or symbol the document uses (for example "IDR", '
          + '"USD", "Rp", "$"), or null when the document names none. '
          + 'due_date is the payment due date exactly as written (for example '
          + '"17 November 2026"). If a field is not clearly present, use null. '
          + 'Do not guess or calculate.',
      },
      { role: 'user', content: text.slice(0, MAX_TEXT) },
    ],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  const call = async (jsonMode: boolean): Promise<string> => {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        ...aiGatewayHeaders(),
      },
      body: JSON.stringify(body(jsonMode)),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`LLM ${response.status}: ${raw.slice(0, 160)}`);
    const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    return String(data.choices?.[0]?.message?.content ?? '');
  };
  try {
    let content: string;
    try {
      content = await call(true);
    } catch (error) {
      if (!String(error).toLowerCase().includes('response_format')) throw error;
      content = await call(false);
    }
    const parsed = parseJson(content);
    if (!parsed) return {};
    const currency = clean(parsed['currency'], 16) ?? detectCurrency(text);
    const amount = amountWithCurrency(clean(parsed['amount'], 80), currency);
    const dueDate = clean(parsed['due_date'], 60);
    return { ...(amount ? { amount } : {}), ...(dueDate ? { dueDate } : {}) };
  } catch (error) {
    log.warn(`Bill field extraction failed: ${String(error).slice(0, 160)}`);
    return {};
  }
}
