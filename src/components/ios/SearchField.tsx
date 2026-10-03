"use client";

import { forwardRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClearGlyph({ className }: { className?: string }) {
    // SF Symbol "xmark.circle.fill"
    return (
        <svg viewBox="0 0 20 20" aria-hidden className={cn("size-[17px]", className)}>
            <circle cx="10" cy="10" r="10" fill="currentColor" />
            <path
                d="m6.6 6.6 6.8 6.8m0-6.8-6.8 6.8"
                stroke="var(--sys-cell, #fff)"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}

type SearchFieldProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Shows a "Cancel" button while focused or non-empty, like UISearchBar. */
    showCancel?: boolean;
    onCancel?: () => void;
    onFocusChange?: (focused: boolean) => void;
    className?: string;
    autoFocus?: boolean;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
    function SearchField(
        {
            value,
            onChange,
            placeholder = "Search",
            showCancel = true,
            onCancel,
            onFocusChange,
            className,
            autoFocus,
        },
        ref
    ) {
        const [focused, setFocused] = useState(false);
        const active = showCancel && (focused || value.length > 0);

        return (
            <div className={cn("flex items-center", className)}>
                <div className="bg-fill-3 relative flex h-9 min-w-0 flex-1 items-center rounded-full">
                    <Search
                        aria-hidden
                        className="text-label-2 pointer-events-none absolute left-2.5 size-[17px]"
                        strokeWidth={2.4}
                    />
                    <input
                        ref={ref}
                        type="search"
                        inputMode="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        autoFocus={autoFocus}
                        aria-label={placeholder}
                        value={value}
                        placeholder={placeholder}
                        onChange={(e) => onChange(e.target.value)}
                        onFocus={() => {
                            setFocused(true);
                            onFocusChange?.(true);
                        }}
                        onBlur={() => {
                            setFocused(false);
                            onFocusChange?.(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                onChange("");
                                onCancel?.();
                                e.currentTarget.blur();
                            }
                        }}
                        className="text-body h-full w-full min-w-0 bg-transparent pr-9 pl-[34px] outline-none"
                    />
                    {value ? (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onChange("")}
                            className="tap text-label-3 absolute right-0 flex size-9 items-center justify-center"
                        >
                            <ClearGlyph />
                        </button>
                    ) : null}
                </div>
                <div
                    className={cn(
                        "ease-ios overflow-hidden transition-[max-width,opacity,margin] duration-300",
                        active ? "ml-3 max-w-24 opacity-100" : "ml-0 max-w-0 opacity-0"
                    )}
                >
                    <button
                        type="button"
                        tabIndex={active ? 0 : -1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            onChange("");
                            onCancel?.();
                            (document.activeElement as HTMLElement | null)?.blur?.();
                        }}
                        className="tap text-body text-tint min-h-9 whitespace-nowrap active:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }
);
