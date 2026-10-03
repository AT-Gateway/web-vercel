"use client";

import React, { memo, useState } from "react";
import { Check, CircleAlert, Copy, KeyRound, RotateCw } from "lucide-react";
import type { Message } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useContextMenu } from "@/components/ios/Menu";
import { useToast } from "@/components/ios/Toast";
import {
    extractCode,
    isJumboEmoji,
    linkify,
    statusText,
} from "@/features/thread/grouping";

/** iMessage-style tail. Drawn at the bubble's bottom corner in the bubble's color. */
function Tail({ out }: { out: boolean }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 14 21"
            className={cn(
                "pointer-events-none absolute bottom-0 h-[21px] w-[14px]",
                out ? "-right-[8px]" : "-left-[8px] -scale-x-100"
            )}
        >
            <path
                d="M0 0H6V8C6 14 8.5 18.5 14 21C9 21.6 4.5 20.5 0 17.5Z"
                fill="currentColor"
            />
        </svg>
    );
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }
}

function BubbleBody({
    message: m,
    tail,
    jumbo,
}: {
    message: Message;
    tail: boolean;
    jumbo: boolean;
}) {
    const out = m.direction === "out";
    const failed = m.status === "failed";
    const text = m.bodyIsEncrypted ? "🔒 Encrypted message" : m.body;

    if (jumbo) {
        return (
            <div dir="auto" className="px-1 text-[3rem] leading-[1.15] tracking-normal">
                {text}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "text-body relative w-fit max-w-full rounded-[18px] px-3 py-[7px] break-words whitespace-pre-wrap",
                out
                    ? "bg-bubble-out text-bubble-out-label"
                    : "bg-bubble-in text-bubble-in-label",
                out ? "text-bubble-out" : "text-bubble-in",
                failed && "opacity-70",
                tail && (out ? "rounded-br-[5px]" : "rounded-bl-[5px]")
            )}
        >
            <span
                dir="auto"
                className={cn(
                    "block text-start",
                    out ? "text-bubble-out-label" : "text-bubble-in-label"
                )}
            >
                {linkify(text).map((p, i) =>
                    p.href ? (
                        <a
                            key={i}
                            href={p.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="underline decoration-1 underline-offset-2"
                        >
                            {p.text}
                        </a>
                    ) : (
                        <React.Fragment key={i}>{p.text}</React.Fragment>
                    )
                )}
            </span>
            {tail ? <Tail out={out} /> : null}
        </div>
    );
}

export const MessageBubble = memo(function MessageBubble({
    message: m,
    first,
    last,
    showStatus,
    revealOffset,
    onRetry,
    animate,
}: {
    message: Message;
    first: boolean;
    last: boolean;
    showStatus: boolean;
    /** Horizontal drag distance for the swipe-to-reveal timestamps gesture. */
    revealOffset: number;
    onRetry: (m: Message) => void;
    animate: boolean;
}) {
    const toast = useToast();
    const out = m.direction === "out";
    const failed = m.status === "failed";
    const jumbo = !m.bodyIsEncrypted && isJumboEmoji(m.body);
    const code = !out ? extractCode(m.body) : null;
    // Only outgoing messages show a SIM: the one the user chose to send from.
    const sim = !out
        ? null
        : m.simSlotIndex === 1
          ? "SIM 2"
          : m.simSlotIndex === 0
            ? "SIM 1"
            : null;
    const status = statusText(m);

    const menu = useContextMenu({
        label: "Message actions",
        align: out ? "end" : "start",
        title: [formatDateTime(m.ts), sim, out ? status : null]
            .filter(Boolean)
            .join(" · "),
        renderPreview: () => (
            <div
                className={cn(
                    "flex h-full items-end",
                    out ? "justify-end" : "justify-start"
                )}
            >
                <div className="max-w-full drop-shadow-[0_10px_30px_rgb(0_0_0/0.18)]">
                    <BubbleBody message={m} tail={false} jumbo={jumbo} />
                </div>
            </div>
        ),
        sections: [
            [
                ...(code
                    ? [
                          {
                              label: `Copy Code ${code}`,
                              icon: <KeyRound />,
                              keyAction: true,
                              onSelect: () => {
                                  void copyText(code);
                                  toast({
                                      title: "Code Copied",
                                      tone: "success" as const,
                                  });
                              },
                          },
                      ]
                    : []),
                {
                    label: "Copy",
                    icon: <Copy />,
                    onSelect: () => {
                        void copyText(m.body);
                        toast({ title: "Copied", tone: "success" });
                    },
                },
                ...(failed
                    ? [
                          {
                              label: "Try Again",
                              icon: <RotateCw />,
                              keyAction: true,
                              onSelect: () => onRetry(m),
                          },
                      ]
                    : []),
            ],
        ],
    });

    return (
        <div
            className={cn(
                "relative flex px-4",
                out ? "justify-end" : "justify-start",
                first ? "mt-2.5" : "mt-[2px]",
                animate && "animate-bubble-in",
                out ? "origin-bottom-right" : "origin-bottom-left"
            )}
        >
            <div
                className={cn(
                    "flex max-w-[78%] flex-col md:max-w-[min(70%,560px)]",
                    out ? "items-end" : "items-start"
                )}
                style={{
                    transform:
                        out && revealOffset
                            ? `translate3d(${-revealOffset}px,0,0)`
                            : undefined,
                    transition: revealOffset
                        ? "none"
                        : "transform 300ms var(--motion-ios)",
                }}
            >
                <div className="flex items-center gap-2">
                    <div
                        {...menu.triggerProps}
                        tabIndex={0}
                        role="article"
                        aria-label={`${out ? "You" : m.peerName || m.peer}, ${formatTime(m.ts)}${
                            out ? `, ${status}` : ""
                        }: ${m.body}`}
                        title={formatDateTime(m.ts)}
                        className={cn(
                            "rounded-[18px] outline-offset-2 select-none [-webkit-touch-callout:none]",
                            menu.isOpen && "opacity-0"
                        )}
                    >
                        <BubbleBody message={m} tail={last} jumbo={jumbo} />
                    </div>
                    {failed ? (
                        <button
                            type="button"
                            aria-label="Not delivered. Try again"
                            onClick={() => onRetry(m)}
                            className="tap text-red -mr-2 flex size-11 shrink-0 items-center justify-center"
                        >
                            <CircleAlert
                                className="fill-red size-[22px] text-white"
                                strokeWidth={2.2}
                            />
                        </button>
                    ) : null}
                </div>
                {code ? <CodeChip code={code} /> : null}
                {showStatus && out ? (
                    <div
                        className={cn(
                            "text-caption-1 mt-1 px-1 font-medium",
                            failed ? "text-red" : "text-label-2"
                        )}
                    >
                        {failed ? (
                            <button
                                type="button"
                                onClick={() => onRetry(m)}
                                className="tap underline-offset-2 hover:underline"
                            >
                                Not Delivered · Try Again
                            </button>
                        ) : (
                            <>
                                {status}
                                {sim ? (
                                    <span className="text-label-3"> · {sim}</span>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}
            </div>

            {/*/!* Revealed by dragging the thread left, like iOS Messages. *!/*/}
            {/*<span*/}
            {/*    aria-hidden*/}
            {/*    className="text-caption-1 text-label-2 pointer-events-none absolute top-1/2 right-0 w-[68px] -translate-y-1/2 pr-4 text-right tabular-nums"*/}
            {/*    style={{*/}
            {/*        transform: `translate3d(${68 - revealOffset}px,-50%,0)`,*/}
            {/*        transition: revealOffset*/}
            {/*            ? "none"*/}
            {/*            : "transform 300ms var(--motion-ios)",*/}
            {/*    }}*/}
            {/*>*/}
            {/*    {formatTime(m.ts)}*/}
            {/*</span>*/}
            {menu.node}
        </div>
    );
});

/** One-tap "Copy 482913" button under messages that carry a verification code. */
function CodeChip({ code }: { code: string }) {
    const toast = useToast();
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            aria-label={copied ? `Code ${code} copied` : `Copy code ${code}`}
            onClick={async (e) => {
                e.stopPropagation();
                await copyText(code);
                setCopied(true);
                toast({ title: "Code Copied", body: code, tone: "success" });
                window.setTimeout(() => setCopied(false), 1800);
            }}
            className={cn(
                "tap mt-1.5 ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5",
                "text-subhead font-semibold transition-colors duration-200 active:scale-[0.97]",
                copied ? "bg-green/15 text-green" : "bg-tint/12 text-tint"
            )}
        >
            {copied ? (
                <Check className="size-4" strokeWidth={2.6} />
            ) : (
                <KeyRound className="size-4" strokeWidth={2.2} />
            )}
            <span className="tabular-nums">{copied ? "Copied" : `Copy ${code}`}</span>
        </button>
    );
}
