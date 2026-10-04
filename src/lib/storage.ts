/**
 * Thin, exception-safe wrappers around localStorage. Private browsing modes and
 * blocked storage throw on access, so every read/write is guarded.
 */

import type { Conversation, Message } from "@/lib/api";

const PAIR_TOKEN_KEYS = ["pairToken", "PAIR_TOKEN", "pair_token", "pair_token_v1"];
const DEVICE_ID_KEY = "pwaDeviceId";
const SIM_SLOT_KEY = "simSlotIndex";
const APPEARANCE_KEY = "appearance";
const GLASS_TINT_KEY = "glassTint";
const SESSION_KEY = "session";
const DRAFTS_KEY = "drafts";
const INBOX_PREFIX = "inbox:";
const FLAG_PREFIX = "flag:";

/** Liquid Glass transparency: 0 = Ultra Clear, 1 = Fully Tinted. */
export const DEFAULT_GLASS_TINT = 0.45;

export type Appearance = "system" | "light" | "dark";

function read(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage unavailable; the value just won't persist.
    }
}

function remove(key: string) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

export function loadPairToken(): string {
    if (typeof window === "undefined") return "";
    for (const key of PAIR_TOKEN_KEYS) {
        const v = read(key)?.trim();
        if (v) return v;
    }
    return "";
}

export function savePairToken(token: string) {
    // Older builds read different keys; keep the primary ones in sync.
    write("pairToken", token);
    write("PAIR_TOKEN", token);
    write("pair_token", token);
}

export function clearPairToken() {
    for (const key of PAIR_TOKEN_KEYS) remove(key);
}

export function getOrCreateDeviceId(): string {
    if (typeof window === "undefined") return "pwa";
    const existing = read(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `pwa-${Math.random().toString(16).slice(2)}-${Date.now()}`;
    write(DEVICE_ID_KEY, id);
    return id;
}

export function loadSimSlot(): 0 | 1 {
    return read(SIM_SLOT_KEY) === "1" ? 1 : 0;
}

export function saveSimSlot(slot: 0 | 1) {
    write(SIM_SLOT_KEY, String(slot));
}

export function loadAppearance(): Appearance {
    const v = read(APPEARANCE_KEY);
    return v === "light" || v === "dark" ? v : "system";
}

export function saveAppearance(value: Appearance) {
    if (value === "system") remove(APPEARANCE_KEY);
    else write(APPEARANCE_KEY, value);
}

export function loadGlassTint(): number {
    const v = Number(read(GLASS_TINT_KEY));
    return read(GLASS_TINT_KEY) !== null && Number.isFinite(v)
        ? Math.min(1, Math.max(0, v))
        : DEFAULT_GLASS_TINT;
}

export function saveGlassTint(value: number) {
    write(GLASS_TINT_KEY, String(Math.round(value * 100) / 100));
}

/** Last verified session, so the app opens instantly and works offline. */
export type StoredSession = {
    pairToken: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    demo: boolean;
};

export function loadSession(): StoredSession | null {
    try {
        const raw = read(SESSION_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw) as Partial<StoredSession>;
        if (!s.pairToken || !s.pairingId || !s.gatewayDeviceId) return null;
        return {
            pairToken: s.pairToken,
            pairingId: s.pairingId,
            gatewayDeviceId: s.gatewayDeviceId,
            gatewayPubSpkiB64: s.gatewayPubSpkiB64 ?? "AA==",
            demo: Boolean(s.demo),
        };
    } catch {
        return null;
    }
}

export function saveSession(s: StoredSession) {
    write(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
    remove(SESSION_KEY);
}

function readJson<T>(key: string): T | null {
    try {
        const raw = read(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown) {
    try {
        write(key, JSON.stringify(value));
    } catch {
        // Not serializable or storage full; skip.
    }
}

/** Unsent composer text per thread id, so drafts survive reloads and PWA eviction. */
export function loadDrafts(): Record<string, string> {
    const v = readJson<unknown>(DRAFTS_KEY);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, text] of Object.entries(v as Record<string, unknown>)) {
        if (typeof text === "string" && text) out[k] = text;
    }
    return out;
}

export function saveDrafts(d: Record<string, string>) {
    const entries = Object.entries(d).filter(([, text]) => typeof text === "string" && text);
    if (entries.length === 0) remove(DRAFTS_KEY);
    else writeJson(DRAFTS_KEY, Object.fromEntries(entries));
}

export function clearDrafts() {
    remove(DRAFTS_KEY);
}

/** Last loaded inbox, shown instantly on launch before the network answers. */
export type CachedInbox = {
    conversations: Conversation[];
    threads: Record<string, Message[]>;
};

export function loadCachedInbox(pairingId: string): CachedInbox | null {
    if (!pairingId) return null;
    const v = readJson<Partial<CachedInbox>>(INBOX_PREFIX + pairingId);
    if (!v || !Array.isArray(v.conversations)) return null;
    const threads: Record<string, Message[]> = {};
    if (v.threads && typeof v.threads === "object") {
        for (const [tid, list] of Object.entries(v.threads)) {
            if (Array.isArray(list)) threads[tid] = list;
        }
    }
    return { conversations: v.conversations, threads };
}

export function saveCachedInbox(pairingId: string, data: CachedInbox) {
    if (!pairingId) return;
    writeJson(INBOX_PREFIX + pairingId, data);
}

/** Removes every cached inbox (they hold SMS bodies and verification codes). */
export function clearCachedInbox() {
    try {
        const ls = window.localStorage;
        const keys: string[] = [];
        for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k && k.startsWith(INBOX_PREFIX)) keys.push(k);
        }
        keys.forEach((k) => ls.removeItem(k));
    } catch {
        // ignore
    }
}

/** Simple persisted booleans, e.g. "pushPromptDismissed". */
export function loadFlag(key: string): boolean {
    return read(FLAG_PREFIX + key) === "1";
}

export function saveFlag(key: string, v: boolean) {
    if (v) write(FLAG_PREFIX + key, "1");
    else remove(FLAG_PREFIX + key);
}
