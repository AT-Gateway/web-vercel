// Service worker: push notifications and (in production) the offline app shell.

// Mirrors src/lib/phone.ts normalizeDigits: Persian/Arabic-Indic digits become ASCII,
// bidi marks are dropped and NBSP becomes a space.
function normalizeDigits(s) {
    return String(s || "")
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
        .replace(/\u00A0/g, " ");
}

// Mirrors src/lib/phone.ts threadIdForPeer: last 8 digits group phone formats into one thread.
function threadIdForPeer(peer) {
    const raw = normalizeDigits(peer).trim();
    if (!raw) return "";
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return raw;
    return digits.slice(-8) || digits || raw;
}

// ---------------- offline app shell ----------------
// Enabled only when registered as /sw.js?cache=1 (production; see src/lib/sw.ts).
// Bump VERSION to drop every cache from older workers.
const CACHING = new URL(self.location.href).searchParams.get("cache") === "1";
const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const STATIC_CACHE = `static-${VERSION}`;
const PRECACHE = [
    "/",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
    "/favicon.svg",
    "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
    if (CACHING) {
        event.waitUntil(
            caches
                .open(SHELL_CACHE)
                .then((c) => c.addAll(PRECACHE))
                .catch(() => {})
        );
    }
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (k) => !CACHING || (k !== SHELL_CACHE && k !== STATIC_CACHE)
                        )
                        .map((k) => caches.delete(k))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (!CACHING) return;
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    // Live data is never cached.
    if (url.pathname.startsWith("/api/")) return;

    // App launches/reloads: network first, cached shell only when offline.
    if (req.mode === "navigate") {
        event.respondWith(navigationResponse(event));
        return;
    }

    // Hashed build assets never change: cache first.
    if (url.pathname.startsWith("/_next/static/")) {
        event.respondWith(cacheFirst(req));
        return;
    }

    // Icons, launch images, manifest: serve cached, refresh in the background.
    if (
        /^\/(icon|apple-touch-icon|favicon|badge|splash\/|manifest\.webmanifest)/.test(
            url.pathname
        )
    ) {
        event.respondWith(staleWhileRevalidate(event, req));
    }
});

async function navigationResponse(event) {
    const shell = await caches.open(SHELL_CACHE);
    try {
        // Always prefer the network: a cached page could reference build files a
        // newer deploy removed, which would leave the app unable to start.
        const res = await fetch(event.request);
        // The page is a single client-rendered shell; keep "/" fresh for offline launches.
        if (res.ok) event.waitUntil(shell.put("/", res.clone()));
        return res;
    } catch {
        const cached = await shell.match("/");
        if (cached) return cached;
        throw new Error("offline and no cached app shell");
    }
}

async function cacheFirst(req) {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
}

async function staleWhileRevalidate(event, req) {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req);
    const refresh = fetch(req)
        .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
        })
        .catch(() => hit);
    if (hit) {
        event.waitUntil(refresh);
        return hit;
    }
    return refresh;
}

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

    const sender = peerName || peer || "SMS Gateway";
    const code = typeof data.code === "string" && data.code ? data.code : null;
    // Verification codes go first so they can be read on the lock screen.
    const title = data.title || (code ? `${code} · ${sender}` : sender);
    const body = data.body || data.preview || "New message";

    const url = peer
        ? `/?tid=${encodeURIComponent(threadId)}&peer=${encodeURIComponent(peer)}`
        : "/";

    event.waitUntil(
        (async () => {
            // Every open window refreshes now instead of waiting for its polling loop.
            const wins = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });
            wins.forEach((c) => c.postMessage({ type: "sms", threadId }));

            // Already looking at this conversation: still show the notification (iOS
            // revokes push permission after pushes that show nothing), but quietly.
            const viewing =
                Boolean(threadId) &&
                wins.some((c) => {
                    if (c.visibilityState !== "visible" || !c.focused) return false;
                    try {
                        return new URL(c.url).searchParams.get("tid") === threadId;
                    } catch {
                        return false;
                    }
                });

            await self.registration.showNotification(title, {
                body,
                // One notification per conversation, replaced by newer messages.
                tag: threadId ? `thread-${threadId}` : undefined,
                renotify: !viewing && Boolean(threadId),
                silent: viewing,
                icon: "/icon-192.png",
                badge: "/badge-96.png",
                timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
                // Action buttons show on Android and desktop; iOS uses the plain tap.
                actions: code ? [{ action: "copy-code", title: `Copy ${code}` }] : [],
                data: { url, code },
            });

            // Home-screen badge: unread conversations, counted by the server.
            if (typeof data.unreadThreads === "number" && self.navigator.setAppBadge) {
                await self.navigator.setAppBadge(data.unreadThreads).catch(() => {});
            }
        })()
    );
});

// Tapping a notification (or its "Copy" action) opens the conversation. Service
// workers can't use the clipboard, so a verification code travels in the URL
// (?code=) and the app copies it (see AppProvider).
self.addEventListener("notificationclick", (event) => {
    const { url = "/", code = null } = event.notification?.data || {};
    event.notification.close();
    const target = code
        ? `${url}${url.includes("?") ? "&" : "?"}code=${encodeURIComponent(code)}`
        : url;

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((list) => {
                // Prefer the window the user is looking at, not merely the first one.
                const client =
                    list.find((c) => c.focused) ||
                    list.find((c) => c.visibilityState === "visible") ||
                    list[0];
                if (client) {
                    // Hand off to the running app: no reload, it navigates in place.
                    client.postMessage({ type: "open-url", url: target });
                    return client.focus();
                }
                return self.clients.openWindow(target);
            })
    );
});

// The browser rotated or expired the push subscription: subscribe again with the same
// VAPID key, then let open windows re-register it with the server (AppProvider).
// WebKit never fires this; the app's launch resync covers iOS.
self.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(
        (async () => {
            try {
                const opts = event.oldSubscription && event.oldSubscription.options;
                if (opts && opts.applicationServerKey) {
                    await self.registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: opts.applicationServerKey,
                    });
                }
            } catch {
                // The app resubscribes from scratch on the next resync.
            }
            const wins = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });
            wins.forEach((c) => c.postMessage({ type: "push-resync" }));
        })()
    );
});
