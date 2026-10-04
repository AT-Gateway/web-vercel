"use client";

import { useMemo, useRef } from "react";
import type React from "react";

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range"]);

/** Blurs the focused text field (dismissing the software keyboard), if any. */
export function blurActiveField(): void {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return;
    const isTextField =
        (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type)) ||
        el instanceof HTMLTextAreaElement ||
        el.isContentEditable;
    if (isTextField) el.blur();
}

/**
 * iOS "scrollViewKeyboardDismissMode": dragging the content dismisses the
 * keyboard. Spread the returned handlers onto a scroll container — the thread
 * transcript uses `direction: "down"` (interactive dismiss), search and contact
 * lists use `direction: "any"`.
 *
 * Touch events are used on purpose: touchmove keeps firing during native
 * scrolling, whereas pointer events are cancelled once the browser takes over.
 * The handlers are passive and never call preventDefault, so scrolling is
 * unaffected.
 */
export function useDismissKeyboardOnDrag({
    direction = "down",
    threshold = 12,
}: { direction?: "down" | "any"; threshold?: number } = {}): {
    onTouchStart: React.TouchEventHandler;
    onTouchMove: React.TouchEventHandler;
    onTouchEnd: React.TouchEventHandler;
} {
    const startY = useRef<number | null>(null);

    return useMemo(
        () => ({
            onTouchStart: (e: React.TouchEvent) => {
                startY.current = e.touches[0]?.clientY ?? null;
            },
            onTouchMove: (e: React.TouchEvent) => {
                const start = startY.current;
                const touch = e.touches[0];
                if (start === null || !touch) return;
                const dy = touch.clientY - start;
                if (direction === "down" ? dy > threshold : Math.abs(dy) > threshold) {
                    blurActiveField();
                    startY.current = null;
                }
            },
            onTouchEnd: () => {
                startY.current = null;
            },
        }),
        [direction, threshold]
    );
}
