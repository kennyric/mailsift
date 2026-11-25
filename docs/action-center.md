# Action centre

The action centre is a sheet over the mail list, opened from the check button
beside **Filters** or from the **Action centre** home-screen shortcut.

It has three sections:

- **Tasks** — create a task with an optional due date and notes. Open a message
  and press **Add task** to keep the message key on the task. Ticking a task
  marks it done; reopening it puts it back; deleting is permanent.
- **Waiting for a reply** — sent mail that is the latest message in its thread
  and has waited at least three days. A reply received, or a later message sent
  from any client, removes it from this list.
- **Deadlines** — unhandled mail whose triage result carried an explicit
  deadline. Opening one goes to the same message in the reader.

Tasks live in the user's own state database, so a member's tasks are never
visible to another account. Nothing is sent to an LLM to maintain the list.

The action centre is also available through the installed app's long-press
shortcut. It is deliberately not a fourth notification channel: deadlines and
waiting replies are listed in the page, not pushed.

## Following up

Follow-ups are derived, not configured. A sent letter is shown when:

1. its thread has no later received message;
2. no later message was sent in the same thread from this account; and
3. at least three days have passed.

The three-day window is fixed in this release. It is intentionally conservative
so a normal same-day reply does not appear as a nudge candidate.
