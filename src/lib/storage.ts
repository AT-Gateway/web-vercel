/**
 * Thin, exception-safe wrappers around localStorage. Private browsing modes and
 * blocked storage throw on access, so every read/write is guarded.
 */

const PAIR_TOKEN_KEYS = ["pairToken", "PAIR_TOKEN", "pair_token", "pair_token_v1"];
const DEVICE_ID_KEY = "pwaDeviceId";
const SIM_SLOT_KEY = "simSlotIndex";
const APPEARANCE_KEY = "appearance";
const GLASS_TINT_KEY = "glassTint";

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
