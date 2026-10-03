"use client";

import {
    Ban,
    ChevronRight,
    Hand,
    MessageCircle,
    MessageCircleOff,
    Trash2,
} from "lucide-react";
import type { Conversation } from "@/lib/api";
import { formatListDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ios/Avatar";
import { SwipeRow } from "@/components/ios/SwipeRow";
import { useContextMenu } from "@/components/ios/Menu";

export function ConversationRow({
    conversation: c,
    selected,
    onOpen,
    onToggleRead,
    onBlockToggle,
    onDelete,
}: {
    conversation: Conversation;
    selected: boolean;
    onOpen: () => void;
    onToggleRead: () => void;
    onBlockToggle: () => void;
    onDelete: () => void;
}) {
    const unread = c.unreadCount > 0 && !c.blocked;
    const name = c.peerName || c.peer;
    const date = formatListDate(c.lastTs);
    const preview = c.lastBodyIsEncrypted
        ? "Encrypted message"
        : c.lastPreview || "No messages";

    const menu = useContextMenu({
        label: `Actions for ${name}`,
        sections: [
            [
                {
                    label: unread ? "Mark as Read" : "Mark as Unread",
                    icon: unread ? <MessageCircle /> : <MessageCircleOff />,
                    onSelect: onToggleRead,
                },
                {
                    label: c.blocked ? "Unblock Contact" : "Block Contact",
                    icon: <Hand />,
                    onSelect: onBlockToggle,
                },
            ],
            [
                {
                    label: "Delete",
                    icon: <Trash2 />,
                    keyAction: true,
                    destructive: true,
                    onSelect: onDelete,
                },
            ],
        ],
    });

    return (
        <>
            <SwipeRow
                className="bg-[var(--list-bg,var(--sys-bg))]"
                leading={[
                    {
                        label: unread ? "Read" : "Unread",
                        icon: unread ? <MessageCircle /> : <MessageCircleOff />,
                        tone: "blue",
                        onAction: onToggleRead,
                    },
                ]}
                trailing={[
                    {
                        label: "Delete",
                        icon: <Trash2 />,
                        tone: "red",
                        onAction: onDelete,
                    },
                    {
                        label: c.blocked ? "Unblock" : "Block",
                        icon: <Hand />,
                        tone: "orange",
                        onAction: onBlockToggle,
                    },
                ]}
            >
                <button
                    type="button"
                    {...menu.triggerProps}
                    onClick={onOpen}
                    aria-current={selected ? "page" : undefined}
                    aria-label={[
                        name,
                        unread ? `${c.unreadCount} unread` : null,
                        c.blocked ? "blocked" : null,
                        date,
                        preview,
                    ]
                        .filter(Boolean)
                        .join(", ")}
                    className={cn(
                        "tap group/conv relative flex w-full items-center text-left [-webkit-touch-callout:none]",
                        "transition-colors duration-150",
                        selected
                            ? "md:bg-tint md:rounded-[18px] md:text-white"
                            : "active:bg-fill-4 md:hover:bg-fill-4",
                        "md:mx-2 md:w-[calc(100%-16px)] md:rounded-[18px]"
                    )}
                >
                    {/* Unread indicator gutter */}
                    <span
                        aria-hidden
                        className="flex w-6 shrink-0 justify-center self-stretch pt-[30px] md:w-5"
                    >
                        {unread ? (
                            <span
                                className={cn(
                                    "bg-tint size-[10px] rounded-full",
                                    selected && "md:bg-white"
                                )}
                            />
                        ) : null}
                    </span>

                    <Avatar name={c.peerName} size={44} className="my-[10px]" />

                    <span
                        className={cn(
                            "ml-3 flex min-w-0 flex-1 flex-col py-[10px] pr-4",
                            // Hairline separator from the text edge to the trailing edge.
                            "border-separator border-b-[0.5px]",
                            "group-last/item:border-b-0",
                            selected && "md:border-transparent"
                        )}
                    >
                        <span className="flex items-baseline gap-2">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span className="text-headline truncate" dir="auto">
                                    {name}
                                </span>
                                {c.blocked ? (
                                    <Ban
                                        aria-hidden
                                        className={cn(
                                            "text-label-2 size-[14px] shrink-0",
                                            selected && "md:text-white/80"
                                        )}
                                        strokeWidth={2.4}
                                    />
                                ) : null}
                            </span>
                            <span
                                className={cn(
                                    "text-subhead text-label-2 flex shrink-0 items-center gap-0.5",
                                    selected && "md:text-white/80"
                                )}
                            >
                                {date}
                                <ChevronRight
                                    aria-hidden
                                    className="text-label-3 size-[15px] md:hidden"
                                    strokeWidth={2.6}
                                />
                            </span>
                        </span>
                        <span
                            dir="auto"
                            className={cn(
                                "text-subhead text-label-2 mt-0.5 line-clamp-2 min-h-[2lh] text-start",
                                selected && "md:text-white/85"
                            )}
                        >
                            {preview}
                        </span>
                    </span>
                </button>
            </SwipeRow>
            {menu.node}
        </>
    );
}

export function ConversationRowSkeleton() {
    return (
        <div aria-hidden className="flex items-center pl-6 md:pl-7">
            <span className="bg-fill-3 my-[10px] size-11 shrink-0 animate-pulse rounded-full" />
            <span className="border-separator ml-3 flex flex-1 flex-col gap-2 border-b-[0.5px] py-4 pr-4">
                <span className="flex justify-between">
                    <span className="bg-fill-3 h-3.5 w-32 animate-pulse rounded-full" />
                    <span className="bg-fill-4 h-3 w-12 animate-pulse rounded-full" />
                </span>
                <span className="bg-fill-4 h-3 w-full animate-pulse rounded-full" />
                <span className="bg-fill-4 h-3 w-2/3 animate-pulse rounded-full" />
            </span>
        </div>
    );
}
