// Service worker: push notifications and (in production) the offline app shell.

// Mirrors src/lib/phone.ts threadIdForPeer: last 8 digits group phone formats into one thread.
function threadIdForPeer(peer) {
    const raw = String(peer || "").trim();
    if (!raw) return "";
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return raw;
    return digits.slice(-8) || digits || raw;
}

// ---------------- offline app shell ----------------
// Enabled only when registered as /sw.js?cache=1 (production; see src/lib/sw.ts).
// Bump VERSION to drop every cache from older workers.
const CACHING = new URL(self.location.href).searchParams.get("cache") === "1";
const VERSION = "v1";
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
// How long a launch waits for the network before showing the cached app.
const NAV_TIMEOUT_MS = 2500;

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

    // App launches/reloads: network first, falling back to the cached shell so
    // the app (and its launch splash) opens instantly when offline or slow.
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
    const network = fetch(event.request).then((res) => {
        // The page is a single client-rendered shell; keep "/" fresh for next launch.
        if (res.ok) event.waitUntil(shell.put("/", res.clone()));
        return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
    try {
        const res = await Promise.race([network, timeout]);
        if (res) return res;
    } catch {
        // offline — fall through to the cache
    }
    const cached = await shell.match("/");
    return cached || network;
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
