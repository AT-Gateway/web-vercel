"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatThreadTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ios/Avatar";
import { NavBar } from "@/components/ios/NavBar";
import { Spinner } from "@/components/ios/Spinner";
import { useApp } from "@/features/app/AppProvider";
import { buildThreadItems } from "@/features/thread/grouping";
import { MessageBubble } from "@/features/thread/MessageBubble";
import { Composer } from "@/features/thread/Composer";

const REVEAL_MAX = 68;
const NEAR_BOTTOM_PX = 140;

export function ThreadView({
    compact,
    onOpenContact,
}: {
    compact: boolean;
    onOpenContact: () => void;
}) {
    const {
        activeThreadId,
        activePeer,
        activeName,
        activeBlocked,
        messagesByThread,
        loadingThreadId,
        closeThread,
        retryMessage,
        unreadTotal,
        conversations,
        simSlot,
    } = useApp();

    const messages = useMemo(
        () => (activeThreadId ? (messagesByThread[activeThreadId] ?? []) : []),
        [activeThreadId, messagesByThread]
    );
    const items = useMemo(() => buildThreadItems(messages), [messages]);
    const title = activeName || activePeer;
    // Spinner only before the first load; background polls refresh silently.
    const loading =
        loadingThreadId === activeThreadId &&
        !(activeThreadId && activeThreadId in messagesByThread);
    const otherUnread =
        unreadTotal -
        (conversations.some((c) => c.threadId === activeThreadId && c.unreadCount > 0)
            ? 1
            : 0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const nearBottom = useRef(true);
    const [newBelow, setNewBelow] = useState(0);
    const [scrolledUnder, setScrolledUnder] = useState(false);
    const seen = useRef<{ thread: string | null; ids: Set<string>; ready: boolean }>({
        thread: null,
        ids: new Set(),
        ready: false,
    });

    // Bubbles that arrive after the thread first renders get the "send" animation.
    const animateIds = useMemo(() => {
        const s = seen.current;
        if (s.thread !== activeThreadId || !s.ready) return new Set<string>();
        return new Set(messages.filter((m) => !s.ids.has(m.id)).map((m) => m.id));
    }, [messages, activeThreadId]);

    useEffect(() => {
        if (seen.current.thread !== activeThreadId) {
            seen.current = { thread: activeThreadId, ids: new Set(), ready: false };
        }
        for (const m of messages) seen.current.ids.add(m.id);
        if (messages.length) seen.current.ready = true;
    }, [messages, activeThreadId]);

    const scrollToBottom = useCallback((smooth: boolean) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        setNewBelow(0);
    }, []);

    // Jump to the latest message when a conversation opens.
    useLayoutEffect(() => {
        nearBottom.current = true;
        setNewBelow(0);
        scrollToBottom(false);
    }, [activeThreadId, scrollToBottom]);

    const lastId = messages[messages.length - 1]?.id;
    const lastIsMine = messages[messages.length - 1]?.direction === "out";
    useLayoutEffect(() => {
        if (!lastId) return;
        if (nearBottom.current || lastIsMine) scrollToBottom(seen.current.ready);
        else setNewBelow((n) => n + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastId]);

    // ---- swipe left to reveal timestamps ----
    const [reveal, setReveal] = useState(0);
    const drag = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === "mouse") return;
        drag.current = { x: e.clientX, y: e.clientY, axis: null };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.axis) {
            if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.3) d.axis = "x";
            else if (Math.abs(dy) > 10 || dx > 10) d.axis = "y";
            return;
        }
        if (d.axis !== "x") return;
        const pull = Math.max(0, -dx);
        setReveal(pull <= REVEAL_MAX ? pull : REVEAL_MAX + (pull - REVEAL_MAX) * 0.15);
    };
    const endReveal = () => {
        drag.current = null;
        setReveal(0);
    };

    const header = (
        <NavBar
            scrolled={scrolledUnder}
            leading={
                compact ? (
                    <button
                        type="button"
                        onClick={closeThread}
                        aria-label={
                            otherUnread > 0
                                ? `Back to Messages, ${otherUnread} unread`
                                : "Back to Messages"
                        }
                        className="tap glass flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-full px-2.5 transition-transform duration-200 active:scale-[0.92]"
                    >
                        <ChevronLeft className="size-[22px]" strokeWidth={2.4} />
                        {otherUnread > 0 ? (
                            <span className="text-body pr-1 font-semibold tabular-nums">
                                {otherUnread}
                            </span>
                        ) : null}
                    </button>
                ) : null
            }
            center={
                <button
                    type="button"
                    onClick={onOpenContact}
                    aria-label={`${title}, contact details`}
                    className="tap group flex flex-col items-center"
                >
                    <Avatar
                        name={activeName}
                        size={46}
                        className="relative z-10 shadow-[0_2px_8px_rgb(0_0_0/0.12)]"
                    />
                    <span className="glass text-footnote -mt-1.5 flex max-w-[52vw] items-center gap-0.5 rounded-full py-[3px] pr-2 pl-3 font-semibold transition-transform duration-200 group-active:scale-95 md:max-w-xs">
                        <span className="truncate" dir="auto">
                            {title}
                        </span>
                        <ChevronRight
                            className="text-label-2 size-3 shrink-0"
                            strokeWidth={3}
                        />
                    </span>
                </button>
            }
            trailing={null}
        />
    );

    return (
        <section
            aria-label={`Conversation with ${title}`}
            className="bg-bg relative flex h-full min-h-0 flex-col overflow-hidden"
        >
            {header}

            <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    nearBottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
                    if (nearBottom.current && newBelow) setNewBelow(0);
                    setScrolledUnder(el.scrollTop > 4);
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endReveal}
                onPointerCancel={endReveal}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-[calc(100px+var(--safe-top))] pb-[calc(76px+var(--safe-bottom))]"
                style={{ touchAction: "pan-y" }}
            >
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Spinner size={24} />
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-10 text-center">
                        <Avatar name={activeName} size={72} />
                        <h2 className="text-title-3 mt-3 font-semibold" dir="auto">
                            {title}
                        </h2>
                        {activeName ? (
                            <p className="text-subhead text-label-2">{activePeer}</p>
                        ) : null}
                        <p className="text-footnote text-label-2 mt-3">
                            Text messages are sent from{" "}
                            {simSlot === 1 ? "SIM 2" : "SIM 1"} on your Android gateway.
                        </p>
                    </div>
                ) : (
                    <div className="mx-auto max-w-4xl">
                        {items.map((item) => {
                            if (item.kind === "timestamp") {
                                const t = formatThreadTimestamp(item.ts);
                                return (
                                    <div
                                        key={item.key}
                                        className="text-caption-1 text-label-2 mt-4 mb-1 text-center"
                                    >
                                        <span className="font-semibold">{t.day}</span>{" "}
                                        {t.time}
                                    </div>
                                );
                            }
                            return (
                                <MessageBubble
                                    key={item.key}
                                    message={item.message}
                                    first={item.first}
                                    last={item.last}
                                    showStatus={item.showStatus}
                                    revealOffset={reveal}
                                    onRetry={retryMessage}
                                    animate={animateIds.has(item.message.id)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <button
                type="button"
                aria-label={
                    newBelow
                        ? `${newBelow} new message${newBelow > 1 ? "s" : ""}, scroll to bottom`
                        : "Scroll to bottom"
                }
                onClick={() => scrollToBottom(true)}
                className={cn(
                    "tap glass absolute right-4 z-20 flex size-10 items-center justify-center rounded-full",
                    "ease-spring bottom-[calc(76px+var(--safe-bottom))] transition-[transform,opacity] duration-300",
                    newBelow
                        ? "scale-100 opacity-100"
                        : "pointer-events-none scale-75 opacity-0"
                )}
            >
                <ArrowDown className="text-tint size-5" strokeWidth={2.4} />
                {newBelow ? (
                    <span className="bg-tint text-caption-2 absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-bold text-white">
                        {newBelow}
                    </span>
                ) : null}
            </button>

            <Composer autoFocus={!compact && !activeBlocked} />
        </section>
    );
}
