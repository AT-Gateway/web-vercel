/**
 * SMS segment math. Messages that fit the GSM 03.38 alphabet use 7-bit encoding
 * (160 chars, 153 per part when concatenated); anything else — Persian, emoji —
 * falls back to UCS-2 (70 chars, 67 per part).
 */

const GSM_BASIC =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

const BASIC = new Set(Array.from(GSM_BASIC));
const EXTENDED = new Set(Array.from(GSM_EXTENDED));

export type SmsInfo = {
    encoding: "GSM-7" | "UCS-2";
    /** Characters counted in encoding units (extended GSM chars count twice). */
    length: number;
    segments: number;
    perSegment: number;
    remaining: number;
};

export function smsInfo(text: string): SmsInfo {
    const chars = Array.from(text);
    let gsm = true;
    let units = 0;

    for (const c of chars) {
        if (BASIC.has(c)) units += 1;
        else if (EXTENDED.has(c)) units += 2;
        else {
            gsm = false;
            break;
        }
    }

    if (!gsm) {
        // UCS-2 counts UTF-16 code units; emoji outside the BMP take two.
        units = text.length;
        const single = 70;
        const multi = 67;
        const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
        const perSegment = segments > 1 ? multi : single;
        return {
            encoding: "UCS-2",
            length: units,
            segments,
            perSegment,
            remaining: Math.max(0, segments * perSegment - units),
        };
    }

    const single = 160;
    const multi = 153;
    const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
    const perSegment = segments > 1 ? multi : single;
    return {
        encoding: "GSM-7",
        length: units,
        segments,
        perSegment,
        remaining: Math.max(0, segments * perSegment - units),
    };
}
