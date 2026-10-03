"use client";

import { cn } from "@/lib/utils";

/** UISlider: thin track with a tinted fill and a large white knob. */
export function Slider({
    value,
    onChange,
    min = 0,
    max = 1,
    step = 0.01,
    label,
    valueText,
    className,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    /** Spoken value, e.g. "Mostly tinted". */
    valueText?: string;
    className?: string;
}) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            aria-valuetext={valueText}
            onChange={(e) => onChange(Number(e.target.value))}
            className={cn("ios-slider tap w-full", className)}
            style={{ "--fill": `${pct}%` } as React.CSSProperties}
        />
    );
}
