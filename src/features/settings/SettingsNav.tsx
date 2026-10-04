"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import type { Contact } from "@/lib/api";
import { SheetHeader } from "@/components/ios/Sheet";
import { cn } from "@/lib/utils";

export type SettingsPage =
    | { name: "root" }
    | { name: "telegram" }
    | { name: "contacts" }
    | { name: "contact-edit"; contact: Contact | null }
    | { name: "blocked" }
    | { name: "devices" };

export const PAGE_TITLES: Record<SettingsPage["name"], string> = {
    root: "Settings",
    telegram: "Telegram",
    contacts: "Contacts",
    "contact-edit": "Contact",
    blocked: "Blocked Contacts",
    devices: "Devices",
};

type Nav = {
    push: (p: SettingsPage) => void;
    pop: () => void;
    close: () => void;
    previousTitle: string;
};

export const SettingsNavContext = createContext<Nav>({
    push: () => {},
    pop: () => {},
    close: () => {},
    previousTitle: "Settings",
});

export function useSettingsNav() {
    return useContext(SettingsNavContext);
}

/**
 * A settings page title that takes focus when its page appears (pages remount
 * on every push and pop), so screen readers announce the new page instead of
 * losing focus with the button that navigated. Never takes focus from a field
 * the page autofocused.
 */
export function PageTitle({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const active = document.activeElement;
        if (
            !active ||
            active === document.body ||
            active.getAttribute("role") === "dialog"
        ) {
            ref.current?.focus({ preventScroll: true });
        }
    }, []);
    return (
        <span ref={ref} tabIndex={-1} className="outline-none">
            {children}
        </span>
    );
}

/** Pushed-page header: "‹ Settings" back button with the page title. */
export function PageHeader({
    title,
    trailing,
}: {
    title: string;
    trailing?: React.ReactNode;
}) {
    const { pop, previousTitle } = useSettingsNav();
    return (
        <SheetHeader
            title={<PageTitle>{title}</PageTitle>}
            leading={
                <button
                    type="button"
                    onClick={pop}
                    aria-label={`Back to ${previousTitle}`}
                    className={cn(
                        "tap glass text-body -ml-1 flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-full transition-transform duration-200 active:scale-95",
                        title.length <= 10 ? "pr-3.5 pl-2" : "px-0"
                    )}
                >
                    <ChevronLeft className="size-[22px]" strokeWidth={2.4} />
                    {/* Like UIKit, drop the back title when the page title needs the room. */}
                    {title.length <= 10 ? (
                        <span className="max-w-[110px] truncate">{previousTitle}</span>
                    ) : null}
                </button>
            }
            trailing={trailing}
        />
    );
}
