import { randomBytes } from 'node:crypto';

export function genPairToken(): string {
  // 32 bytes -> base64url ~ 43 chars
  return randomBytes(32).toString('base64url');
}

export function gen6DigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
