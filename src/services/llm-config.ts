/**
 * Which model and key a piece of work should use.
 *
 * The owner configures the shared provider/model/key. A person may replace
 * the model with their own only when they also supplied their own API key;
 * that invariant is checked when settings are saved and enforced again here,
 * so an old or hand-edited database cannot spend the owner's key on a model
 * the owner never chose.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readPersonalValues, readSharedValues } from './settings-store.js';

export interface LlmConfig {
  /** Values `resolveLlmBaseUrl` reads (provider, base URL). */
  source: Record<string, string | undefined>;
  apiKey: string;
  model: string;
}

const context = new AsyncLocalStorage<LlmConfig>();

/** The configuration of the work under way, or the process environment outside a person's request. */
export function currentLlmConfig(): LlmConfig {
  const stored = context.getStore();
  if (stored) return stored;
  return {
    source: process.env,
    apiKey: process.env.LLM_API_KEY?.trim() ?? '',
    model: process.env.LLM_MODEL?.trim() || 'deepseek-flash',
  };
}

/** Run work with one person's model/key, including promises it starts. */
export function withLlmConfig<T>(config: LlmConfig, work: () => T): T {
  return context.run(config, work);
}

/** The effective configuration for one signed-in person. */
export function llmConfigForUser(userID: string): LlmConfig {
  const shared = readSharedValues();
  const personal = readPersonalValues(userID);
  const ownKey = personal['LLM_API_KEY']?.trim();
  // Without an own key, use the owner's model and key together. Personal
  // model fields are ignored rather than combined with the owner's key.
  const source: Record<string, string | undefined> = ownKey
    ? { ...shared, ...personal, LLM_API_KEY: ownKey }
    : { ...shared };
  return {
    source,
    apiKey: source['LLM_API_KEY']?.trim() ?? '',
    model: source['LLM_MODEL']?.trim() || 'deepseek-flash',
  };
}
