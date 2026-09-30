# Tightknit Co-op Interview Exercise

## How this works

- **30 minutes total:** about 20 minutes building, then about 8 minutes talking through your solution with us.
- **Use any AI tool you normally use.** We want to see how you work with it, not whether you can code without it.
- **Share your screen and think aloud.** Tell us what you're trying, what you expect, and what surprised you.
- **Ask us questions at any time.** If something is ambiguous, you can ask, or make a reasonable call and tell us what you decided.
- **Finishing isn't the goal.** We care more about how you approach the problem, check your work and explain your code than about getting through everything.

## Setup

Requires Node 20 or later.

```sh
npm install
npm test          # runs the tests in test/
npm run digest    # runs buildDigest on data/messages.json and prints the result
npm run digest -- data/sample-messages.json
```

## Background

Tightknit communities live in Slack. Every Monday, community admins get a digest of what happened in a channel over the past week.

## Your task

Implement `buildDigest` in [`src/digest.ts`](src/digest.ts) so it returns:

1. **Top threads:** the 3 most active threads this week
2. **Unanswered questions:** questions posted this week that nobody has answered

The types are in [`src/types.ts`](src/types.ts):

```ts
type SlackMessage = {
  ts: string;            // Slack timestamp, e.g. "1789960000.000200"
  thread_ts?: string;    // set on thread replies, and on parents that have replies
  user: string;
  text: string;
  reply_count?: number;  // only on thread parents
  subtype?: "bot_message" | "channel_join";
};

type Digest = {
  topThreads: { thread_ts: string; text: string; repliesThisWeek: number }[];
  unanswered: { ts: string; user: string; text: string }[];
};
```

The week starts at `weekStart` and runs for 7 days. For the data here, use:

```ts
const weekStart = new Date("2026-09-21T00:00:00Z"); // Monday
```

## Files

| File | What it is |
| --- | --- |
| `data/sample-messages.json` | 11 messages, so you can get a feel for the data |
| `data/sample-digest.json` | The digest those 11 messages should produce |
| `data/messages.json` | The full channel export (551 messages) your solution should run on |
| `test/sample.test.ts` | Two starter tests. Add your own. |

## At the end

We'll run a few more tests against your solution together and ask you to walk us through your code. Be ready to explain any line, including the ones your AI tool wrote.
