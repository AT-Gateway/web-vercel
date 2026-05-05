self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {}

    const peer = data.peer || "";
    const peerName = data.peerName || "";

    const title =
        data.title ||
        (peerName ? `SMS from ${peerName}` : peer ? `SMS from ${peer}` : "SMS Gateway");

    const body = data.body || data.preview || "New message";

    const url = peer ? `/?peer=${encodeURIComponent(peer)}` : "/";

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            data: { url },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    const url = event.notification?.data?.url || "/";
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            for (const c of list) {
                if ("focus" in c) {
                    c.focus();
                    c.navigate(url);
                    return;
                }
            }
            return clients.openWindow(url);
        })
    );
});
