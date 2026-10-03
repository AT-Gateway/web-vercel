"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * iOS 27 navigation bar. Controls float on glass. At rest the bar has no fill,
 * only a plain scroll-edge blur; once content scrolls beneath it a uniform
 * frosted toolbar fades in to keep titles and buttons legible.
 */
export function NavBar({
    title,
    showTitle = true,
    leading,
    trailing,
    center,
    edge = true,
    scrolled = false,
    className,
}: {
    title?: React.ReactNode;
    /** Inline title visibility; screens with a large title fade it in on scroll. */
    showTitle?: boolean;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    /** Custom center content (replaces the inline title). */
    center?: React.ReactNode;
    edge?: boolean;
    /** Content is scrolled under the bar: show the uniform frosted toolbar. */
    scrolled?: boolean;
    className?: string;
}) {
    return (
        <header
            className={cn(
                "pt-safe pointer-events-none absolute inset-x-0 top-0 z-30",
                className
            )}
        >
            <div
                aria-hidden
                className={cn(
                    "glass-bar absolute inset-0 transition-opacity duration-300",
                    scrolled ? "opacity-100" : "opacity-0"
                )}
            />
            {edge ? (
                <div
                    aria-hidden
                    className={cn(
                        "edge-top absolute inset-0 transition-opacity duration-300",
                        scrolled && "opacity-0"
                    )}
                />
            ) : null}
            <div className="relative flex min-h-[60px] items-center gap-2 px-4 py-2">
                <div className="pointer-events-auto flex min-w-11 flex-1 items-center justify-start gap-2">
                    {leading}
                </div>
                {center ? (
                    <div className="pointer-events-auto flex min-w-0 shrink items-center justify-center">
                        {center}
                    </div>
                ) : title ? (
                    <div
                        aria-hidden={!showTitle}
                        className={cn(
                            "text-headline min-w-0 shrink truncate text-center transition-opacity duration-200",
                            showTitle ? "opacity-100" : "opacity-0"
                        )}
                    >
                        {title}
                    </div>
                ) : null}
                <div className="pointer-events-auto flex min-w-11 flex-1 items-center justify-end gap-2">
                    {trailing}
                </div>
            </div>
        </header>
    );
}

export function LargeTitle({
    children,
    subtitle,
    className,
}: {
    children: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("px-4 pb-2", className)}>
            <h1 className="text-large-title font-bold">{children}</h1>
            {subtitle ? (
                <div className="text-subhead text-label-2 mt-0.5">{subtitle}</div>
            ) : null}
        </div>
    );
}
