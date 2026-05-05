export function normalizePhone(raw: string): { norm: string; tail: string } {
  const s = String(raw ?? '').trim();
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
