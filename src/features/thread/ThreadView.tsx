"use client";

import React, {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { ArrowDown, ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import { formatThreadTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ios/Avatar";
import { Button } from "@/components/ios/Button";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { NavBar } from "@/components/ios/NavBar";
import { Spinner } from "@/components/ios/Spinner";
import {
    blurActiveField,
    useDismissKeyboardOnDrag,
} from "@/hooks/useDismissKeyboardOnDrag";
import { useApp } from "@/features/app/AppProvider";
import { buildThreadItems } from "@/features/thread/grouping";
import { MessageBubble } from "@/features/thread/MessageBubble";
import { Composer } from "@/features/thread/Composer";

const NEAR_BOTTOM_PX = 140;
/** Queued rows read "Waiting for Phone…" once the gateway has been idle this long. */
const GATEWAY_STALE_MS = 2 * 60_000;
/** …and a banner explains it after this long. */
const GATEWAY_BANNER_MS = 10 * 60_000;

function withScheme(href: string): string {
    return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}

export const ThreadView = memo(function ThreadView({
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
        discardMessage,
        copyCode,
        refreshThread,
        threadErrors,
        olderMessages,
        loadOlderMessages,
        gatewayIdleMs,
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
    const loadError = Boolean(activeThreadId && threadErrors[activeThreadId]);
    const older = activeThreadId ? olderMessages[activeThreadId] : undefined;
    const otherUnread =
        unreadTotal -
        (conversations.some((c) => c.threadId === activeThreadId && c.unreadCount > 0)
            ? 1
            : 0);

    const gatewayStale = gatewayIdleMs != null && gatewayIdleMs >= GATEWAY_STALE_MS;
    const hasQueuedOnServer = useMemo(
        () =>
            messages.some(
                (m) => m.direction === "out" && m.status === "queued" && !m.local
            ),
        [messages]
    );
    const showGatewayBanner =
        gatewayIdleMs != null && gatewayIdleMs >= GATEWAY_BANNER_MS && hasQueuedOnServer;

    const sectionRef = useRef<HTMLElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const titleBtnRef = useRef<HTMLButtonElement>(null);
    const nearBottom = useRef(true);
    const prevScroll = useRef<{ h: number; top: number } | null>(null);
    const [newBelow, setNewBelow] = useState(0);
    const [scrolledUnder, setScrolledUnder] = useState(false);
    const seen = useRef<{ thread: string | null; ids: Set<string>; ready: boolean }>({
        thread: null,
        ids: new Set(),
        ready: false,
    });

    // Bubbles that arrive after the thread first renders get the "send" animation.
    // Unseen rows before the first seen one are an earlier page: never animated.
    const animateIds = useMemo(() => {
        const s = seen.current;
        if (s.thread !== activeThreadId || !s.ready) return new Set<string>();
        const firstSeen = messages.findIndex((m) => s.ids.has(m.id));
        return new Set(
            messages.filter((m, i) => i > firstSeen && !s.ids.has(m.id)).map((m) => m.id)
        );
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
        prevScroll.current = null;
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

    // An earlier page was prepended: keep the same messages under the finger.
    useLayoutEffect(() => {
        const p = prevScroll.current;
        const el = scrollRef.current;
        if (p && el && el.scrollHeight !== p.h) {
            el.scrollTop = p.top + (el.scrollHeight - p.h);
            prevScroll.current = null;
        }
    }, [messages]);
    // The load finished without new rows (or failed): forget the anchor.
    useEffect(() => {
        if (older !== "loading") prevScroll.current = null;
    }, [older]);

    // Stay pinned to the newest message while the viewport (keyboard, rotation)
    // or the composer (more lines, counter) changes size.
    useEffect(() => {
        const el = scrollRef.current;
        const section = sectionRef.current;
        if (!el || !section) return;
        let h = el.clientHeight;
        const ro = new ResizeObserver(() => {
            if (el.clientHeight !== h && nearBottom.current)
                el.scrollTop = el.scrollHeight;
            h = el.clientHeight;
        });
        ro.observe(el);
        const onComposerResize = () => {
            if (nearBottom.current) el.scrollTop = el.scrollHeight;
        };
        section.addEventListener("composer-resize", onComposerResize);
        return () => {
            ro.disconnect();
            section.removeEventListener("composer-resize", onComposerResize);
        };
    }, [activeThreadId]);

    // Move focus into the pushed screen so VoiceOver/keyboard users land in it.
    useEffect(() => {
        if (!compact) return;
        const t = setTimeout(() => {
            if (!document.activeElement || document.activeElement === document.body) {
                titleBtnRef.current?.focus({ preventScroll: true });
            }
        }, 450);
        return () => clearTimeout(t);
    }, [activeThreadId, compact]);

    const dismissKeyboard = useDismissKeyboardOnDrag({ direction: "down" });

    const [linkConfirm, confirmLink] = useConfirm();
    const onLinkPress = useCallback(
        async (href: string, unknown: boolean) => {
            const url = withScheme(href);
            if (unknown) {
                let host = href;
                try {
                    host = new URL(url).hostname;
                } catch {}
                const ok = await confirmLink({
                    title: "Open link from unknown sender?",
                    message: host,
                    confirmLabel: "Open",
                    destructive: false,
                });
                if (!ok) return;
            }
            window.open(url, "_blank", "noopener");
        },
        [confirmLink]
    );

    const loadEarlier = () => {
        const el = scrollRef.current;
        if (!el || !activeThreadId) return;
        prevScroll.current = { h: el.scrollHeight, top: el.scrollTop };
        void loadOlderMessages(activeThreadId);
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
                    ref={titleBtnRef}
                    type="button"
                    onClick={onOpenContact}
                    aria-label={`${title}, contact details`}
                    className="tap group short:flex-row flex flex-col items-center"
                >
                    <Avatar
                        name={activeName}
                        size={46}
                        className="short:hidden relative z-10 shadow-[0_2px_8px_rgb(0_0_0/0.12)]"
                    />
                    <span className="glass text-footnote split:max-w-xs short:mt-0 short:min-h-11 short:gap-1.5 short:pl-1.5 -mt-1.5 flex max-w-[52vw] items-center gap-0.5 rounded-full py-[3px] pr-2 pl-3 font-semibold transition-transform duration-200 group-active:scale-95">
                        <Avatar
                            name={activeName}
                            size={24}
                            className="short:inline-flex hidden"
                        />
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
            ref={sectionRef}
            aria-label={`Conversation with ${title}`}
            className="bg-bg relative flex h-full min-h-0 flex-col overflow-hidden"
            style={{ "--thread-max": "48rem" } as React.CSSProperties}
        >
            {header}

            <div
                ref={scrollRef}
                onScroll={(e) => {
                    const el = e.currentTarget;
                    nearBottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
                    if (nearBottom.current && newBelow) setNewBelow(0);
                    setScrolledUnder(el.scrollTop > 4);
                }}
                {...dismissKeyboard}
                onClick={(e) => {
                    // A tap on empty transcript space dismisses the keyboard too.
                    // Bubbles (role=article) are excluded so long-press stays intact.
                    if (
                        !(e.target as Element).closest(
                            "button,a,input,textarea,[role=button],[role=article]"
                        )
                    ) {
                        blurActiveField();
                    }
                }}
                // Composer height (measured, includes the safe area) + breathing room.
                className="short:pt-[calc(60px+var(--safe-top))] flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain pt-[calc(100px+var(--safe-top))] pb-[calc(var(--composer-h,56px)+20px)]"
                style={{ touchAction: "pan-y" }}
            >
                {loading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Spinner size={24} />
                    </div>
                ) : items.length === 0 && loadError ? (
                    <div className="flex flex-1 items-center justify-center">
                        <ContentUnavailable
                            icon={<WifiOff />}
                            title="Can't Load Conversation"
                            description="Check your connection."
                            actions={
                                <Button
                                    variant="gray"
                                    onClick={() =>
                                        activeThreadId && refreshThread(activeThreadId)
                                    }
                                >
                                    Try Again
                                </Button>
                            }
                        />
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-10 text-center">
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
                    // mt-auto anchors a short conversation just above the composer.
                    <div className="mt-auto w-full">
                        {older === "more" || older === "loading" ? (
                            <div className="mx-auto flex max-w-[var(--thread-max)] justify-center pt-1 pb-2">
                                <Button
                                    variant="plain"
                                    size="sm"
                                    loading={older === "loading"}
                                    onClick={loadEarlier}
                                >
                                    Load Earlier Messages
                                </Button>
                            </div>
                        ) : null}
                        {/* Keyed by thread: the initial batch isn't announced as additions. */}
                        <div
                            key={activeThreadId}
                            role="log"
                            aria-live="polite"
                            aria-relevant="additions"
                            aria-label={`Messages with ${title}`}
                            className="mx-auto max-w-[var(--thread-max)]"
                        >
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
                                        gatewayStale={gatewayStale}
                                        animate={animateIds.has(item.message.id)}
                                        onRetry={retryMessage}
                                        onDiscard={discardMessage}
                                        onLinkPress={onLinkPress}
                                        onCopyCode={copyCode}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Floating controls above the composer, aligned with the transcript. */}
            <div
                className="pointer-events-none absolute inset-x-0 z-20 mx-auto flex max-w-[var(--thread-max)] flex-col gap-2 px-4"
                style={{ bottom: "calc(var(--composer-h, 56px) + 12px)" }}
            >
                <div className="flex justify-end">
                    <button
                        type="button"
                        aria-label={
                            newBelow
                                ? `${newBelow} new message${newBelow > 1 ? "s" : ""}, scroll to bottom`
                                : "Scroll to bottom"
                        }
                        aria-hidden={newBelow ? undefined : true}
                        tabIndex={newBelow ? undefined : -1}
                        // Keep the composer (and keyboard) focused.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => scrollToBottom(true)}
                        className={cn(
                            "tap glass pointer-events-auto relative flex size-10 items-center justify-center rounded-full",
                            // 44pt hit area around the 40pt visual.
                            "before:absolute before:-inset-[2px] before:content-['']",
                            "ease-spring transition-[transform,opacity] duration-300",
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
                </div>
                {showGatewayBanner ? (
                    <p
                        role="status"
                        className="glass text-footnote text-label-2 pointer-events-auto self-center rounded-[14px] px-3 py-2 text-center"
                    >
                        Your Android gateway hasn&apos;t checked in for{" "}
                        {Math.round((gatewayIdleMs ?? 0) / 60_000)} min. Messages will
                        send when it reconnects.
                    </p>
                ) : null}
            </div>

            <Composer autoFocus={!compact && !activeBlocked} />
            {linkConfirm}
        </section>
    );
});
