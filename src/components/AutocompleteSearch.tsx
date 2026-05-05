"use client";

import React from "react";
import { IoIosSearch } from "react-icons/io";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import UserIconContactList from "@/components/icon/userIconContactList";

export type AutocompleteOption = {
    value: string;
    label: string;
    subLabel: string;
};

function useDebouncedValue<T>(value: T, delay = 300) {
    const [debounced, setDebounced] = React.useState(value);

    React.useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    return debounced;
}

type SearchAutocompleteProps = {
    value?: string; // selected value
    onValueChange?: (value: string) => void;

    options?: AutocompleteOption[]; // static mode
    fetchOptions?: (query: string) => Promise<AutocompleteOption[]>; // async mode

    placeholder?: string;
    emptyText?: string;

    disabled?: boolean;
    debounceMs?: number;
    minChars?: number;

    className?: string;

    /** Optional: get full selected option (if you need label/value) */
    onSelectOption?: (opt: AutocompleteOption) => void;

    /** Optional: called when query changes */
    onQueryChange?: (query: string) => void;

    /** Optional: show dropdown on focus even if query empty */
    openOnFocus?: boolean;

    /** Optional: close on outside click (default true) */
    closeOnOutsideClick?: boolean;
};

const AutocompleteSearch = ({
    value,
    onValueChange,
    onSelectOption,

    options = [],
    fetchOptions,

    placeholder = "Search",
    emptyText = "No results found.",

    disabled = false,
    debounceMs = 300,
    minChars = 0,

    className,
    onQueryChange,
    openOnFocus = true,
    closeOnOutsideClick = true,
}: SearchAutocompleteProps) => {
    const rootRef = React.useRef<HTMLDivElement | null>(null);

    const [query, setQuery] = React.useState("");
    const [open, setOpen] = React.useState(false);

    const [loading, setLoading] = React.useState(false);
    const [remoteOptions, setRemoteOptions] = React.useState<AutocompleteOption[]>([]);

    const debouncedQuery = useDebouncedValue(query, debounceMs);
    const isAsync = typeof fetchOptions === "function";

    const list = React.useMemo(
        () => (isAsync ? remoteOptions : options),
        [isAsync, remoteOptions, options]
    );

    // When "value" changes from outside, try to sync query with selected label
    React.useEffect(() => {
        if (!value) return;

        const found =
            options.find((x) => x.value === value) ||
            remoteOptions.find((x) => x.value === value);

        if (found?.label) setQuery(found.label);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Notify query changes
    React.useEffect(() => {
        onQueryChange?.(query);
    }, [query, onQueryChange]);

    // Async fetching
    React.useEffect(() => {
        if (!isAsync) return;
        if (!open) return;

        const q = debouncedQuery.trim();
        if (q.length < minChars) {
            setRemoteOptions([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const res = await fetchOptions!(q);
                if (!cancelled) setRemoteOptions(res || []);
            } catch {
                if (!cancelled) setRemoteOptions([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isAsync, fetchOptions, debouncedQuery, open, minChars]);

    // Static filtering (lightweight)
    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();

        if (isAsync) return list;
        if (!q) return list;

        return list.filter((x) => x.label.toLowerCase().includes(q));
    }, [query, list, isAsync]);

    // Outside click close
    React.useEffect(() => {
        if (!closeOnOutsideClick) return;
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
    }, [open, closeOnOutsideClick]);

    const canShow =
        open && !disabled && (isAsync ? query.trim().length >= minChars : true);

    const handleSelect = (opt: AutocompleteOption) => {
        onValueChange?.(opt.value);
        onSelectOption?.(opt);
        setQuery(opt.label);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={cn("relative w-full", className)}>
            <div className="relative">
                <input
                    value={query}
                    placeholder={placeholder}
                    type="text"
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(
                        "w-full rounded-full border border-gray-400/40 bg-[#1e1e1e]/60",
                        "py-2 pr-9 pl-3 text-lg outline-0 backdrop-blur-2xl",
                        "transition-colors focus:border-gray-400/80",
                        disabled && "cursor-not-allowed opacity-60"
                    )}
                    onFocus={() => {
                        if (disabled) return;
                        if (openOnFocus) setOpen(true);
                    }}
                    onChange={(e) => {
                        const v = e.target.value;
                        setQuery(v);

                        // when user types, treat as a new search selection
                        if (value) onValueChange?.("");

                        setOpen(true);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false);
                    }}
                />

                <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
                    <IoIosSearch className="text-2xl" />
                </span>
            </div>

            {/* Dropdown */}
            {/*{canShow ? (*/}
            <div
                className={cn(
                    "absolute right-0 bottom-full left-0 z-99 mb-2 overflow-hidden rounded-xl bg-[#0b0f14] shadow-2xl",
                    canShow
                        ? "max-h-[calc(100vh-126px)] border border-white/10 md:max-h-[calc(100vh-156px)]"
                        : "max-h-0",
                    "transition-max-height duration-200"
                )}
            >
                {loading &&
                    Array.from({ length: 20 }).map((_, i) => (
                        <div
                            className="flex w-full cursor-progress items-center justify-start gap-4 px-3 py-2"
                            key={i}
                        >
                            <Skeleton className="h-10 w-10 rounded-full bg-gray-600/30" />
                            <div className="me-1 flex w-3/4 flex-col items-start gap-2 overflow-x-hidden">
                                <Skeleton className="h-4.5 w-full rounded-full bg-gray-600/30" />
                                <Skeleton className="h-[14.14px] w-1/2 rounded-full bg-gray-600/30" />
                            </div>
                        </div>
                    ))}

                {!loading &&
                    (filtered.length === 0 ? (
                        <div className="px-3 py-2 text-xs">{emptyText}</div>
                    ) : (
                        <ul
                            className={`custom-scrollbar max-h-[calc(100vh-126px)] overflow-auto overflow-x-hidden p-0.5 transition-opacity duration-200 md:max-h-[calc(100vh-156px)] ${canShow ? "opacity-100" : "opacity-0"}`}
                        >
                            {filtered.map((item) => {
                                const isSelected = item.value === value;

                                return (
                                    <li key={item.value}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(item)}
                                            className={cn(
                                                "flex w-full items-center justify-start gap-4 px-3 py-2 text-left text-sm",
                                                "transition-colors hover:bg-black/40",
                                                isSelected && "bg-black/5",
                                                "hover:shadow-soft first:rounded-t-xl last:rounded-b-xl"
                                            )}
                                        >
                                            <span className="flex aspect-square h-10 w-10 items-center justify-center rounded-full bg-linear-to-t from-[#40385b] to-[#696679]">
                                                <UserIconContactList
                                                    size={30}
                                                    className="text-[4.2rem] text-white"
                                                />
                                            </span>
                                            <div className="me-1 flex flex-col items-start gap-0.5 overflow-x-hidden">
                                                <span className="truncate text-base font-semibold">
                                                    {item.label}
                                                </span>
                                                <span className="truncate text-white/75">
                                                    {item.subLabel}
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ))}
            </div>
            {/*) : null}*/}
        </div>
    );
};

export default AutocompleteSearch;
