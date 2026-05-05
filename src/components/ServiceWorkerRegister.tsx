"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        // Register our service worker (public/sw.js)
        navigator.serviceWorker
            .register("/sw.js")
            .catch((err) => console.warn("Service worker registration failed:", err));
    }, []);

    return null;
}
