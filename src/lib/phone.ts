import { toAsciiDigits } from "./otp";

/**
 * Converts Persian/Arabic-Indic digits to ASCII, drops invisible bidi marks
 * (LRM/RLM, embeddings/overrides, isolates) that copy-paste and RTL keyboards
 * insert around numbers, and turns no-break spaces into plain spaces.
 */
export function normalizeDigits(s: string): string {
    return toAsciiDigits(s)
        .replace(/[‎‏‪-‮⁦-⁩]/g, "")
        .replace(/ /g, " ");
}

/**
 * PWA-side thread id generation.
 *
 * The server groups threads by `peer_tail` (last 8 digits) when possible, so
 * different phone formats map to one conversation. We mirror that here for
 * SSE payloads and local optimistic messages.
 */
export function threadIdForPeer(peer: string): string {
    const raw = normalizeDigits(String(peer || "")).trim();
    if (!raw) return "";
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return raw;
    const tail = digits.slice(-8);
    return tail || digits || raw;
}

/** True when the input is plausibly a dialable number (or a short code). */
export function looksLikePhone(input: string): boolean {
    const v = normalizeDigits(input).trim();
    if (!/^\+?[\d\s()\-.]+$/.test(v)) return false;
    return v.replace(/\D+/g, "").length >= 3;
}

/** Strips formatting characters but keeps a leading "+". */
export function cleanPhone(input: string): string {
    const v = normalizeDigits(input).trim();
    const plus = v.startsWith("+") ? "+" : "";
    return plus + v.replace(/\D+/g, "");
}
