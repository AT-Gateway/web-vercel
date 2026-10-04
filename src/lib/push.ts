import { pushSubscribe, vapidPublicKey } from "@/lib/api";
import { isIOS, isStandalone } from "@/lib/device";
import { getOrCreateDeviceId } from "@/lib/storage";
import { SW_URL } from "@/lib/sw";

export type PushSupport = { supported: true } | { supported: false; reason: string };

export function pushSupport(): PushSupport {
    if (typeof window === "undefined") return { supported: false, reason: "Unavailable" };
    if (!window.isSecureContext) {
        return { supported: false, reason: "Notifications need HTTPS." };
    }
    if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        return {
            supported: false,
            reason:
                isIOS() && !isStandalone()
                    ? "On iPhone, add this app to your Home Screen to enable notifications."
                    : "This browser doesn't support web notifications.",
        };
    }
    return { supported: true };
}

export async function currentPushEnabled(): Promise<boolean> {
    if (!pushSupport().supported) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return Notification.permission === "granted" && Boolean(sub);
    } catch {
        return false;
    }
}

// The VAPID key is fetched ahead of time so enablePush can ask for permission
// as its first await: WebKit drops the prompt once the tap's user activation is
// spent on a network round trip.
let keyPromise: Promise<string | null> | null = null;

/** Starts (or reuses) the VAPID public key request. Never rejects. */
export function prefetchVapidKey(): Promise<string | null> {
    return (keyPromise ??= vapidPublicKey()
        .then((r) => r.key ?? null)
        .catch(() => {
            keyPromise = null;
            return null;
        }));
}

function deniedText(): string {
    if (isIOS() && isStandalone()) {
        return "Notifications are turned off for this app. Turn them on in the Settings app › Notifications.";
    }
    if (typeof navigator !== "undefined" && /Android/.test(navigator.userAgent)) {
        return "Notifications are blocked. Long-press the app icon › App info › Notifications.";
    }
    return "Notifications are blocked for this site. Allow them in your browser's site settings.";
}

export async function enablePush(pairToken: string): Promise<void> {
    const support = pushSupport();
    if (!support.supported) throw new Error(support.reason);

    if (Notification.permission === "denied") throw new Error(deniedText());
    // Must be the first await so the browser still sees the user's tap.
    const perm =
        Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
    if (perm !== "granted") {
        throw new Error(
            perm === "denied" ? deniedText() : "Notifications weren't allowed. Try again."
        );
    }

    const key = await (keyPromise ?? prefetchVapidKey());
    if (!key) throw new Error("Push isn't configured on the server.");

    if (!(await navigator.serviceWorker.getRegistration())) {
        await navigator.serviceWorker.register(SW_URL);
    }
    const reg = await navigator.serviceWorker.ready;
    const keyBytes = urlBase64ToUint8Array(key);

    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, keyBytes)) {
        await sub.unsubscribe();
        sub = null;
    }
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes as BufferSource,
        });
    }

    await pushSubscribe(pairToken, getOrCreateDeviceId(), sub.toJSON());
}

/**
 * Re-sends this browser's existing push subscription to the server, e.g. on
 * launch or after the browser rotated it, so the server never holds a stale
 * one. Does nothing without permission or a subscription; never throws.
 */
export async function resyncPush(pairToken: string): Promise<void> {
    try {
        if (!pushSupport().supported || Notification.permission !== "granted") return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await pushSubscribe(pairToken, getOrCreateDeviceId(), sub.toJSON());
    } catch {
        // Push may be off on the server (400/503) or the network is down.
    }
}

/**
 * Unsubscribes this browser. The server drops the stale subscription the next
 * time a push to it returns 404/410.
 */
export async function disablePush(): Promise<void> {
    if (!pushSupport().supported) return;
    // getRegistration, not .ready, which never settles without a worker.
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function sameKey(subscription: PushSubscription, expected: Uint8Array): boolean {
    const current = subscription.options?.applicationServerKey as
        | BufferSource
        | null
        | undefined;
    if (!current) return true;
    const bytes = ArrayBuffer.isView(current)
        ? new Uint8Array(current.buffer, current.byteOffset, current.byteLength)
        : new Uint8Array(current as ArrayBuffer);
    if (bytes.length !== expected.length) return false;
    return bytes.every((b, i) => b === expected[i]);
}
