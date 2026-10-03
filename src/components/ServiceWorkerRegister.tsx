"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/sw";

export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        // public/sw.js: push notifications + (in production) offline app shell.
        navigator.serviceWorker
            .register(SW_URL)
            .catch((err) => console.warn("Service worker registration failed:", err));
    }, []);

    return null;
}
