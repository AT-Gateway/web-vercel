import { toAsciiDigits } from '../../lib/otp';

// Search folding: Arabic yeh/kaf/teh marbuta -> Persian forms, Persian/Arabic-Indic digits -> ASCII.
// A 1:1 character mapping (same lengths), used both in SQL translate() and in JS (foldSearchText).
export const FA_FOLD_FROM = '\u064a\u0643\u0629\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
export const FA_FOLD_TO = '\u06cc\u06a9\u064701234567890123456789';

export function foldSearchText(text: string): string {
  let out = '';
  for (const ch of String(text ?? '')) {
    const i = FA_FOLD_FROM.indexOf(ch);
    out += i >= 0 ? FA_FOLD_TO[i] : ch;
  }
  return out;
}

export function normalizePhone(raw: string): { norm: string; tail: string } {
  // Persian/Arabic-Indic digits count as digits, so "۰۹۱۲…" and "0912…" share a thread.
  const s = toAsciiDigits(String(raw ?? '')).trim();
  if (!s) return { norm: '', tail: '' };

  // Keep a leading +, strip everything else.
  let norm = '';
  if (s.startsWith('+')) {
    norm = '+' + s.slice(1).replace(/\D+/g, '');
  } else {
    const digits = s.replace(/\D+/g, '');
    norm = digits.startsWith('00') ? '+' + digits.slice(2) : digits;
  }

  const digitsOnly = norm.startsWith('+') ? norm.slice(1) : norm;
  const tail = digitsOnly.length <= 8 ? digitsOnly : digitsOnly.slice(-8);
  return { norm, tail };
}

export function safePreview(body: string, bodyIsEncrypted: boolean): string {
  if (bodyIsEncrypted) return '🔒 Encrypted message';
  const s = String(body ?? '').trim();
  if (!s) return '';
  // Avoid very long previews.
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
