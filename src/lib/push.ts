import { pushSubscribe, vapidPublicKey } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/storage";

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
        const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        return {
            supported: false,
            reason:
                isIOS && !standalone
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

export async function enablePush(pairToken: string): Promise<void> {
    const support = pushSupport();
    if (!support.supported) throw new Error(support.reason);

    const keyRes = await vapidPublicKey();
    if (!keyRes.key) throw new Error("Push isn't configured on the server.");

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
        throw new Error("Allow notifications for this site in your browser settings.");
    }

    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const keyBytes = urlBase64ToUint8Array(keyRes.key);

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
 * Unsubscribes this browser. The server drops the stale subscription the next
 * time a push to it returns 404/410.
 */
export async function disablePush(): Promise<void> {
    if (!pushSupport().supported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
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
