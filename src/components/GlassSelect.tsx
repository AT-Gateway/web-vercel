"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { IoChevronDown } from "react-icons/io5";

export type SelectOption = {
    value: string;
    label: string;
    subLabel?: string;
    disabled?: boolean;
};

type SelectProps = {
    value?: string;
    onValueChange?: (value: string) => void;

    options: SelectOption[];
    placeholder?: string;

    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyText?: string;

    /** "top" is nice when select is near bottom (like your autocomplete) */
    dropdownSide?: "top" | "bottom";

    className?: string;

    /** optional: return a custom node for selected view */
    renderValue?: (opt: SelectOption | null) => React.ReactNode;
    /** optional: return a custom node for each row */
    renderOption?: (
        opt: SelectOption,
        active: boolean,
        selected: boolean
    ) => React.ReactNode;
};

const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len - 1));

export default function GlassSelect({
    value,
    onValueChange,
    options,
    placeholder = "Select…",
    disabled = false,
    searchable = false,
    searchPlaceholder = "Search…",
    emptyText = "No results.",
    dropdownSide = "bottom",
    className,
    renderValue,
    renderOption,
}: SelectProps) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [activeIndex, setActiveIndex] = React.useState(0);

    const selected = React.useMemo(
        () => options.find((o) => o.value === value) || null,
        [options, value]
    );

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!searchable || !q) return options;
        return options.filter((o) => {
            const hay = `${o.label} ${o.subLabel ?? ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [options, query, searchable]);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;

        const onDown = (e: MouseEvent | TouchEvent) => {
            const el = rootRef.current;
            if (!el) return;
            if (el.contains(e.target as Node)) return;
            setOpen(false);
        };

        document.addEventListener("mousedown", onDown);
        document.addEventListener("touchstart", onDown);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("touchstart", onDown);
        };
    }, [open]);

    // Reset activeIndex when list changes
    React.useEffect(() => {
        setActiveIndex(0);
    }, [query, open]);

    const commit = (opt: SelectOption) => {
        if (disabled || opt.disabled) return;
        onValueChange?.(opt.value);
        setOpen(false);
        setQuery("");
    };

    const dropdownClasses =
        dropdownSide === "top"
            ? "absolute left-0 right-0 bottom-full mb-2"
            : "absolute left-0 right-0 top-full mt-2";

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            {/* Trigger */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setOpen((p) => !p);
                    if (!open && searchable) {
                        // focus search on open
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                    }
                }}
                className={cn(
                    "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60",
                    "flex h-10.25 w-fit min-w-fit px-4 text-left text-sm whitespace-nowrap",
                    "backdrop-blur-3xl transition-colors focus:outline-none",
                    "flex items-center justify-between gap-2",
                    "hover:border-gray-400/80",
                    disabled && "cursor-not-allowed opacity-60"
                )}
            >
                <div className="min-w-0">
                    {renderValue ? (
                        renderValue(selected)
                    ) : selected ? (
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-white">
                                {selected.label}
                            </div>
                        </div>
                    ) : (
                        <span className="text-white/60">{placeholder}</span>
                    )}
                </div>

                <IoChevronDown
                    className={cn(
                        "hidden text-white/70 transition-transform duration-200 sm:flex md:hidden lg:flex",
                        open ? "rotate-180" : "rotate-0"
                    )}
                />
            </button>

            {/* Dropdown */}
            <div
                className={cn(
                    dropdownClasses,
                    "shadow-soft-lg z-99 overflow-hidden rounded-xl bg-[#0b0f14]",
                    "transition-[max-height,opacity] duration-200",
                    open
                        ? "max-h-[340px] opacity-100"
                        : "pointer-events-none max-h-0 opacity-0"
                )}
            >
                {searchable && (
                    <div className="border-b border-white/10 p-2">
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className={cn(
                                "w-full rounded-full border border-gray-400/20 bg-black/60",
                                "px-3 py-2 text-sm text-white outline-0",
                                "focus:border-gray-400/50"
                            )}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") setOpen(false);
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setActiveIndex((i) =>
                                        clampIndex(i + 1, filtered.length)
                                    );
                                }
                                if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setActiveIndex((i) =>
                                        clampIndex(i - 1, filtered.length)
                                    );
                                }
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    const opt = filtered[activeIndex];
                                    if (opt) commit(opt);
                                }
                            }}
                        />
                    </div>
                )}

                {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-white/60">{emptyText}</div>
                ) : (
                    <ul className="custom-scrollbar max-h-[340px] overflow-auto overflow-x-hidden p-0.5">
                        {filtered.map((opt, idx) => {
                            const isSelected = opt.value === value;
                            const isActive = idx === activeIndex;

                            return (
                                <li key={opt.value}>
                                    <button
                                        type="button"
                                        disabled={opt.disabled}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        onClick={() => commit(opt)}
                                        className={cn(
                                            "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                                            "transition-colors",
                                            "first:rounded-t-xl last:rounded-b-xl",
                                            opt.disabled
                                                ? "cursor-not-allowed opacity-50"
                                                : "hover:bg-black/40",
                                            isActive && "bg-black/30",
                                            isSelected && "shadow-soft"
                                        )}
                                    >
                                        {renderOption ? (
                                            renderOption(opt, isActive, isSelected)
                                        ) : (
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-white">
                                                    {opt.label}
                                                </div>
                                                {!!opt.subLabel && (
                                                    <div className="truncate text-xs text-white/60">
                                                        {opt.subLabel}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isSelected ? (
                                            <span className="text-xs font-bold text-white/70">
                                                ✓
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
