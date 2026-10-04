"use client";

import React, { memo, useMemo, useRef, useState } from "react";
import {
    Check,
    CircleAlert,
    Copy,
    ExternalLink,
    KeyRound,
    Link2,
    RotateCw,
    Trash2,
} from "lucide-react";
import type { Message } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { hasArabicScript } from "@/lib/text";
import { cn } from "@/lib/utils";
import type { MenuItem, MenuSections } from "@/components/ios/Menu";
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

/** Incoming messages from numbers that aren't saved contacts. */
function fromUnknownSender(m: Message): boolean {
    return m.direction === "in" && !m.peerName;
}

function BubbleBody({
    message: m,
    tail,
    jumbo,
    onLinkPress,
}: {
    message: Message;
    tail: boolean;
    jumbo: boolean;
    onLinkPress: (href: string, fromUnknown: boolean) => void;
}) {
    const out = m.direction === "out";
    const failed = m.status === "failed";
    const text = m.bodyIsEncrypted ? "🔒 Encrypted message" : m.body;
    const lang = hasArabicScript(text) ? "fa" : undefined;

    if (jumbo) {
        return (
            <div
                lang={lang}
                className="px-1 text-start text-[3rem] leading-[1.15] tracking-normal [unicode-bidi:plaintext]"
            >
                {text}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "text-body relative w-fit max-w-full rounded-[18px] px-3 py-[7px] wrap-anywhere whitespace-pre-wrap",
                out
                    ? "bg-bubble-out text-bubble-out-label"
                    : "bg-bubble-in text-bubble-in-label",
                out ? "text-bubble-out" : "text-bubble-in",
                failed && "opacity-70",
                tail && (out ? "rounded-br-[5px]" : "rounded-bl-[5px]")
            )}
        >
            {/* plaintext bidi: every line picks its own direction and alignment. */}
            <span
                lang={lang}
                className={cn(
                    "block text-start [unicode-bidi:plaintext]",
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
                            onClick={(e) => {
                                e.stopPropagation();
                                if (fromUnknownSender(m)) {
                                    e.preventDefault();
                                    onLinkPress(p.href!, true);
                                }
                            }}
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
    gatewayStale,
    animate,
    onRetry,
    onDiscard,
    onLinkPress,
    onCopyCode,
}: {
    message: Message;
    first: boolean;
    last: boolean;
    showStatus: boolean;
    /** The gateway hasn't polled for a while: queued rows read "Waiting for Phone…". */
    gatewayStale: boolean;
    animate: boolean;
    onRetry: (m: Message, opts?: { slot?: 0 | 1 }) => void;
    onDiscard: (m: Message) => void;
    onLinkPress: (href: string, fromUnknown: boolean) => void;
    /** Copies a verification code (with its own toast). */
    onCopyCode: (code: string) => void;
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
    const status = statusText(m, gatewayStale);
    const links = useMemo(
        () => (m.bodyIsEncrypted ? [] : linkify(m.body).filter((p) => p.href)),
        [m.body, m.bodyIsEncrypted]
    );
    // The link under the finger when the long-press started, if any.
    const pressedHref = useRef<string | null>(null);

    const sections: MenuSections = [];
    if (failed) {
        const retry: MenuItem[] = [
            {
                label: "Try Again",
                icon: <RotateCw />,
                keyAction: true,
                onSelect: () => onRetry(m),
            },
        ];
        // A failure the phone reported: offer the other SIM too. Local (upload)
        // failures resend unchanged, since the original may already be queued.
        if (!m.local) {
            const other: 0 | 1 = m.simSlotIndex === 1 ? 0 : 1;
            retry.push({
                label: `Try Again from SIM ${other + 1}`,
                icon: <RotateCw />,
                onSelect: () => onRetry(m, { slot: other }),
            });
        }
        sections.push(retry);
    }
    sections.push([
        ...(code
            ? [
                  {
                      label: `Copy Code ${code}`,
                      icon: <KeyRound />,
                      keyAction: true,
                      onSelect: () => onCopyCode(code),
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
    ]);
    if (links.length) {
        const pressed = pressedHref.current;
        const href =
            (pressed && links.find((l) => l.href === pressed)?.href) || links[0].href!;
        sections.push([
            {
                label: "Open Link",
                icon: <ExternalLink />,
                keyAction: true,
                onSelect: () => onLinkPress(href, fromUnknownSender(m)),
            },
            {
                label: "Copy Link",
                icon: <Link2 />,
                onSelect: () => {
                    void copyText(href);
                    toast({ title: "Link Copied", tone: "success" });
                },
            },
        ]);
    }
    if (failed || m.waiting) {
        sections.push([
            {
                label: "Delete",
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => onDiscard(m),
            },
        ]);
    }

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
                    <BubbleBody
                        message={m}
                        tail={false}
                        jumbo={jumbo}
                        onLinkPress={onLinkPress}
                    />
                </div>
            </div>
        ),
        sections,
    });

    const triggerProps = {
        ...menu.triggerProps,
        onPointerDown: (e: React.PointerEvent) => {
            pressedHref.current =
                (e.target as Element).closest("a")?.getAttribute("href") ?? null;
            menu.triggerProps.onPointerDown(e);
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            pressedHref.current = null;
            menu.triggerProps.onKeyDown(e);
        },
    };

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
                    "split:max-w-[min(70%,560px)] flex max-w-[78%] flex-col",
                    out ? "items-end" : "items-start"
                )}
            >
                <div className="flex max-w-full min-w-0 items-center gap-2">
                    <div
                        {...triggerProps}
                        tabIndex={0}
                        role="article"
                        aria-label={`${out ? "You" : m.peerName || m.peer}, ${formatTime(m.ts)}${
                            out ? `, ${status}` : ""
                        }: ${m.body}`}
                        title={formatDateTime(m.ts)}
                        className={cn(
                            "min-w-0 rounded-[18px] outline-offset-2 select-none [-webkit-touch-callout:none]",
                            menu.isOpen && "opacity-0"
                        )}
                    >
                        <BubbleBody
                            message={m}
                            tail={last}
                            jumbo={jumbo}
                            onLinkPress={onLinkPress}
                        />
                    </div>
                    {failed ? (
                        <button
                            type="button"
                            aria-label="Not delivered. Message options"
                            aria-haspopup="menu"
                            onClick={menu.open}
                            className="tap text-red -mr-2 flex size-11 shrink-0 items-center justify-center"
                        >
                            <CircleAlert
                                className="fill-red size-[22px] text-white"
                                strokeWidth={2.2}
                            />
                        </button>
                    ) : null}
                </div>
                {code ? <CodeChip code={code} onCopy={onCopyCode} /> : null}
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
                                aria-haspopup="menu"
                                onClick={menu.open}
                                className="tap underline-offset-2 hover:underline"
                            >
                                Not Delivered
                            </button>
                        ) : (
                            <>
                                {status}
                                {sim ? (
                                    <span className="text-label-2"> · {sim}</span>
                                ) : null}
                            </>
                        )}
                    </div>
                ) : null}
            </div>
            {menu.node}
        </div>
    );
});

/** One-tap "Copy 482913" button under messages that carry a verification code. */
function CodeChip({ code, onCopy }: { code: string; onCopy: (code: string) => void }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            aria-label={copied ? `Code ${code} copied` : `Copy code ${code}`}
            onClick={(e) => {
                e.stopPropagation();
                onCopy(code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
            }}
            className={cn(
                "tap relative mt-1.5 ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5",
                // 44pt hit area around the 36pt chip.
                "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
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
