// Mirrors src/lib/phone.ts threadIdForPeer: last 8 digits group phone formats into one thread.
function threadIdForPeer(peer) {
    const raw = String(peer || "").trim();
    if (!raw) return "";
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return raw;
    return digits.slice(-8) || digits || raw;
}

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }

    const peer = data.peer || "";
    const peerName = data.peerName || "";
    const threadId = data.threadId || threadIdForPeer(peer);

    const title = data.title || peerName || peer || "SMS Gateway";
    const body = data.body || data.preview || "New message";

    const url = peer
        ? `/?tid=${encodeURIComponent(threadId)}&peer=${encodeURIComponent(peer)}`
        : "/";

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            // One notification per conversation, replaced by newer messages.
            tag: threadId ? `thread-${threadId}` : undefined,
            renotify: Boolean(threadId),
            icon: "/icon-192.png",
            badge: "/badge-96.png",
            timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
            data: { url },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    const url = event.notification?.data?.url || "/";
    event.notification.close();

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((list) => {
                for (const c of list) {
                    if ("focus" in c) {
                        c.focus();
                        if ("navigate" in c) c.navigate(url);
                        return;
                    }
                }
                return self.clients.openWindow(url);
            })
    );
});
