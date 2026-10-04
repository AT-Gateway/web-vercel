"use client";

import { memo } from "react";
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

type RowAction = (c: Conversation) => void;

/**
 * One conversation in the list. Memoized: the callbacks take the conversation,
 * so the list passes the same stable functions to every row and a row only
 * re-renders when its own conversation or selection changes.
 */
export const ConversationRow = memo(function ConversationRow({
    conversation: c,
    selected,
    onOpen,
    onToggleRead,
    onBlockToggle,
    onDelete,
}: {
    conversation: Conversation;
    selected: boolean;
    onOpen: RowAction;
    onToggleRead: RowAction;
    onBlockToggle: RowAction;
    onDelete: RowAction;
}) {
    const unread = c.unreadCount > 0 && !c.blocked;
    const name = c.peerName || c.peer;
    const date = formatListDate(c.lastTs);
    const preview = c.lastBodyIsEncrypted
        ? "Encrypted message"
        : c.lastPreview || "No messages";

    const menu = useContextMenu({
        label: `Actions for ${name}`,
        title: (
            <bdi className="block truncate" dir="auto">
                {name}
            </bdi>
        ),
        renderPreview: () => (
            <div className="bg-cell flex h-full items-center gap-3 rounded-[22px] px-4 shadow-[var(--menu-shadow)]">
                <Avatar name={c.peerName} size={44} />
                <span className="flex min-w-0 flex-col">
                    <span className="text-headline truncate" dir="auto">
                        {name}
                    </span>
                    <span className="text-subhead text-label-2 line-clamp-2 text-left">
                        <bdi>{preview}</bdi>
                    </span>
                </span>
            </div>
        ),
        sections: [
            [
                {
                    label: unread ? "Mark as Read" : "Mark as Unread",
                    icon: unread ? <MessageCircle /> : <MessageCircleOff />,
                    onSelect: () => onToggleRead(c),
                },
                {
                    label: c.blocked ? "Unblock Contact" : "Block Contact",
                    icon: <Hand />,
                    onSelect: () => onBlockToggle(c),
                },
            ],
            [
                {
                    label: "Delete",
                    icon: <Trash2 />,
                    keyAction: true,
                    destructive: true,
                    onSelect: () => onDelete(c),
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
                        onAction: () => onToggleRead(c),
                    },
                ]}
                trailing={[
                    {
                        label: "Delete",
                        icon: <Trash2 />,
                        tone: "red",
                        onAction: () => onDelete(c),
                    },
                    {
                        label: c.blocked ? "Unblock" : "Block",
                        icon: <Hand />,
                        tone: "orange",
                        onAction: () => onBlockToggle(c),
                    },
                ]}
            >
                <button
                    type="button"
                    {...menu.triggerProps}
                    onClick={() => onOpen(c)}
                    data-thread-id={c.threadId}
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
                        selected
                            ? "split:bg-tint split:rounded-[18px] split:text-white"
                            : "cell-press split:hover:bg-fill-4",
                        "split:mx-2 split:w-[calc(100%-16px)] split:rounded-[18px]",
                        // The lifted preview stands in for the row while its menu is open.
                        menu.isOpen && "opacity-0"
                    )}
                >
                    {/* Unread indicator gutter */}
                    <span
                        aria-hidden
                        className="split:w-5 flex w-6 shrink-0 justify-center me-0.5"
                    >
                        {unread ? (
                            <span
                                className={cn(
                                    "bg-tint size-[10px] rounded-full",
                                    selected && "split:bg-white"
                                )}
                            />
                        ) : null}
                    </span>

                    <Avatar name={c.peerName} size={44} className="my-[10px]" />

                    <span
                        className={cn(
                            "ml-3 flex min-w-0 flex-1 flex-col py-[10px] pr-4 gap-0.5",
                            // Hairline separator from the text edge to the trailing edge.
                            "border-separator border-b-[0.5px]",
                            "group-last/item:border-b-0",
                            selected && "split:border-transparent"
                        )}
                    >
                        <span className="flex items-center gap-2">
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span className="text-base font-bold truncate" dir="auto">
                                    {name}
                                </span>
                                {c.blocked ? (
                                    <Ban
                                        aria-hidden
                                        className={cn(
                                            "text-label-2 size-[14px] shrink-0",
                                            selected && "split:text-white/80"
                                        )}
                                        strokeWidth={2.4}
                                    />
                                ) : null}
                            </span>
                            <span
                                className={cn(
                                    "text-xs text-label-2 flex shrink-0 items-center gap-0.5",
                                    selected && "split:text-white/80"
                                )}
                            >
                                {date}
                                <ChevronRight
                                    aria-hidden
                                    className="text-label-3 split:hidden size-[15px]"
                                    strokeWidth={2.6}
                                />
                            </span>
                        </span>
                        {/* Leading-aligned like the name; <bdi> keeps RTL text ordered. */}
                        <span
                            className={cn(
                                "text-sm text-label-2 mt-0.5 line-clamp-2 min-h-[2lh]",
                                selected && "split:text-white/85"
                            )}
                        >
                            <bdi>{preview}</bdi>
                        </span>
                    </span>
                </button>
            </SwipeRow>
            {menu.node}
        </>
    );
});

export function ConversationRowSkeleton() {
    return (
        <div aria-hidden className="split:pl-7 flex items-center pl-6">
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
