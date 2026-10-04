"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverFallback = false): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mq = window.matchMedia(query);
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        },
        () => window.matchMedia(query).matches,
        () => serverFallback
    );
}

const SPLIT_QUERY = "(min-width: 768px)";

function subscribeCompact(onChange: () => void): () => void {
    const mq = window.matchMedia(SPLIT_QUERY);
    mq.addEventListener("change", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
        mq.removeEventListener("change", onChange);
        window.removeEventListener("orientationchange", onChange);
    };
}

function getCompactSnapshot(): boolean {
    return (
        !window.matchMedia(SPLIT_QUERY).matches ||
        Math.min(window.screen.width, window.screen.height) < 600
    );
}

/**
 * Compact stack (push navigation) vs. split view (sidebar + detail) from 768px,
 * like iPad regular width.
 *
 * Phones (screen short side ≤ ~480 CSS px) stay in the compact stack in
 * landscape too; iPads and unfolded foldables use the width rule. Max-height or
 * orientation queries are deliberately not used for this switch: the Android
 * keyboard (interactiveWidget: resizes-content) toggles them and would remount
 * the whole tree mid-typing.
 */
export function useIsCompact(): boolean {
    return useSyncExternalStore(subscribeCompact, getCompactSnapshot, () => true);
}

/** Short landscape (phone on its side): use denser chrome. */
export function useIsShort(): boolean {
    return useMediaQuery("(max-height: 500px) and (orientation: landscape)");
}

export function useReducedMotion(): boolean {
    return useMediaQuery("(prefers-reduced-motion: reduce)");
}
