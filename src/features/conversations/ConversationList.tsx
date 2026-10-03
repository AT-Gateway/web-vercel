"use client";

import React, { useMemo, useState } from "react";
import {
    Ban,
    ListFilter,
    MessageCircle,
    MessagesSquare,
    Settings,
    SquarePen,
    UserRound,
    UserRoundX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassGroup, IconButton, Button } from "@/components/ios/Button";
import { LargeTitle, NavBar } from "@/components/ios/NavBar";
import { SearchField } from "@/components/ios/SearchField";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { Menu } from "@/components/ios/Menu";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useApp } from "@/features/app/AppProvider";
import {
    ConversationRow,
    ConversationRowSkeleton,
} from "@/features/conversations/ConversationRow";
import { SearchResults } from "@/features/conversations/SearchResults";

type Filter = "all" | "known" | "unknown" | "unread" | "blocked";

const FILTER_TITLES: Record<Filter, string> = {
    all: "Messages",
    known: "Known Senders",
    unknown: "Unknown Senders",
    unread: "Unread Messages",
    blocked: "Blocked",
};

export function ConversationList({
    onOpenSettings,
    onCompose,
    sidebar = false,
}: {
    onOpenSettings: () => void;
    onCompose: () => void;
    /** Rendered as the split-view sidebar (regular width). */
    sidebar?: boolean;
}) {
    const {
        session,
        conversations,
        conversationsLoaded,
        activeThreadId,
        openThread,
        blockThread,
        unblockThread,
        deleteThread,
        markUnread,
        markRead,
        unreadTotal,
    } = useApp();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [scrolled, setScrolled] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [confirmNode, confirm] = useConfirm();

    const visible = useMemo(() => {
        switch (filter) {
            case "known":
                return conversations.filter((c) => c.peerName && !c.blocked);
            case "unknown":
                return conversations.filter((c) => !c.peerName && !c.blocked);
            case "unread":
                return conversations.filter((c) => c.unreadCount > 0 && !c.blocked);
            case "blocked":
                return conversations.filter((c) => c.blocked);
            default:
                return conversations;
        }
    }, [conversations, filter]);

    const searching = query.trim().length > 0;

    const askDelete = async (threadId: string, name: string) => {
        const ok = await confirm({
            title: `Delete conversation with ${name}?`,
            message:
                "All messages in this conversation will be permanently deleted from the gateway.",
            confirmLabel: "Delete",
        });
        if (ok) await deleteThread(threadId);
    };

    const askBlock = async (
        threadId: string,
        peer: string,
        name: string,
        blocked: boolean
    ) => {
        if (blocked) {
            await unblockThread(threadId);
            return;
        }
        const ok = await confirm({
            title: `Block ${name}?`,
            message: "New messages from this number won't be saved or forwarded.",
            confirmLabel: "Block Contact",
        });
        if (ok) await blockThread(threadId, peer);
    };

    const filterMenu = (
        <Menu
            label="Filter conversations"
            sections={[
                [
                    {
                        label: "All Messages",
                        icon: <MessagesSquare />,
                        checked: filter === "all",
                        onSelect: () => setFilter("all"),
                    },
                    {
                        label: "Known Senders",
                        icon: <UserRound />,
                        checked: filter === "known",
                        onSelect: () => setFilter("known"),
                    },
                    {
                        label: "Unknown Senders",
                        icon: <UserRoundX />,
                        checked: filter === "unknown",
                        onSelect: () => setFilter("unknown"),
                    },
                    {
                        label: "Unread Messages",
                        icon: <MessageCircle />,
                        checked: filter === "unread",
                        onSelect: () => setFilter("unread"),
                    },
                ],
                [
                    {
                        label: "Blocked",
                        icon: <Ban />,
                        checked: filter === "blocked",
                        onSelect: () => setFilter("blocked"),
                    },
                ],
            ]}
            trigger={
                <IconButton
                    label="Filter"
                    icon={<ListFilter strokeWidth={2.2} />}
                    variant="plain"
                    className={cn(filter !== "all" && "text-tint")}
                />
            }
        />
    );

    return (
        <div
            className="relative flex h-full min-h-0 flex-col bg-[var(--list-bg)]"
            style={
                {
                    "--list-bg": sidebar ? "var(--sys-bg-2)" : "var(--sys-bg)",
                } as React.CSSProperties
            }
        >
            <NavBar
                edgeColor="var(--list-bg)"
                title={FILTER_TITLES[filter]}
                showTitle={showTitle}
                scrolled={scrolled}
                leading={
                    <IconButton
                        label="Settings"
                        icon={<Settings strokeWidth={2} />}
                        onClick={onOpenSettings}
                    />
                }
                trailing={
                    <GlassGroup>
                        {filterMenu}
                        <IconButton
                            label="New Message"
                            icon={<SquarePen strokeWidth={2} />}
                            variant="plain"
                            onClick={onCompose}
                        />
                    </GlassGroup>
                }
            />

            <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-[calc(60px+var(--safe-top))] pb-[calc(24px+var(--safe-bottom))]"
                onScroll={(e) => {
                    const y = e.currentTarget.scrollTop;
                    setScrolled(y > 4);
                    setShowTitle(y > 44);
                }}
            >
                <LargeTitle
                    subtitle={
                        session?.demo ? (
                            <span className="inline-flex items-center gap-1.5">
                                <span className="bg-green/15 text-caption-1 text-green rounded-full px-2 py-px font-semibold">
                                    Demo
                                </span>
                                {unreadTotal > 0
                                    ? `${unreadTotal} unread`
                                    : "Sample conversations"}
                            </span>
                        ) : unreadTotal > 0 ? (
                            `${unreadTotal} unread`
                        ) : null
                    }
                >
                    {FILTER_TITLES[filter]}
                </LargeTitle>

                <SearchField
                    className="px-4 pt-1 pb-3"
                    value={query}
                    onChange={setQuery}
                    placeholder="Search"
                />

                {searching ? (
                    <SearchResults query={query} conversations={conversations} />
                ) : !conversationsLoaded ? (
                    <div role="status" aria-label="Loading conversations">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <ConversationRowSkeleton key={i} />
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    filter === "all" ? (
                        <ContentUnavailable
                            className="pt-20"
                            icon={<MessagesSquare />}
                            title="No Messages"
                            description="Messages your Android gateway receives will appear here."
                            actions={
                                <Button
                                    variant="tinted"
                                    icon={<SquarePen className="size-[18px]" />}
                                    onClick={onCompose}
                                >
                                    New Message
                                </Button>
                            }
                        />
                    ) : (
                        <ContentUnavailable
                            className="pt-20"
                            icon={filter === "blocked" ? <Ban /> : <ListFilter />}
                            title={`No ${FILTER_TITLES[filter]}`}
                            actions={
                                <Button variant="gray" onClick={() => setFilter("all")}>
                                    Show All Messages
                                </Button>
                            }
                        />
                    )
                ) : (
                    <ul aria-label="Conversations" className="md:space-y-0.5">
                        {visible.map((c) => {
                            const name = c.peerName || c.peer;
                            return (
                                <li key={c.threadId} className="group/item">
                                    <ConversationRow
                                        conversation={c}
                                        selected={c.threadId === activeThreadId}
                                        onOpen={() =>
                                            openThread({
                                                threadId: c.threadId,
                                                peer: c.peer,
                                            })
                                        }
                                        onToggleRead={() =>
                                            c.unreadCount > 0
                                                ? markRead(c.threadId)
                                                : markUnread(c.threadId)
                                        }
                                        onBlockToggle={() =>
                                            askBlock(
                                                c.threadId,
                                                c.peer,
                                                name,
                                                Boolean(c.blocked)
                                            )
                                        }
                                        onDelete={() => askDelete(c.threadId, name)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {confirmNode}
        </div>
    );
}
