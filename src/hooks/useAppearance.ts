"use client";

import { useCallback, useEffect, useState } from "react";
import {
    type Appearance,
    DEFAULT_GLASS_TINT,
    loadAppearance,
    loadGlassTint,
    saveAppearance,
    saveGlassTint,
} from "@/lib/storage";

let appliedAppearance: Appearance = "system";
let themeColorOverride: string | null = null;

/**
 * Points every `<meta name="theme-color">` (Next emits one per color scheme) at
 * the in-app appearance: a forced Light/Dark gets a single unconditional color,
 * "system" restores the original media-gated pair. An override (the black page
 * behind a bottom sheet) wins over both.
 */
function syncThemeColor() {
    const forced =
        themeColorOverride ??
        (appliedAppearance === "light"
            ? "#ffffff"
            : appliedAppearance === "dark"
              ? "#000000"
              : null);
    document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((m) => {
            if (!m.hasAttribute("data-orig-content")) {
                m.setAttribute("data-orig-content", m.getAttribute("content") ?? "");
                m.setAttribute("data-orig-media", m.getAttribute("media") ?? "");
            }
            if (forced) {
                m.setAttribute("content", forced);
                m.removeAttribute("media");
                return;
            }
            m.setAttribute("content", m.getAttribute("data-orig-content") ?? "");
            const media = m.getAttribute("data-orig-media");
            if (media) m.setAttribute("media", media);
            else m.removeAttribute("media");
        });
}

export function applyAppearance(value: Appearance) {
    const root = document.documentElement;
    if (value === "system") delete root.dataset.theme;
    else root.dataset.theme = value;
    appliedAppearance = value;
    syncThemeColor();
}

/**
 * While a vaul bottom sheet is in the DOM the page behind it is black
 * (globals.css `body:has([data-vaul-drawer])`); paint the status bar / browser
 * toolbar black too, like the iOS card stack. vaul portals the drawer straight
 * into <body>, so watching body's direct children is enough. Returns a cleanup.
 */
export function watchSheetThemeColor(): () => void {
    let dark = false;
    const check = () => {
        const next = Boolean(document.querySelector("[data-vaul-drawer]"));
        if (next === dark) return;
        dark = next;
        themeColorOverride = next ? "#000000" : null;
        syncThemeColor();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true });
    check();
    return () => {
        observer.disconnect();
        if (dark) {
            themeColorOverride = null;
            syncThemeColor();
        }
    };
}

export function useAppearance(): [Appearance, (v: Appearance) => void] {
    const [value, setValue] = useState<Appearance>("system");

    useEffect(() => {
        setValue(loadAppearance());
    }, []);

    const update = useCallback((v: Appearance) => {
        setValue(v);
        saveAppearance(v);
        applyAppearance(v);
    }, []);

    return [value, update];
}

export function applyGlassTint(value: number) {
    document.documentElement.style.setProperty("--glass-tint", String(value));
}

/** The Liquid Glass transparency setting (iOS 27: Ultra Clear … Fully Tinted). */
export function useGlassTint(): [number, (v: number) => void] {
    const [value, setValue] = useState(DEFAULT_GLASS_TINT);

    useEffect(() => {
        setValue(loadGlassTint());
    }, []);

    const update = useCallback((v: number) => {
        setValue(v);
        saveGlassTint(v);
        applyGlassTint(v);
    }, []);

    return [value, update];
}

/**
 * Inline script for <head>: applies saved appearance and glass tint before first
 * paint, and hides the launch splash after 10s if the app never signals ready.
 */
export const APPEARANCE_BOOT_SCRIPT = `try{var d=document.documentElement,a=localStorage.getItem("appearance");if(a==="light"||a==="dark")d.dataset.theme=a;var g=parseFloat(localStorage.getItem("glassTint"));if(g>=0&&g<=1)d.style.setProperty("--glass-tint",String(g))}catch(e){}setTimeout(function(){var r=document.documentElement;if(!r.getAttribute("data-app-ready"))r.setAttribute("data-app-ready","timeout")},10000);`;
