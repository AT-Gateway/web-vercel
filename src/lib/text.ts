import { toAsciiDigits } from "./otp";

/**
 * Folds text for Persian-aware matching: Arabic yeh/kaf/teh marbuta become the
 * Persian letters, Persian/Arabic digits become ASCII, no-break spaces become
 * spaces, and letters are lower-cased.
 *
 * The result always has the same length as the input (every change is one
 * UTF-16 unit for one, and bidi marks are kept rather than stripped), so an
 * index found in the folded text can slice the original for highlighting.
 */
export function normalizeFa(s: string): string {
    const folded = toAsciiDigits(s)
        .replace(/ /g, " ")
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/ة/g, "ه");
    const lower = folded.toLowerCase();
    if (lower.length === folded.length) return lower;
    // A few letters (e.g. "İ") lower-case to two units; keep those as they are.
    let out = "";
    for (let i = 0; i < folded.length; i++) {
        const l = folded[i].toLowerCase();
        out += l.length === 1 ? l : folded[i];
    }
    return out;
}

/** True when the text contains Arabic-script letters (Persian, Arabic, Urdu…). */
export function hasArabicScript(s: string): boolean {
    return /[؀-ۿ]/.test(s);
}
