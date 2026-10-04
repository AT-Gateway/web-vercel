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

/**
 * Phone on its side. Decided from the device orientation and the screen's short
 * side — never from the viewport — so the Android keyboard (which makes the
 * viewport wide and short) doesn't flip the layout mid-typing.
 */
export function isShortScreen(): boolean {
    if (typeof window === "undefined") return false;
    const type = window.screen.orientation?.type;
    const landscape = type
        ? type.startsWith("landscape")
        : Math.abs(Number((window as { orientation?: number }).orientation ?? 0)) === 90;
    // A portrait-shaped viewport is never a phone on its side (the keyboard only
    // ever shrinks the height); guards against a misreported orientation.
    const portraitViewport = window.innerWidth < window.innerHeight;
    return (
        landscape &&
        !portraitViewport &&
        Math.min(window.screen.width, window.screen.height) <= 500
    );
}

function subscribeShort(onChange: () => void): () => void {
    const so = window.screen.orientation;
    so?.addEventListener("change", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("resize", onChange);
    return () => {
        so?.removeEventListener("change", onChange);
        window.removeEventListener("orientationchange", onChange);
        window.removeEventListener("resize", onChange);
    };
}

/** Short landscape (phone on its side): use denser chrome. Mirrors `short:` in CSS. */
export function useIsShort(): boolean {
    return useSyncExternalStore(subscribeShort, isShortScreen, () => false);
}

export function useReducedMotion(): boolean {
    return useMediaQuery("(prefers-reduced-motion: reduce)");
}
