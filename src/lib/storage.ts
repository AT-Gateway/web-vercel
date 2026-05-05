export const TOKEN_STORAGE_KEYS = ["pairToken", "pair_token"];

export function loadPairToken(): string | null {
    if (typeof window === "undefined") return null;
    for (const k of TOKEN_STORAGE_KEYS) {
        const v = window.localStorage.getItem(k);
        if (v && v.trim()) return v.trim();
    }
    return null;
}

export function savePairToken(token: string) {
    if (typeof window === "undefined") return;
    const t = token.trim();
    for (const k of TOKEN_STORAGE_KEYS) {
        window.localStorage.setItem(k, t);
    }
}

export function clearPairToken() {
    if (typeof window === "undefined") return;
    for (const k of TOKEN_STORAGE_KEYS) {
        window.localStorage.removeItem(k);
    }
}

export function getOrCreateDeviceId(): string {
    if (typeof window === "undefined") return "server";
    const key = "deviceId";
    const existing = window.localStorage.getItem(key);
    if (existing && existing.trim()) return existing.trim();
    const id =
        "pwa-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
    window.localStorage.setItem(key, id);
    return id;
}

export function loadSimSlotIndex(): 0 | 1 {
    if (typeof window === "undefined") return 0;
    const v = window.localStorage.getItem("simSlotIndex");
    return v === "1" ? 1 : 0;
}

export function saveSimSlotIndex(v: 0 | 1) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("simSlotIndex", String(v));
}

export function loadSubscriptionId(): number {
    if (typeof window === "undefined") return -1;
    const v = window.localStorage.getItem("subscriptionId");
    const n = v ? Number(v) : -1;
    return Number.isFinite(n) ? n : -1;
}

export function saveSubscriptionId(v: number) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("subscriptionId", String(v));
}
