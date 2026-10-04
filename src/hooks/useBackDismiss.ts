"use client";

import { useEffect, useRef, useState } from "react";

type CloseWatcherLike = {
    onclose: ((e: Event) => void) | null;
    destroy: () => void;
};
type CloseWatcherCtor = new () => CloseWatcherLike;

/**
 * Lets the Android system Back gesture/button dismiss an overlay (sheet, menu,
 * confirm) instead of leaving the app, via CloseWatcher (Chrome 120+).
 *
 * - No `history.pushState` fallback: a fake history entry races the real URL
 *   navigation (openThread/closeThread push `?tid=`, NewMessageSheet.start
 *   navigates while closing), so this never touches history. Browsers without
 *   CloseWatcher simply keep their default Back behavior.
 * - Coarse pointers only: CloseWatcher also listens to Escape, and on desktop
 *   Radix/vaul already dismiss on Escape themselves. (Radix calls
 *   preventDefault on the Escape it handles, which cancels the close request,
 *   so a hardware keyboard on a phone doesn't double-close either.)
 * - Re-arms after each Back: when `onBack` doesn't close the overlay (popping a
 *   Settings page inside the sheet), the next Back must still be caught. The
 *   re-arm goes through state so it happens after React has applied whatever
 *   `onBack` did; if the overlay closed, the effect just tears down.
 * - LIFO: the browser closes the most recently created watcher first, so the
 *   overlay opened last (a menu or confirm inside a sheet) closes first.
 */
export function useBackDismiss(active: boolean, onBack: () => void): void {
    const cb = useRef(onBack);
    cb.current = onBack;
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        if (!active || typeof window === "undefined") return;
        const CW = (window as unknown as { CloseWatcher?: CloseWatcherCtor })
            .CloseWatcher;
        if (typeof CW !== "function" || !window.matchMedia("(pointer: coarse)").matches) {
            return;
        }
        let watcher: CloseWatcherLike | null = null;
        try {
            watcher = new CW();
        } catch {
            return;
        }
        let disposed = false;
        watcher.onclose = () => {
            if (disposed) return;
            cb.current();
            // Re-arm on the next render (a no-op if the overlay closed meanwhile).
            setGeneration((g) => g + 1);
        };
        return () => {
            disposed = true;
            watcher?.destroy();
        };
    }, [active, generation]);
}
