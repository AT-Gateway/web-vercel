"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { IoCheckmarkOutline, IoCopyOutline } from "react-icons/io5";

type MessageDirection = "in" | "out";

export type MessageBoxMessage = {
    id: string;
    threadId: string;
    peer: string;
    peerName: string | null;
    direction: "in" | "out";
    body: string;
    bodyIsEncrypted: 0 | 1;
    ts: number;
    status: "received" | "queued" | "sent" | "failed";
    deliveredAt: number | null;
    simSlotIndex: number | null;
    subscriptionId: number | null;
    createdBy: "android" | "pwa" | "telegram";
};

type MessageBoxComponentProps = {
    m: MessageBoxMessage;
    hasPersianSpecificChars: (s?: string) => boolean;
    formatClock: (ts: number) => string;
    statusLabel: (m: MessageBoxMessage) => string;
    isLastChild?: boolean;
};

const MessageBoxComponent: React.FC<MessageBoxComponentProps> = ({
    m,
    hasPersianSpecificChars,
    formatClock,
    statusLabel,
    isLastChild = false,
}) => {
    const [showDetails, setShowDetails] = useState(false);
    const [showCopy, setShowCopy] = useState(false);
    const [copied, setCopied] = useState(false);

    const text = useMemo(() => m.body ?? "", [m.body]);
    const lines = useMemo(() => text.split("\n"), [text]);

    const simLabel = useMemo(() => {
        if (m.simSlotIndex === 0) return "SIM 1";
        if (m.simSlotIndex === 1) return "SIM 2";
        return "SIM 1";
    }, [m.simSlotIndex]);

    useEffect(() => {
        setShowDetails(isLastChild);
    }, [isLastChild]);

    const handleCopy = useCallback(async () => {
        if (!text.trim()) return;

        try {
            // Prefer modern clipboard API
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.setAttribute("readonly", "true");
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                ta.style.top = "0";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }

            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            // ignore copy errors silently
        }
    }, [text]);

    return (
        <>
            <div
                className={cn(
                    "relative flex w-fit max-w-[90%] flex-col rounded-4xl border",
                    "cursor-pointer border-white/20 bg-white/5 px-4 py-2 select-none lg:max-w-1/2",
                    m.direction === "in"
                        ? "self-start rounded-bl-xl"
                        : "self-end rounded-br-xl bg-white/90! text-black backdrop-blur-3xl!"
                )}
                onClick={() => {
                    setShowDetails((p) => {
                        setShowCopy(!p);
                        return !p;
                    });
                }}
            >
                {lines.map((l, idx) => (
                    <span
                        className="w-full wrap-break-word whitespace-pre-wrap"
                        dir={hasPersianSpecificChars(l) ? "rtl" : "ltr"}
                        key={`${m.id}_${idx}`}
                    >
                        {l}
                    </span>
                ))}

                {/* Details line */}
                <span
                    className={cn(
                        "absolute flex items-center",
                        "-bottom-4 text-xs whitespace-nowrap text-white",
                        "transition-all duration-400",
                        m.direction === "in" ? "left-2 origin-top" : "right-2 origin-top",
                        showDetails ? "scale-100 opacity-100" : "scale-0 opacity-0"
                    )}
                >
                    {m.direction === "in"
                        ? `${simLabel} - ${formatClock(m.ts)}`
                        : `${simLabel} - ${statusLabel(m)}, ${formatClock(m.ts)}`}
                </span>

                {/* Copy button */}
                <button
                    type="button"
                    aria-label="Copy message"
                    title={copied ? "Copied" : "Copy"}
                    onClick={(e) => {
                        e.stopPropagation(); // prevent toggling details
                        handleCopy();
                    }}
                    className={cn(
                        "absolute flex items-center justify-center",
                        "top-1/2 -translate-y-1/2 text-xl text-white",
                        "h-8 w-8 min-w-8 cursor-pointer rounded-full",
                        "border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white backdrop-blur-3xl",
                        "transition-all duration-400 hover:scale-[1.05] hover:bg-black/40",
                        m.direction === "in"
                            ? "-right-10 origin-left"
                            : "-left-10 origin-right",
                        showCopy ? "scale-100 opacity-100" : "scale-0 opacity-0"
                    )}
                >
                    <span
                        className={cn(
                            "absolute inset-0 grid place-items-center transition-all duration-400",
                            copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
                        )}
                    >
                        <IoCheckmarkOutline />
                    </span>

                    <span
                        className={cn(
                            "absolute inset-0 grid place-items-center transition-all duration-400",
                            copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
                        )}
                    >
                        <IoCopyOutline />
                    </span>
                </button>
            </div>

            {/* Spacer animate */}
            {!isLastChild && (
                <div
                    className={cn(
                        "-mb-2 overflow-hidden transition-[max-height] duration-400",
                        showDetails ? "max-h-4" : "max-h-0"
                    )}
                >
                    <span className="block py-2" />
                </div>
            )}
        </>
    );
};

export default MessageBoxComponent;
