import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digest";
import type { SlackMessage } from "../src/types";
import messages from "../data/messages.json";

const weekStart = new Date("2026-09-21T00:00:00Z");
const weekMs = 7 * 24 * 60 * 60 * 1000;
const weekEnd = new Date(weekStart.getTime() + weekMs);

function message(overrides: SlackMessage): SlackMessage {
  return overrides;
}

describe("week window", () => {
  it("includes a question at weekStart and excludes a question at weekEnd", () => {
    const atStart = message({
      ts: String(weekStart.getTime() / 1000),
      user: "U1",
      text: "Is the start included?",
    });
    const atEnd = message({
      ts: String(weekEnd.getTime() / 1000),
      user: "U2",
      text: "Is the end included?",
    });

    expect(buildDigest([atEnd, atStart], weekStart).unanswered).toEqual([
      { ts: atStart.ts, user: "U1", text: "Is the start included?" },
    ]);
  });

  it("ignores a malformed timestamp instead of throwing", () => {
    const broken = message({ ts: "not-a-timestamp", user: "U1", text: "Is this valid?" });
    expect(buildDigest([broken], weekStart)).toEqual({ topThreads: [], unanswered: [] });
  });
});

describe("top threads", () => {
  it("counts this week's replies on a thread that started before the week", () => {
    const parent = message({
      ts: "1789000000.000000",
      thread_ts: "1789000000.000000",
      user: "U1",
      text: "Older thread",
      reply_count: 2,
    });
    const firstReply = message({
      ts: "1790000000.000100",
      thread_ts: parent.ts,
      user: "U2",
      text: "still relevant",
    });
    const secondReply = message({
      ts: "1790000000.000200",
      thread_ts: parent.ts,
      user: "U3",
      text: "agreed",
    });

    expect(buildDigest([secondReply, parent, firstReply], weekStart).topThreads).toEqual([
      { thread_ts: parent.ts, text: "Older thread", repliesThisWeek: 2 },
    ]);
  });

  it("breaks equal reply counts toward the thread that started later", () => {
    const older = message({
      ts: "1790000000.000000",
      thread_ts: "1790000000.000000",
      user: "U1",
      text: "Older tie",
      reply_count: 1,
    });
    const newer = message({
      ts: "1790200000.000000",
      thread_ts: "1790200000.000000",
      user: "U2",
      text: "Newer tie",
      reply_count: 1,
    });
    const olderReply = message({
      ts: "1790000001.000000",
      thread_ts: older.ts,
      user: "U3",
      text: "reply",
    });
    const newerReply = message({
      ts: "1790200001.000000",
      thread_ts: newer.ts,
      user: "U4",
      text: "reply",
    });

    const { topThreads } = buildDigest([older, newer, olderReply, newerReply], weekStart);
    expect(topThreads.map((thread) => thread.text)).toEqual(["Newer tie", "Older tie"]);
  });

  it("counts an emoji reply as activity but omits a thread whose parent is missing", () => {
    const parent = message({
      ts: "1790100000.000000",
      thread_ts: "1790100000.000000",
      user: "U1",
      text: "Launch thread",
      reply_count: 1,
    });
    const emoji = message({
      ts: "1790100001.000000",
      thread_ts: parent.ts,
      user: "U2",
      text: "🔥",
    });
    const orphan = message({
      ts: "1790100002.000000",
      thread_ts: "1790100099.000000",
      user: "U3",
      text: "reply with no parent in the export",
    });

    expect(buildDigest([emoji, orphan, parent], weekStart).topThreads).toEqual([
      { thread_ts: parent.ts, text: "Launch thread", repliesThisWeek: 1 },
    ]);
  });

  it("does not count a bot reply as thread activity", () => {
    const parent = message({
      ts: "1790100000.000000",
      thread_ts: "1790100000.000000",
      user: "U1",
      text: "Is there a way to schedule posts?",
      reply_count: 1,
    });
    const bot = message({
      ts: "1790100001.000000",
      thread_ts: parent.ts,
      user: "B1",
      text: "Thanks for your question! A team member usually replies within 1 business day.",
      subtype: "bot_message",
    });

    expect(buildDigest([parent, bot], weekStart).topThreads).toEqual([]);
  });
});

describe("unanswered questions", () => {
  it("keeps a question that only the asker replied to", () => {
    const question = message({
      ts: "1790100000.000000",
      thread_ts: "1790100000.000000",
      user: "U1",
      text: "Can I restrict a channel to a group?",
      reply_count: 1,
    });
    const bump = message({
      ts: "1790100001.000000",
      thread_ts: question.ts,
      user: "U1",
      text: "bump",
    });

    expect(buildDigest([question, bump], weekStart).unanswered).toEqual([
      { ts: question.ts, user: "U1", text: question.text },
    ]);
  });

  it("keeps a question whose only reply is a bot or an emoji", () => {
    const botQuestion = message({
      ts: "1790100000.000000",
      user: "U1",
      text: "Is there an endpoint?",
    });
    const bot = message({
      ts: "1790100001.000000",
      thread_ts: botQuestion.ts,
      user: "B1",
      text: "Thanks for your question!",
      subtype: "bot_message",
    });
    const emojiQuestion = message({
      ts: "1790200000.000000",
      user: "U2",
      text: "Any tips?",
    });
    const emoji = message({
      ts: "1790200001.000000",
      thread_ts: emojiQuestion.ts,
      user: "U3",
      text: "🔥",
    });

    expect(buildDigest([botQuestion, bot, emojiQuestion, emoji], weekStart).unanswered).toEqual([
      { ts: botQuestion.ts, user: "U1", text: botQuestion.text },
      { ts: emojiQuestion.ts, user: "U2", text: emojiQuestion.text },
    ]);
  });

  it("treats a reply after the week as an answer", () => {
    const question = message({
      ts: "1790100000.000000",
      user: "U1",
      text: "Does the export include DMs?",
    });
    const laterAnswer = message({
      ts: String(weekEnd.getTime() / 1000 + 60),
      thread_ts: question.ts,
      user: "U2",
      text: "No, only public channels.",
    });

    expect(buildDigest([question, laterAnswer], weekStart).unanswered).toEqual([]);
  });

  it("does not treat a follow-up question, or a question inside a thread, as an answer", () => {
    const question = message({
      ts: "1790100000.000000",
      user: "U1",
      text: "How does SSO work?",
    });
    const followUp = message({
      ts: "1790100001.000000",
      thread_ts: question.ts,
      user: "U2",
      text: "Will this be recorded?",
    });

    const digest = buildDigest([question, followUp], weekStart);
    expect(digest.unanswered).toEqual([{ ts: question.ts, user: "U1", text: question.text }]);
  });

  it("ignores channel-join messages even when the text contains a question mark", () => {
    const join = message({
      ts: "1790100000.000000",
      user: "U1",
      text: "<@U1> has joined the channel?",
      subtype: "channel_join",
    });

    expect(buildDigest([join], weekStart).unanswered).toEqual([]);
  });
});

describe("full channel export", () => {
  const digest = buildDigest(messages as SlackMessage[], weekStart);

  it("returns the three busiest threads, including one that started before the week", () => {
    expect(digest.topThreads).toEqual([
      {
        thread_ts: "1789830000.068270",
        text: "What's the best way to migrate our community from Discourse?",
        repliesThisWeek: 11,
      },
      {
        thread_ts: "1790096400.033730",
        text: "We just crossed 10k members 🎉 sharing what worked for us in the thread",
        repliesThisWeek: 9,
      },
      {
        thread_ts: "1790179200.073050",
        text: "How are folks handling SSO with Okta?",
        repliesThisWeek: 7,
      },
    ]);
  });

  it("applies the unanswered rules to planted cases in the export", () => {
    const texts = digest.unanswered.map((question) => question.text);

    expect(texts).toContain("Is there a way to schedule posts in advance?");
    expect(texts).toContain("Can I restrict a channel to members of a specific group?");
    expect(texts).toContain("How do I bulk-import members from a CSV?");
    expect(texts).not.toContain("Does the analytics export include DMs?");
    expect(texts).not.toContain("Is the API rate limit per workspace?");
    expect(texts).not.toContain("Happy Monday! What's everyone working on this week?");
    expect(texts).not.toContain("Reminder: office hours start in 15 minutes. Got questions? Bring them!");
  });
});
