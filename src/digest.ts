import type { Digest, SlackMessage } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_THREAD_LIMIT = 3;

type WeekWindow = {
  startMs: number;
  endMs: number;
};

/**
 * Build the weekly digest for one Slack channel.
 *
 * The week is the half-open interval [weekStart, weekStart + 7 days).
 * Slack `ts` values are Unix seconds; comparisons are done in milliseconds.
 *
 * topThreads counts human replies posted inside the week, including replies
 * on threads that started earlier. Ties go to the thread that started later.
 *
 * unanswered lists top-level questions posted inside the week. A question
 * stays unanswered until some other person posts a reply that contains words
 * and is not itself a question. Bot replies, emoji-only replies, "+1", and
 * the asker's own replies do not count. An answer posted outside the week
 * still counts, because the week filter selects questions, not answers.
 */
export function buildDigest(messages: SlackMessage[], weekStart: Date): Digest {
  const week = weekWindow(weekStart);
  const parentsByTs = new Map<string, SlackMessage>();
  const repliesByThread = new Map<string, SlackMessage[]>();

  for (const message of messages) {
    if (slackTimeMs(message.ts) === null) continue;

    if (isReply(message)) {
      const replies = repliesByThread.get(message.thread_ts);
      if (replies) replies.push(message);
      else repliesByThread.set(message.thread_ts, [message]);
    } else {
      parentsByTs.set(message.ts, message);
    }
  }

  return {
    topThreads: selectTopThreads(parentsByTs, repliesByThread, week),
    unanswered: selectUnanswered(parentsByTs, repliesByThread, week),
  };
}

function weekWindow(weekStart: Date): WeekWindow {
  const startMs = weekStart.getTime();
  return { startMs, endMs: startMs + WEEK_MS };
}

/** Slack timestamps are seconds, possibly fractional. Date math is milliseconds. */
function slackTimeMs(ts: string): number | null {
  const seconds = Number(ts);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function inWeek(ts: string, week: WeekWindow): boolean {
  const timeMs = slackTimeMs(ts);
  if (timeMs === null) return false;
  return timeMs >= week.startMs && timeMs < week.endMs;
}

function isSystemMessage(message: SlackMessage): boolean {
  return message.subtype === "bot_message" || message.subtype === "channel_join";
}

/**
 * A parent either has no thread_ts, or thread_ts equal to its own ts.
 * A reply points at a different message.
 */
function isReply(message: SlackMessage): message is SlackMessage & { thread_ts: string } {
  return message.thread_ts !== undefined && message.thread_ts !== message.ts;
}

function isQuestion(text: string): boolean {
  return text.includes("?");
}

/**
 * Emoji-only replies and "+1" have no letters, so they are reactions rather
 * than answers. "thanks!" and "Saving this" still count: they contain words.
 */
function hasWords(text: string): boolean {
  return /\p{L}/u.test(text);
}

/**
 * Someone else answered when a reply is human, not from the asker, contains
 * words, and is not another question. Self-replies such as "bump" or
 * "nvm figured it out" do not count: the asker was not answered by anyone else.
 */
function isAnswer(reply: SlackMessage, askerId: string): boolean {
  if (isSystemMessage(reply)) return false;
  if (reply.user === askerId) return false;
  if (!hasWords(reply.text)) return false;
  if (isQuestion(reply.text)) return false;
  return true;
}

function selectTopThreads(
  parentsByTs: Map<string, SlackMessage>,
  repliesByThread: Map<string, SlackMessage[]>,
  week: WeekWindow,
): Digest["topThreads"] {
  const ranked: Digest["topThreads"] = [];

  for (const [threadTs, replies] of repliesByThread) {
    const parent = parentsByTs.get(threadTs);
    if (!parent) continue;

    let repliesThisWeek = 0;
    for (const reply of replies) {
      if (isSystemMessage(reply)) continue;
      if (!inWeek(reply.ts, week)) continue;
      repliesThisWeek += 1;
    }
    if (repliesThisWeek === 0) continue;

    ranked.push({ thread_ts: threadTs, text: parent.text, repliesThisWeek });
  }

  ranked.sort((a, b) => {
    if (b.repliesThisWeek !== a.repliesThisWeek) return b.repliesThisWeek - a.repliesThisWeek;
    return Number(b.thread_ts) - Number(a.thread_ts);
  });

  return ranked.slice(0, TOP_THREAD_LIMIT);
}

function selectUnanswered(
  parentsByTs: Map<string, SlackMessage>,
  repliesByThread: Map<string, SlackMessage[]>,
  week: WeekWindow,
): Digest["unanswered"] {
  const unanswered: Digest["unanswered"] = [];

  for (const parent of parentsByTs.values()) {
    if (isSystemMessage(parent)) continue;
    if (!inWeek(parent.ts, week)) continue;
    if (!isQuestion(parent.text)) continue;

    const replies = repliesByThread.get(parent.ts) ?? [];
    const answered = replies.some((reply) => isAnswer(reply, parent.user));
    if (answered) continue;

    unanswered.push({ ts: parent.ts, user: parent.user, text: parent.text });
  }

  unanswered.sort((a, b) => Number(a.ts) - Number(b.ts));
  return unanswered;
}
