/**
 * One-time verification code detection, shared by the web app (code chip,
 * Copy Code) and the server (push notification title, Telegram copy button).
 * Dependency-free so server code can import it with a relative path.
 */

// Words that mark a message as carrying a verification code (English + Persian,
// plus the Arabic-letter spellings ك/ي that some senders and keyboards use).
const KEYWORD =
    /(code|otp|one[- ]time|pin\b|passcode|password|verif|verification|login|sign[- ]?in|2fa|security|کد|رمز|تایید|تأیید|یکبار|كد|تاييد|تأييد)/gi;

// 4–8 digits, optionally Google-style "G-123456", not part of a longer number,
// a phone number, a decimal, a time ("12:30") or a date ("2026-10-03").
const CANDIDATE = /(?<![\d.,:/-])(?:G-)?(\d{4,8})(?![\d.,:/-]\d)/g;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Converts Persian/Arabic-Indic digits to ASCII so codes like ۴۸۲۹۱۳ are found. */
export function toAsciiDigits(text: string): string {
    return text.replace(/[۰-۹٠-٩]/g, (d) => {
        const p = PERSIAN_DIGITS.indexOf(d);
        return String(p >= 0 ? p : ARABIC_DIGITS.indexOf(d));
    });
}

/**
 * Returns the verification code in an SMS, or null. Only messages that mention
 * a code-like keyword qualify; with several numbers, the one closest to a
 * keyword wins ("Your code is 4829. Valid for 10 minutes.").
 */
export function extractCode(raw: string): string | null {
    if (!raw) return null;
    const text = toAsciiDigits(raw);

    const keywords = [...text.matchAll(KEYWORD)].map((m) => m.index ?? 0);
    if (!keywords.length) return null;

    let best: { code: string; distance: number } | null = null;
    for (const m of text.matchAll(CANDIDATE)) {
        const at = m.index ?? 0;
        const distance = Math.min(...keywords.map((k) => Math.abs(k - at)));
        if (!best || distance < best.distance) best = { code: m[1], distance };
    }
    return best?.code ?? null;
}
