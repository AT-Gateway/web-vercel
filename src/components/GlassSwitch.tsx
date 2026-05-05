"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type GlassSwitchProps = {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;

    disabled?: boolean;
    className?: string;
    id?: string;

    /** Optional labels */
    label?: string;
    description?: string;
};

export default function GlassSwitch({
    checked,
    onCheckedChange,
    disabled = false,
    className,
    id,
    label,
    description,
}: GlassSwitchProps) {
    const toggle = React.useCallback(() => {
        if (disabled) return;
        onCheckedChange(!checked);
    }, [checked, disabled, onCheckedChange]);

    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
            onClick={toggle}
            onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                }
            }}
            className={cn(
                "group flex items-center justify-between gap-3 rounded-3xl border border-gray-400/40 bg-black/80",
                "backdrop-blur-3xl transition-all duration-150",
                disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:scale-[1.01] hover:bg-black/40",
                className
            )}
        >
            {(label || description) && (
                <div className="min-w-0 flex-1 text-left">
                    {label && (
                        <div className="truncate text-sm font-semibold text-white">
                            {label}
                        </div>
                    )}
                    {description && (
                        <div className="truncate text-xs text-white/70">
                            {description}
                        </div>
                    )}
                </div>
            )}

            <span
                className={cn(
                    "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border",
                    "transition-all duration-200",
                    checked
                        ? "border-white/20 bg-white/90"
                        : "border-gray-400/40 bg-black/60"
                )}
            >
                <span
                    className={cn(
                        "pointer-events-none absolute top-0.5 left-1 -mt-px h-6 w-6 rounded-full",
                        "transition-all duration-200",
                        checked ? "translate-x-6 bg-black" : "translate-x-0 bg-white/90"
                    )}
                />
            </span>
        </button>
    );
}
