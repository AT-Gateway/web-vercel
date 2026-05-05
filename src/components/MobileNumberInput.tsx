"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FiChevronDown, FiX } from "react-icons/fi";

export type CountryPhone = {
    iso2: string; // "TR"
    name: string; // "Turkey"
    dialCode: string; // "90"
    flag: string; // "🇹🇷"
};

export type MobileNumberInputValue = {
    e164: string; // +<dialCode><national>
    country: CountryPhone;
    nationalNumber: string; // digits only (no spaces)
    isValid: boolean;
    formatted: string; // +98 903 252 2313
};

type Props = {
    value?: string; // E.164, e.g. "+989032522313"
    onChange?: (e164: string) => void;

    /** Optional: get parsed output */
    onValue?: (v: MobileNumberInputValue) => void;

    defaultCountryIso2?: string; // e.g. "TR"
    countries?: CountryPhone[];

    placeholder?: string;
    disabled?: boolean;

    /** Validation */
    minDigits?: number; // default 7
    maxDigits?: number; // default 15
    showError?: boolean; // default true

    /** Formatting */
    stripNationalLeadingZero?: boolean; // default true
    showFormattedPreview?: boolean; // default true

    className?: string;
    inputClassName?: string;
    dropdownClassName?: string;

    /** Useful inside drawers/drag containers */
    noDrag?: boolean; // default true
};

const DEFAULT_COUNTRIES: CountryPhone[] = [
    { iso2: "TR", name: "Turkey", dialCode: "90", flag: "🇹🇷" },
    { iso2: "IR", name: "Iran", dialCode: "98", flag: "🇮🇷" },
    { iso2: "US", name: "United States", dialCode: "1", flag: "🇺🇸" },
    { iso2: "CA", name: "Canada", dialCode: "1", flag: "🇨🇦" },
    { iso2: "GB", name: "United Kingdom", dialCode: "44", flag: "🇬🇧" },
    { iso2: "DE", name: "Germany", dialCode: "49", flag: "🇩🇪" },
    { iso2: "FR", name: "France", dialCode: "33", flag: "🇫🇷" },
    { iso2: "NL", name: "Netherlands", dialCode: "31", flag: "🇳🇱" },
    { iso2: "IT", name: "Italy", dialCode: "39", flag: "🇮🇹" },
    { iso2: "ES", name: "Spain", dialCode: "34", flag: "🇪🇸" },
];

function digitsOnly(s: string) {
    return (s || "").replace(/\D+/g, "");
}

function normalizeE164(s: string) {
    const t = (s || "").trim();
    if (!t) return "";
    if (t.startsWith("+")) return `+${digitsOnly(t)}`;
    return `+${digitsOnly(t)}`;
}

function sortByDialDesc(list: CountryPhone[]) {
    return [...list].sort((a, b) => b.dialCode.length - a.dialCode.length);
}

function stripLeadingZeroOnce(n: string) {
    return n.startsWith("0") ? n.slice(1) : n;
}

/**
 * Country-specific grouping (optional). Falls back to a smart generic grouping.
 * Examples:
 * IR mobile (10 digits): 903 252 2313  => [3,3,4]
 * TR mobile (10 digits): 555 111 22 33 => [3,3,2,2]
 */
function patternFor(iso2: string, len: number): number[] | null {
    const iso = iso2.toUpperCase();
    const MAP: Record<string, Record<number, number[]>> = {
        IR: { 10: [3, 3, 4] },
        TR: { 10: [3, 3, 2, 2] },
        US: { 10: [3, 3, 4] },
        CA: { 10: [3, 3, 4] },
    };
    return MAP[iso]?.[len] ?? null;
}

function fallbackPattern(len: number): number[] {
    if (len <= 3) return [len];
    if (len <= 6) return [3, len - 3];
    if (len === 7) return [3, 4];
    if (len === 8) return [4, 4];
    if (len === 9) return [3, 3, 3];
    if (len === 10) return [3, 3, 4];
    if (len === 11) return [3, 4, 4];
    if (len === 12) return [3, 3, 3, 3];

    // 13+ => group by 3s, last remainder
    const parts: number[] = [];
    let left = len;
    while (left > 4) {
        parts.push(3);
        left -= 3;
    }
    parts.push(left);
    return parts;
}

function formatDigitsByPattern(digits: string, pattern: number[]) {
    const d = digitsOnly(digits);
    if (!d) return "";
    const parts: string[] = [];
    let idx = 0;
    for (const size of pattern) {
        if (idx >= d.length) break;
        parts.push(d.slice(idx, idx + size));
        idx += size;
    }
    if (idx < d.length) parts.push(d.slice(idx));
    return parts.join(" ");
}

function formatNationalDigits(iso2: string, digits: string) {
    const d = digitsOnly(digits);
    if (!d) return "";
    const pat = patternFor(iso2, d.length) ?? fallbackPattern(d.length);
    return formatDigitsByPattern(d, pat);
}

function isValidNational(digits: string, minDigits: number, maxDigits: number) {
    const n = digitsOnly(digits);
    return n.length >= minDigits && n.length <= maxDigits;
}

function findCountryByE164(e164: string, countries: CountryPhone[]) {
    const v = normalizeE164(e164);
    if (!v.startsWith("+")) return null;

    const dials = sortByDialDesc(countries);
    for (const c of dials) {
        const prefix = `+${c.dialCode}`;
        if (v.startsWith(prefix)) {
            return { country: c, national: v.slice(prefix.length) };
        }
    }
    return null;
}

/** caret helpers so typing with spaces feels natural */
function countDigitsBefore(s: string, pos: number) {
    let c = 0;
    for (let i = 0; i < Math.min(pos, s.length); i += 1) {
        if (/\d/.test(s[i])) c += 1;
    }
    return c;
}

function posFromDigitIndex(formatted: string, digitIndex: number) {
    if (digitIndex <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i += 1) {
        if (/\d/.test(formatted[i])) {
            seen += 1;
            if (seen >= digitIndex) return i + 1;
        }
    }
    return formatted.length;
}

export default function MobileNumberInput({
    value,
    onChange,
    onValue,

    defaultCountryIso2 = "TR",
    countries = DEFAULT_COUNTRIES,

    placeholder = "Mobile number",
    disabled = false,

    minDigits = 7,
    maxDigits = 15,
    showError = true,

    stripNationalLeadingZero = true,
    showFormattedPreview = true,

    className,
    inputClassName,
    dropdownClassName,

    noDrag = true,
}: Props) {
    const allCountries = React.useMemo(() => {
        const map = new Map<string, CountryPhone>();
        for (const c of countries) {
            if (!c?.iso2) continue;
            const iso = c.iso2.toUpperCase();
            if (!map.has(iso)) map.set(iso, { ...c, iso2: iso });
        }
        return Array.from(map.values());
    }, [countries]);

    const defaultCountry = React.useMemo(() => {
        const iso = defaultCountryIso2.toUpperCase();
        return (
            allCountries.find((c) => c.iso2 === iso) ||
            allCountries[0] ||
            DEFAULT_COUNTRIES[0]
        );
    }, [allCountries, defaultCountryIso2]);

    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const [open, setOpen] = React.useState(false);
    const [q, setQ] = React.useState("");

    const [country, setCountry] = React.useState<CountryPhone>(defaultCountry);
    const [nationalDigits, setNationalDigits] = React.useState<string>("");

    // Sync from external value (E.164)
    React.useEffect(() => {
        if (!value) {
            setNationalDigits("");
            setCountry(defaultCountry);
            return;
        }
        const parsed = findCountryByE164(value, allCountries);
        if (!parsed) {
            const v = normalizeE164(value);
            setNationalDigits(digitsOnly(v.startsWith("+") ? v.slice(1) : v));
            return;
        }
        setCountry(parsed.country);
        setNationalDigits(digitsOnly(parsed.national));
    }, [value, allCountries, defaultCountry]);

    const filteredCountries = React.useMemo(() => {
        const query = q.trim().toLowerCase();
        if (!query) return allCountries;
        return allCountries.filter((c) => {
            const hay = `${c.name} ${c.iso2} +${c.dialCode}`.toLowerCase();
            return hay.includes(query);
        });
    }, [q, allCountries]);

    const strippedNational = React.useMemo(() => {
        const d = digitsOnly(nationalDigits);
        return stripNationalLeadingZero ? stripLeadingZeroOnce(d) : d;
    }, [nationalDigits, stripNationalLeadingZero]);

    const formattedNational = React.useMemo(() => {
        return formatNationalDigits(country.iso2, strippedNational);
    }, [country.iso2, strippedNational]);

    const e164 = React.useMemo(() => {
        if (!strippedNational) return `+${country.dialCode}`;
        return `+${country.dialCode}${strippedNational}`;
    }, [country.dialCode, strippedNational]);

    const formattedFull = React.useMemo(() => {
        if (!strippedNational) return `+${country.dialCode}`;
        return `+${country.dialCode} ${formattedNational}`;
    }, [country.dialCode, strippedNational, formattedNational]);

    const valid = React.useMemo(() => {
        if (!strippedNational) return false;
        return isValidNational(strippedNational, minDigits, maxDigits);
    }, [strippedNational, minDigits, maxDigits]);

    React.useEffect(() => {
        onValue?.({
            e164,
            formatted: formattedFull,
            country,
            nationalNumber: strippedNational,
            isValid: valid,
        });
    }, [e164, formattedFull, country, strippedNational, valid, onValue]);

    const emit = React.useCallback(
        (nextCountry: CountryPhone, nextDigits: string) => {
            const d0 = digitsOnly(nextDigits);
            const d = stripNationalLeadingZero ? stripLeadingZeroOnce(d0) : d0;
            const nextE164 = d
                ? `+${nextCountry.dialCode}${d}`
                : `+${nextCountry.dialCode}`;
            onChange?.(nextE164);
        },
        [onChange, stripNationalLeadingZero]
    );

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

    return (
        <div ref={rootRef} className={cn("relative w-full", className)}>
            <div
                className={cn(
                    "relative w-full rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 backdrop-blur-2xl",
                    "flex items-center gap-2 py-1.5 pr-2 pl-2",
                    disabled && "cursor-not-allowed opacity-60"
                )}
                {...(noDrag ? { "data-vaul-no-drag": true } : {})}
            >
                {/* Country button */}
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen((v) => !v)}
                    className={cn(
                        "flex items-center gap-2 rounded-full px-3 py-1.5",
                        "border border-gray-400/30 bg-white/5",
                        "transition-all duration-150 hover:scale-[1.01] hover:bg-white/10",
                        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                    )}
                    aria-label="Select country"
                >
                    <span className="text-lg leading-none">{country.flag}</span>
                    <span className="text-sm text-white/80">{`+${country.dialCode}`}</span>
                    <FiChevronDown
                        className={cn(
                            "text-white/70 transition-transform duration-150",
                            open && "rotate-180"
                        )}
                    />
                </button>

                {/* Number input (shows formatted with spaces) */}
                <input
                    ref={inputRef}
                    value={formattedNational}
                    onChange={(e) => {
                        const el = e.currentTarget;
                        const caret = el.selectionStart ?? el.value.length;
                        const digitIndex = countDigitsBefore(el.value, caret);

                        const nextDigitsRaw = digitsOnly(e.target.value);
                        setNationalDigits(nextDigitsRaw);
                        emit(country, nextDigitsRaw);

                        // restore caret after formatting
                        requestAnimationFrame(() => {
                            const inp = inputRef.current;
                            if (!inp) return;
                            const nextFormatted = formatNationalDigits(
                                country.iso2,
                                stripNationalLeadingZero
                                    ? stripLeadingZeroOnce(nextDigitsRaw)
                                    : nextDigitsRaw
                            );
                            const nextPos = posFromDigitIndex(nextFormatted, digitIndex);
                            inp.setSelectionRange(nextPos, nextPos);
                        });
                    }}
                    disabled={disabled}
                    inputMode="tel"
                    autoComplete="tel"
                    spellCheck={false}
                    placeholder={placeholder}
                    className={cn(
                        "w-full bg-transparent text-sm text-white outline-0 md:text-base",
                        "placeholder:text-white/40",
                        "px-2 py-2",
                        "text-left",
                        inputClassName
                    )}
                    style={{ direction: "ltr" }}
                />

                {/* Clear */}
                {digitsOnly(nationalDigits).length > 0 && !disabled ? (
                    <button
                        type="button"
                        onClick={() => {
                            setNationalDigits("");
                            emit(country, "");
                        }}
                        className={cn(
                            "flex h-9 w-9 min-w-9 items-center justify-center rounded-full",
                            "border border-gray-400/30 bg-white/5",
                            "transition-all duration-150 hover:scale-[1.05] hover:bg-white/10"
                        )}
                        aria-label="Clear"
                    >
                        <FiX className="text-white/70" />
                    </button>
                ) : null}
            </div>

            {/* Dropdown */}
            <div
                className={cn(
                    "absolute right-0 bottom-full left-0 z-50 mb-2 overflow-hidden rounded-2xl",
                    "shadow-soft-lg border border-white/10 bg-[#0b0f14]",
                    "transition-[max-height,opacity] duration-200",
                    open
                        ? "max-h-[340px] opacity-100"
                        : "pointer-events-none max-h-0 opacity-0",
                    dropdownClassName
                )}
            >
                <div className="custom-scrollbar max-h-[280px] overflow-auto overflow-x-hidden">
                    {filteredCountries.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-white/70">No results.</div>
                    ) : (
                        filteredCountries.map((c) => {
                            const selected = c.iso2 === country.iso2;
                            return (
                                <button
                                    key={`${c.iso2}-${c.dialCode}`}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                        setCountry(c);
                                        setOpen(false);
                                        setQ("");
                                        emit(c, nationalDigits);
                                    }}
                                    className={cn(
                                        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
                                        "transition-colors hover:bg-white/5",
                                        selected && "bg-white/5"
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="text-lg leading-none">
                                            {c.flag}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">
                                                {c.name}
                                            </div>
                                            <div className="truncate text-xs text-white/60">
                                                {c.iso2}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-sm text-white/70">{`+${c.dialCode}`}</div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="border-t border-white/10 p-2">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search country…"
                        className={cn(
                            "w-full rounded-xl border border-gray-400/30 bg-black/60 px-3 py-2 text-sm",
                            "text-white outline-0 placeholder:text-white/40"
                        )}
                        disabled={disabled}
                        {...(noDrag ? { "data-vaul-no-drag": true } : {})}
                    />
                </div>
            </div>
        </div>
    );
}
