# Insights and subscriptions

**Settings → Insights** (`/insights`) shows what mailsift has been doing for the
signed-in person over the last 30 days:

- messages judged, open/due tasks, LLM tokens and estimated provider cost;
- importance, category and decision-source distributions;
- the most frequent senders;
- recurring/marketing senders with a stored `List-Unsubscribe` link;
- suggested sender rules from feedback;
- the current feedback counts.

All numbers are read from that person's own state database. Another account's
mail, usage or subscriptions are not included.

## Subscriptions

The subscription section lists senders seen at least twice that either carry an
`unsubscribe_url` or were categorised as Marketing. For each row:

- **Unsubscribe** opens the sender's own https unsubscribe page in a new tab.
  mailsift does not fetch or click arbitrary links for you.
- **Mute sender** appends the address to the person's never-important sender
  rules. A later digest/queue run then treats that sender as information, while
  an explicit always-important rule still wins.

Unsubscribe links are captured from the `List-Unsubscribe` header when a message
is first fetched. Messages stored before that feature existed have no link until
a newer message from the same sender is fetched.

## Cost

Provider usage is recorded per LLM batch when the provider returns a usage
object. `cost_in_usd_ticks` is converted from the provider's ticks (1 USD =
1e10). Providers that do not report cost show tokens but not a dollar estimate.
