"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Ban,
    BellRing,
    ListFilter,
    MessageCircle,
    MessagesSquare,
    Settings,
    Share,
    SquarePen,
    UserRound,
    UserRoundX,
    WifiOff,
    X,
} from "lucide-react";
import type { Conversation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isIOS, isStandalone } from "@/lib/device";
import { enablePush, prefetchVapidKey, pushSupport } from "@/lib/push";
import { loadFlag, saveFlag } from "@/lib/storage";
import { GlassGroup, IconButton, Button } from "@/components/ios/Button";
import { LargeTitle, NavBar } from "@/components/ios/NavBar";
import { SearchField } from "@/components/ios/SearchField";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { Menu } from "@/components/ios/Menu";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useToast } from "@/components/ios/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import {
    blurActiveField,
    useDismissKeyboardOnDrag,
} from "@/hooks/useDismissKeyboardOnDrag";
import { useIsShort } from "@/hooks/useMediaQuery";
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

/** The gateway counts as offline after this long without polling. */
const GATEWAY_OFFLINE_MS = 30 * 60_000;
const PUSH_PROMPT_FLAG = "pushPromptDismissed";

type PushPrompt = "enable" | "install" | null;

/** "45 min", "3 hours", "2 days". */
function formatIdle(ms: number): string {
    const min = Math.max(1, Math.round(ms / 60_000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"}`;
    const d = Math.floor(h / 24);
    return `${d} ${d === 1 ? "day" : "days"}`;
}

export const ConversationList = memo(function ConversationList({
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
        conversationsError,
        refreshConversations,
        refreshBlocked,
        activeThreadId,
        openThread,
        blockThread,
        unblockThread,
        deleteThread,
        markUnread,
        markRead,
        unreadTotal,
        connection,
        gatewayIdleMs,
        signOut,
    } = useApp();
    const toast = useToast();
    const isShort = useIsShort();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [scrolled, setScrolled] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [pushPrompt, setPushPrompt] = useState<PushPrompt>(null);
    const [confirmNode, confirm] = useConfirm();
    const titleRef = useRef<HTMLHeadingElement>(null);
    const lastOpened = useRef<string | null>(null);
    const dragDismiss = useDismissKeyboardOnDrag({ direction: "any" });

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

    // Android Back leaves search mode (focused or not) — but only while the list
    // is visible: in compact layout it stays mounted under an open thread, where
    // Back must pop the thread instead.
    useBackDismiss(searching && (sidebar || !activeThreadId), () => {
        setQuery("");
        blurActiveField();
    });

    // Row actions: one stable function each, shared by every (memoized) row.
    const onOpen = useCallback(
        (c: Conversation) => openThread({ threadId: c.threadId, peer: c.peer }),
        [openThread]
    );

    const onToggleRead = useCallback(
        (c: Conversation) =>
            c.unreadCount > 0 ? markRead(c.threadId) : markUnread(c.threadId),
        [markRead, markUnread]
    );

    const onBlockToggle = useCallback(
        async (c: Conversation) => {
            if (c.blocked) {
                await unblockThread(c.threadId);
                return;
            }
            const ok = await confirm({
                title: `Block ${c.peerName || c.peer}?`,
                message: "New messages from this number won't be saved or forwarded.",
                confirmLabel: "Block Contact",
            });
            if (ok) await blockThread(c.threadId, c.peer);
        },
        [blockThread, unblockThread, confirm]
    );

    const onDelete = useCallback(
        async (c: Conversation) => {
            const ok = await confirm({
                title: `Delete conversation with ${c.peerName || c.peer}?`,
                message:
                    "All messages in this conversation will be permanently deleted from the gateway.",
                confirmLabel: "Delete",
            });
            if (ok) await deleteThread(c.threadId);
        },
        [deleteThread, confirm]
    );

    const leaveDemo = async () => {
        const ok = await confirm({
            title: "Leave the Demo?",
            message: "Go back to the pairing screen to connect your Android gateway.",
            confirmLabel: "Connect Your Gateway",
            destructive: false,
        });
        if (ok) signOut();
    };

    const retryLoad = () => {
        void refreshConversations();
        void refreshBlocked();
    };

    // After a thread closes, return focus to the row it was opened from
    // (once the pop transition is done and the list is no longer inert).
    useEffect(() => {
        if (activeThreadId) {
            lastOpened.current = activeThreadId;
            return;
        }
        const tid = lastOpened.current;
        if (!tid) return;
        const t = window.setTimeout(() => {
            const active = document.activeElement;
            if (active && active !== document.body) return;
            document
                .querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(tid)}"]`)
                ?.focus({ preventScroll: true });
        }, 450);
        return () => window.clearTimeout(t);
    }, [activeThreadId]);

    // Inline notification prompt / iPhone install hint.
    const demo = Boolean(session?.demo);
    useEffect(() => {
        if (demo || !conversationsLoaded || loadFlag(PUSH_PROMPT_FLAG)) {
            setPushPrompt(null);
            return;
        }
        if (pushSupport().supported && Notification.permission === "default") {
            setPushPrompt("enable");
            // Have the VAPID key ready so the tap goes straight to the prompt.
            void prefetchVapidKey();
        } else if (isIOS() && !isStandalone()) {
            setPushPrompt("install");
        } else {
            setPushPrompt(null);
        }
    }, [demo, conversationsLoaded]);

    const dismissPushPrompt = () => {
        saveFlag(PUSH_PROMPT_FLAG, true);
        setPushPrompt(null);
    };

    const turnOnPush = async () => {
        if (!session) return;
        try {
            // First await in the tap handler: the permission prompt needs the gesture.
            await enablePush(session.pairToken);
            setPushPrompt(null);
            toast({ title: "Notifications On", tone: "success" });
        } catch (e) {
            if (
                typeof Notification !== "undefined" &&
                Notification.permission !== "default"
            ) {
                setPushPrompt(null);
            }
            toast({
                title: "Couldn't Turn On Notifications",
                body: e instanceof Error ? e.message : undefined,
                tone: "error",
            });
        }
    };

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const y = el.scrollTop;
        setScrolled(y > 4);
        // Show the inline title once the large title has passed under the bar.
        const h1 = titleRef.current;
        if (h1 && h1.offsetHeight) {
            const r = h1.getBoundingClientRect();
            const barBottom =
                el.getBoundingClientRect().top +
                (parseFloat(getComputedStyle(el).paddingTop) || 0);
            setShowTitle(r.bottom <= barBottom + 1);
        } else {
            setShowTitle(y > 44);
        }
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

    // Subtitle status, most important first.
    const status: React.ReactNode =
        connection === "offline" ? (
            <span className="inline-flex items-center gap-1">
                <WifiOff aria-hidden className="size-3.5" /> Waiting for Network
            </span>
        ) : !demo && gatewayIdleMs != null && gatewayIdleMs >= GATEWAY_OFFLINE_MS ? (
            <span className="text-orange">
                Gateway offline · last seen {formatIdle(gatewayIdleMs)} ago
            </span>
        ) : unreadTotal > 0 ? (
            `${unreadTotal} unread`
        ) : demo ? (
            "Sample conversations"
        ) : null;

    const subtitle = demo ? (
        <span className="inline-flex items-center gap-1.5">
            <button
                type="button"
                onClick={leaveDemo}
                aria-label="Demo mode. Leave the demo"
                className={cn(
                    "tap bg-green/15 text-caption-1 text-green relative rounded-full px-2 py-px font-semibold active:opacity-60",
                    // 44pt hit area around the small chip.
                    "before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
                )}
            >
                Demo
            </button>
            {status}
        </span>
    ) : (
        status
    );

    let content: React.ReactNode;
    if (searching) {
        content = <SearchResults query={query} conversations={conversations} />;
    } else if (visible.length === 0 && conversationsError) {
        content = (
            <ContentUnavailable
                className="pt-20"
                icon={<WifiOff />}
                title="Can't Load Messages"
                description="Check your connection."
                actions={
                    <Button variant="gray" onClick={retryLoad}>
                        Try Again
                    </Button>
                }
            />
        );
    } else if (!conversationsLoaded) {
        content = (
            <div role="status" aria-label="Loading conversations">
                {Array.from({ length: 9 }).map((_, i) => (
                    <ConversationRowSkeleton key={i} />
                ))}
            </div>
        );
    } else if (visible.length === 0) {
        content =
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
            );
    } else {
        content = (
            <ul aria-label="Conversations" className="split:space-y-0.5">
                {visible.map((c) => (
                    <li
                        key={c.threadId}
                        // Offscreen rows skip layout and paint.
                        className="group/item [contain-intrinsic-size:auto_84px] [content-visibility:auto]"
                    >
                        <ConversationRow
                            conversation={c}
                            selected={c.threadId === activeThreadId}
                            onOpen={onOpen}
                            onToggleRead={onToggleRead}
                            onBlockToggle={onBlockToggle}
                            onDelete={onDelete}
                        />
                    </li>
                ))}
            </ul>
        );
    }

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
                title={FILTER_TITLES[filter]}
                showTitle={showTitle || isShort}
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
                onScroll={onScroll}
                {...(searching ? dragDismiss : null)}
            >
                <LargeTitle
                    titleRef={titleRef}
                    className="short:hidden"
                    subtitle={subtitle}
                >
                    {FILTER_TITLES[filter]}
                </LargeTitle>

                <SearchField
                    className="px-4 pt-1 pb-3"
                    value={query}
                    onChange={setQuery}
                    placeholder="Search"
                />

                {!searching && pushPrompt ? (
                    <div
                        role="note"
                        className={cn(
                            "relative mx-4 mb-3 flex items-start gap-3 rounded-[22px] p-4 pr-12",
                            sidebar ? "bg-cell" : "bg-bg-2"
                        )}
                    >
                        <span
                            aria-hidden
                            className="text-tint mt-0.5 shrink-0 [&_svg]:size-[22px]"
                        >
                            {pushPrompt === "enable" ? <BellRing /> : <Share />}
                        </span>
                        {pushPrompt === "enable" ? (
                            <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
                                <p className="text-subhead">
                                    Get notified when texts arrive.
                                </p>
                                <Button size="sm" onClick={turnOnPush}>
                                    Turn On
                                </Button>
                            </div>
                        ) : (
                            <p className="text-subhead min-w-0 flex-1">
                                Add to Home Screen for notifications: tap Share › Add to
                                Home Screen.
                            </p>
                        )}
                        <IconButton
                            label="Dismiss"
                            size="sm"
                            variant="plain"
                            tone="label"
                            icon={<X strokeWidth={2.4} />}
                            onClick={dismissPushPrompt}
                            className="text-label-2 absolute top-2 right-2"
                        />
                    </div>
                ) : null}

                {content}
            </div>
            {confirmNode}
        </div>
    );
});
