"use client";

import { cn } from "@/lib/utils";

/** UISwitch: 51×31 track, 27pt knob, green when on. */
export function Switch({
    checked,
    onChange,
    disabled,
    label,
    className,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
    /** Accessible name when no visible <label> is associated. */
    label?: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "tap relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full",
                "ease-ios transition-colors duration-300 disabled:cursor-default disabled:opacity-50",
                checked ? "bg-green" : "bg-fill",
                className
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white",
                    "shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)]",
                    "ease-spring transition-transform duration-300",
                    checked ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    );
}
