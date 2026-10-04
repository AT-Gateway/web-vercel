"use client";

import { useEffect } from "react";
import { isShortScreen } from "@/hooks/useMediaQuery";

/**
 * Tracks the visual viewport (the part of the page left visible above the iOS
 * software keyboard) and mirrors it into CSS variables on <html>:
 *
 *   --vvh  visualViewport.height, in px
 *   --vvt  visualViewport.offsetTop, in px
 *   --kb   keyboard overlap: max(0, innerHeight - vv.height - vv.offsetTop), in px
 *
 * plus the attribute `data-keyboard` while the software keyboard is up. That is
 * detected two ways, because iOS versions differ: the keyboard overlaps the
 * layout viewport (--kb > 80), or the whole viewport shrank — the visible
 * height dropped > 150px below the tallest seen in this orientation (iOS
 * resizing like Android, where --kb stays 0). Safari's toolbar collapsing only
 * moves ~50–80px, so it can't trip the second check.
 *
 * Consumers must always write fallbacks, because the variables are unset during
 * SSR and before this hook runs: `var(--vvh,100dvh)`, `var(--vvt,0px)`,
 * `var(--kb,0px)`.
 *
 * On Android (`interactiveWidget: resizes-content`) innerHeight already shrinks
 * with the keyboard, so --kb stays 0 and --vvh equals the layout height; nothing
 * changes there. iOS overlays the keyboard instead, which is what this covers.
 *
 * The body is overflow:hidden, so the document must never scroll: when iOS pans
 * the layout viewport to reveal a focused field, it is scrolled back to 0.
 * Pinch-zoom (scale > 1) is left alone.
 *
 * Mount once (AppShell). It only writes CSS variables — it never sets React state.
 */
export function useVisualViewport(): void {
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const root = document.documentElement;
        let raf = 0;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        // Tallest visible height per orientation (keyed by width), the baseline
        // a shrinking viewport is compared against.
        let baseWidth = 0;
        let baseHeight = 0;

        const apply = () => {
            raf = 0;
            if (vv.scale > 1.01) return;
            const top = Math.max(0, Math.round(vv.offsetTop));
            const h = Math.round(vv.height);
            const kb = Math.max(
                0,
                Math.round(window.innerHeight - vv.height - vv.offsetTop)
            );
            if (window.scrollY !== 0) window.scrollTo(0, 0);
            const w = Math.round(window.innerWidth);
            if (w !== baseWidth) {
                baseWidth = w;
                baseHeight = 0;
            }
            baseHeight = Math.max(baseHeight, h + top, Math.round(window.innerHeight));
            const shrunk = baseHeight - h > 150;
            root.style.setProperty("--vvh", h + "px");
            root.style.setProperty("--vvt", top + "px");
            root.style.setProperty("--kb", kb + "px");
            if (kb > 80 || shrunk) root.dataset.keyboard = "";
            else delete root.dataset.keyboard;
        };

        const update = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(apply);
        };

        // Standalone iOS PWAs can stay shifted after the keyboard closes; re-check
        // right away and once more after the keyboard animation has finished.
        const onFocusOut = () => {
            update();
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(update, 300);
        };

        vv.addEventListener("resize", update);
        vv.addEventListener("scroll", update);
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("orientationchange", update);
        window.addEventListener("focusout", onFocusOut);
        update();

        return () => {
            if (raf) cancelAnimationFrame(raf);
            if (timeout) clearTimeout(timeout);
            vv.removeEventListener("resize", update);
            vv.removeEventListener("scroll", update);
            window.removeEventListener("scroll", update);
            window.removeEventListener("orientationchange", update);
            window.removeEventListener("focusout", onFocusOut);
            root.style.removeProperty("--vvh");
            root.style.removeProperty("--vvt");
            root.style.removeProperty("--kb");
            delete root.dataset.keyboard;
        };
    }, []);

    // <html data-short> drives the `short:` variant (phone on its side).
    useEffect(() => {
        const root = document.documentElement;
        const sync = () => root.toggleAttribute("data-short", isShortScreen());
        const so = window.screen.orientation;
        sync();
        so?.addEventListener("change", sync);
        window.addEventListener("orientationchange", sync);
        window.addEventListener("resize", sync);
        return () => {
            so?.removeEventListener("change", sync);
            window.removeEventListener("orientationchange", sync);
            window.removeEventListener("resize", sync);
            root.removeAttribute("data-short");
        };
    }, []);
}
