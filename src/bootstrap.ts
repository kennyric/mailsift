/**
 * Load the stored settings before any other module reads its configuration.
 *
 * Imported for its side effect, right after env.js, by every entry point that
 * runs against the server's data (main, the MCP server, the tools in scripts/).
 * Several modules read process.env once when they load, so this has to come
 * first. A failure is kept rather than thrown, so main can say what is wrong
 * in plain words instead of a stack trace from an import.
 */
import { authorizedUsernames } from './imap/auth.js';
import { ensureAccessTokens, listUsers, readSettings, readSettingsFor } from './services/settings-store.js';
import {
  applySharedSettings, applyUserMailboxes, rememberBootStateAll,
} from './services/settings-runtime.js';

// The database holds message metadata and encrypted credentials: nothing
// mailsift creates should be readable by other users of the machine.
process.umask(0o077);

export let bootstrapError: Error | undefined;

try {
  ensureAccessTokens();
  // The first read also runs the schema and data migrations.
  const shared = readSettings();
  const authorized = authorizedUsernames();
  applySharedSettings(shared.values);
  for (const user of listUsers()) {
    if (user.disabled) continue;
    applyUserMailboxes(user.id, readSettingsFor(user.id), authorized);
  }
  rememberBootStateAll(authorized);
} catch (error) {
  bootstrapError = error instanceof Error ? error : new Error(String(error));
}
