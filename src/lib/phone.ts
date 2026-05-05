/**
 * PWA-side thread id generation.
 *
 * The server groups threads by `peer_tail` (last 8 digits) when possible, so
 * different phone formats map to one conversation. We mirror that here for
 * SSE payloads and local optimistic messages.
 */
export function threadIdForPeer(peer: string): string {
    const raw = String(peer || "").trim();
    if (!raw) return "";
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return raw;
    const tail = digits.slice(-8);
    return tail || digits || raw;
}
