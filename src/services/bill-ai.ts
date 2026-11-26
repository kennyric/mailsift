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
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'none') return undefined;
  return text.slice(0, max);
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
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: 'You read a bill or statement and return only JSON: '
          + '{"amount": string|null, "due_date": string|null}. '
          + 'amount is the total amount due, exactly as written, including its currency '
          + '(for example "IDR 1.234.567" or "$10.00"). due_date is the payment due date '
          + 'exactly as written (for example "17 November 2026"). '
          + 'If a field is not clearly present, use null. Do not guess or calculate.',
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
    const amount = clean(parsed['amount'], 80);
    const dueDate = clean(parsed['due_date'], 60);
    return { ...(amount ? { amount } : {}), ...(dueDate ? { dueDate } : {}) };
  } catch (error) {
    log.warn(`Bill field extraction failed: ${String(error).slice(0, 160)}`);
    return {};
  }
}
