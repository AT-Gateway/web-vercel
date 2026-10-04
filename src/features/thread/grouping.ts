import type { Message } from "@/lib/api";

/** Show a centered timestamp when this much time separates two messages. */
const TIMESTAMP_GAP_MS = 45 * 60 * 1000;
/** Consecutive bubbles from one side within this window share a group (one tail). */
const CLUSTER_GAP_MS = 3 * 60 * 1000;

export type ThreadItem =
    | { kind: "timestamp"; key: string; ts: number }
    | {
          kind: "message";
          key: string;
          message: Message;
          /** First bubble in a run from the same side. */
          first: boolean;
          /** Last bubble in a run — gets the tail. */
          last: boolean;
          /** Show delivery status under it (latest outgoing message). */
          showStatus: boolean;
      };

export function buildThreadItems(messages: Message[]): ThreadItem[] {
    const items: ThreadItem[] = [];
    const lastOutgoingId = [...messages].reverse().find((m) => m.direction === "out")?.id;

    messages.forEach((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];

        const needsStamp = !prev || m.ts - prev.ts > TIMESTAMP_GAP_MS;
        if (needsStamp) items.push({ kind: "timestamp", key: `ts-${m.id}`, ts: m.ts });

        const continuesPrev =
            !!prev &&
            !needsStamp &&
            prev.direction === m.direction &&
            m.ts - prev.ts <= CLUSTER_GAP_MS;
        const continuesNext =
            !!next &&
            next.direction === m.direction &&
            next.ts - m.ts <= CLUSTER_GAP_MS &&
            next.ts - m.ts <= TIMESTAMP_GAP_MS;

        items.push({
            kind: "message",
            key: m.id,
            message: m,
            first: !continuesPrev,
            last:
                !continuesNext ||
                m.status === "failed" ||
                Boolean(m.waiting) ||
                m.id === lastOutgoingId,
            showStatus:
                m.id === lastOutgoingId || m.status === "failed" || Boolean(m.waiting),
        });
    });

    return items;
}

const EMOJI_ONLY =
    /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\s)+$/u;

/** iOS renders messages of 1–3 emoji large and without a bubble. */
export function isJumboEmoji(text: string): boolean {
    const t = text.trim();
    if (!t || !EMOJI_ONLY.test(t)) return false;
    const count = Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            t.replace(/\s+/g, "")
        )
    ).length;
    return count >= 1 && count <= 3;
}

export { extractCode } from "@/lib/otp";

/**
 * Delivery status under an outgoing bubble. `gatewayStale`: the Android gateway
 * hasn't polled its outbox for a while, so queued server rows aren't moving.
 */
export function statusText(m: Message, gatewayStale = false): string {
    if (m.direction !== "out") return "";
    if (m.status === "failed") return "Not Delivered";
    if (m.waiting) return "Waiting for Network";
    if (m.status === "queued") {
        if (m.local) return "Sending…";
        return gatewayStale ? "Waiting for Phone…" : "Sending…";
    }
    if (m.deliveredAt) return "Delivered";
    return "Sent";
}

const LINK_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?])/gi;

export type TextPart = { text: string; href?: string };

export function linkify(text: string): TextPart[] {
    const parts: TextPart[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK_RE)) {
        const start = m.index ?? 0;
        if (start > last) parts.push({ text: text.slice(last, start) });
        const raw = m[0];
        parts.push({ text: raw, href: raw.startsWith("http") ? raw : `https://${raw}` });
        last = start + raw.length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}
