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

export function applyAppearance(value: Appearance) {
    const root = document.documentElement;
    if (value === "system") delete root.dataset.theme;
    else root.dataset.theme = value;
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
