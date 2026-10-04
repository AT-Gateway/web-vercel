"use client";

import { useRef } from "react";
import { normalizeDigits } from "@/lib/phone";

/** Inset-grouped text fields for a contact's name and number. */
export function ContactForm({
    name,
    number,
    onName,
    onNumber,
    onSubmit,
    lockNumber,
}: {
    name: string;
    number: string;
    onName: (v: string) => void;
    onNumber: (v: string) => void;
    onSubmit: () => void;
    lockNumber?: boolean;
}) {
    const phoneRef = useRef<HTMLInputElement>(null);
    // The name field's return key moves on to the number while one is still needed.
    const needsNumber = !lockNumber && !number.trim();

    return (
        <form
            className="px-4"
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <div className="bg-cell overflow-hidden rounded-[22px]">
                <label className="flex min-h-11 items-center pl-4">
                    <span className="sr-only">Name</span>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => onName(e.target.value)}
                        onKeyDown={(e) => {
                            if (
                                e.key === "Enter" &&
                                needsNumber &&
                                !e.nativeEvent.isComposing
                            ) {
                                e.preventDefault();
                                phoneRef.current?.focus();
                            }
                        }}
                        placeholder="Name"
                        // "off", not "name": the browser would offer the user's own name.
                        autoComplete="off"
                        autoCapitalize="words"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint={needsNumber ? "next" : "done"}
                        dir="auto"
                        className="hairline-b text-body h-11 w-full bg-transparent pr-4 outline-none"
                    />
                </label>
                <label className="flex min-h-11 items-center gap-3 pl-4">
                    <span className="text-subhead text-tint w-16 shrink-0">mobile</span>
                    <span className="sr-only">Phone number</span>
                    <input
                        ref={phoneRef}
                        value={number}
                        onChange={(e) => onNumber(normalizeDigits(e.target.value))}
                        placeholder="Phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        enterKeyHint="done"
                        readOnly={lockNumber}
                        className="text-body read-only:text-label-2 h-11 w-full bg-transparent pr-4 outline-none"
                    />
                </label>
            </div>
            <button type="submit" hidden />
            <p className="text-footnote text-label-2 mt-2 px-4">
                Names you save here are stored on the gateway and take priority over names
                synced from the phone.
            </p>
        </form>
    );
}
