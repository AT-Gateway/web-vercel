"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/sw";

/** Minimum time between update checks when the app returns to the foreground. */
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        // public/sw.js: push notifications + (in production) offline app shell.
        navigator.serviceWorker
            .register(SW_URL)
            .catch((err) => console.warn("Service worker registration failed:", err));

        // A home-screen app can stay suspended for days, so check for a newer worker
        // when it resumes. Reloading is left to AppShell's "Update Available" toast.
        let lastCheck = Date.now();
        const onVisibility = () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
            lastCheck = Date.now();
            navigator.serviceWorker
                .getRegistration(SW_URL)
                .then((r) => r ?? navigator.serviceWorker.getRegistration())
                .then((r) => r?.update())
                .catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, []);

    return null;
}
