"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

export type Segment<T extends string> = {
    value: T;
    label: string;
    icon?: React.ReactNode;
};

/** UISegmentedControl with a sliding selection pill. */
export function SegmentedControl<T extends string>({
    value,
    onChange,
    segments,
    label,
    className,
}: {
    value: T;
    onChange: (value: T) => void;
    segments: Segment<T>[];
    label: string;
    className?: string;
}) {
    const name = useId();
    const index = Math.max(
        0,
        segments.findIndex((s) => s.value === value)
    );

    return (
        <div
            role="radiogroup"
            aria-label={label}
            className={cn("bg-fill-3 relative grid rounded-[9px] p-[2px]", className)}
            style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
        >
            <span
                aria-hidden
                className="bg-cell ease-ios absolute top-[2px] bottom-[2px] left-[2px] rounded-[7px] shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] transition-transform duration-300 dark:bg-[#636366]"
                style={{
                    width: `calc((100% - 4px) / ${segments.length})`,
                    transform: `translateX(${index * 100}%)`,
                }}
            />
            {segments.map((s) => {
                const selected = s.value === value;
                return (
                    <label
                        key={s.value}
                        className={cn(
                            "tap text-footnote relative z-10 flex min-h-8 items-center justify-center gap-1.5 px-2",
                            "has-[:focus-visible]:outline-tint/50 transition-[font-weight] has-[:focus-visible]:rounded-[7px] has-[:focus-visible]:outline-3",
                            selected ? "font-semibold" : "font-medium"
                        )}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={s.value}
                            checked={selected}
                            onChange={() => onChange(s.value)}
                            className="sr-only"
                        />
                        {s.icon}
                        {s.label}
                    </label>
                );
            })}
        </div>
    );
}
