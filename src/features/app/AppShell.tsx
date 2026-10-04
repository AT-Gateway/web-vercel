"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { MessagesSquare, SquarePen, WifiOff } from "lucide-react";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { applyAppearance, watchSheetThemeColor } from "@/hooks/useAppearance";
import { health } from "@/lib/api";
import { isIOS, isStandalone } from "@/lib/device";
import { loadAppearance } from "@/lib/storage";
import { Button } from "@/components/ios/Button";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { useToast } from "@/components/ios/Toast";
import { AppContext, type AppState, useApp } from "@/features/app/AppProvider";
import { PairingScreen } from "@/features/pairing/PairingScreen";
import { ConversationList } from "@/features/conversations/ConversationList";
import { ThreadView } from "@/features/thread/ThreadView";
import { SettingsSheet } from "@/features/settings/SettingsSheet";
import { NewMessageSheet } from "@/features/compose/NewMessageSheet";
import { ContactInfoSheet } from "@/features/contacts/ContactInfoSheet";

type Snapshot = Pick<
    AppState,
    "activeThreadId" | "activePeer" | "activeName" | "activeBlocked"
>;

const PUSH_MS = 420;
const EDGE_PX = 28;
/** Release velocity (px/ms) over the last VELOCITY_WINDOW_MS that commits a swipe. */
const COMMIT_VX = 0.3;
const VELOCITY_WINDOW_MS = 80;
const UPDATE_CHECK_EVERY_MS = 10 * 60_000;
const OFFLINE_RETRY_MS = 20_000;

/** Marks the app ready; CSS fades out the pseudo-element launch splash (globals.css). */
function hideLaunchSplash() {
    document.documentElement.dataset.appReady = "1";
}

function prefersReducedMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function CantConnect({ retrying }: { retrying: boolean }) {
    const { retryConnect, signOut } = useApp();

    // Come back by itself: when the network returns, when the app is reopened,
    // and every so often while it stays on screen (a cold server can take a while).
    useEffect(() => {
        if (retrying) return;
        const onVisible = () => {
            if (document.visibilityState === "visible") retryConnect();
        };
        window.addEventListener("online", retryConnect);
        document.addEventListener("visibilitychange", onVisible);
        const timer = window.setTimeout(onVisible, OFFLINE_RETRY_MS);
        return () => {
            window.removeEventListener("online", retryConnect);
            document.removeEventListener("visibilitychange", onVisible);
            window.clearTimeout(timer);
        };
    }, [retrying, retryConnect]);

    return (
        <div
            className="bg-grouped pt-safe pb-safe px-safe flex h-[var(--vvh,100dvh)] flex-col items-center justify-center"
            style={{ translate: "0 var(--vvt, 0px)" }}
        >
            <ContentUnavailable
                icon={<WifiOff />}
                title="Can’t Connect"
                description="Check your internet connection and try again. If you just set up the server, it can take a few seconds to start."
                actions={
                    <>
                        <Button loading={retrying} onClick={retryConnect}>
                            Try Again
                        </Button>
                        <Button variant="plain" tone="red" onClick={signOut}>
                            Sign Out
                        </Button>
                    </>
                }
            />
        </div>
    );
}

type DragState = {
    x: number;
    y: number;
    active: boolean;
    width: number;
    lastX: number;
    raf: number;
    samples: { x: number; t: number }[];
};

function trimSamples(samples: DragState["samples"], now: number) {
    while (samples.length > 2 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
}

/**
 * iPhone navigation stack: the thread pushes over the list with the iOS
 * parallax, and can be dismissed by dragging from the left edge.
 *
 * The three moving layers (list, dim, thread) are positioned imperatively
 * (`applyProgress`), never through React style, so a drag doesn't re-render
 * the list or the transcript on every pointermove.
 */
function CompactStack({
    onOpenSettings,
    onCompose,
    onOpenContact,
}: {
    onOpenSettings: () => void;
    onCompose: () => void;
    onOpenContact: () => void;
}) {
    const app = useApp();
    const { activeThreadId, closeThread } = app;
    const open = Boolean(activeThreadId);

    // Keep showing the last thread while it animates out.
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    useEffect(() => {
        if (activeThreadId) {
            setSnapshot({
                activeThreadId,
                activePeer: app.activePeer,
                activeName: app.activeName,
                activeBlocked: app.activeBlocked,
            });
            return;
        }
        const t = window.setTimeout(() => setSnapshot(null), PUSH_MS);
        return () => window.clearTimeout(t);
    }, [activeThreadId, app.activePeer, app.activeName, app.activeBlocked]);

    // A committed swipe holds the thread where the finger left it until the
    // history pop lands, then animates it the rest of the way out.
    const [closing, setClosing] = useState(false);
    useEffect(() => setClosing(false), [activeThreadId]);
    useEffect(() => {
        if (!closing) return;
        // Matches closeThread's own failsafe for a popstate that never arrives.
        const t = window.setTimeout(() => setClosing(false), 1000);
        return () => window.clearTimeout(t);
    }, [closing]);

    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const dimRef = useRef<HTMLDivElement>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const drag = useRef<DragState | null>(null);
    const layerMounted = useRef(false);
    /** performance.now() of a popstate the browser already animated, or 0. */
    const skipNextAnim = useRef(0);

    /** p = 0: thread fully shown; p = 1: thread off-screen, list in place. */
    const applyProgress = useCallback((p: number, animate: boolean) => {
        const transition =
            animate && !prefersReducedMotion()
                ? `transform ${PUSH_MS}ms var(--motion-ios), opacity ${PUSH_MS}ms var(--motion-ios)`
                : "none";
        const list = listRef.current;
        const dim = dimRef.current;
        const thread = threadRef.current;
        if (list) {
            list.style.transition = transition;
            list.style.transform = `translate3d(${-(1 - p) * 30}%,0,0)`;
        }
        if (dim) {
            dim.style.transition = transition;
            dim.style.opacity = String((1 - p) * 0.12);
        }
        if (thread) {
            thread.style.transition = transition;
            thread.style.transform = `translate3d(${p * 100}%,0,0)`;
        }
    }, []);

    const endDrag = useCallback(() => {
        const d = drag.current;
        drag.current = null;
        if (d?.raf) cancelAnimationFrame(d.raf);
        rootRef.current?.removeAttribute("data-swiping");
        return d;
    }, []);

    // Browser-driven history steps (Safari's edge swipe, Chrome Android's back
    // transition) have already been animated by the browser: don't play ours on
    // top. App-driven ones are flagged by AppProvider (data-nav-source="app").
    useEffect(() => {
        const onPop = (e: PopStateEvent) => {
            const ua = (e as PopStateEvent & { hasUAVisualTransition?: boolean })
                .hasUAVisualTransition;
            const fromApp = document.documentElement.dataset.navSource === "app";
            const iosBrowser = isIOS() && !isStandalone();
            const skip = !fromApp && (ua === true || (ua === undefined && iosBrowser));
            skipNextAnim.current = skip ? performance.now() : 0;
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const shown = open || Boolean(snapshot);
    const prevOpen = useRef(open);
    const firstRun = useRef(true);

    useLayoutEffect(() => {
        // Navigation changed under a gesture (e.g. a notification): drop it.
        if (drag.current) endDrag();

        // Mounting with a thread already open (cold start from a notification or
        // link, or a resize from split view) shows it in place, without a push.
        let skip = firstRun.current;
        firstRun.current = false;
        if (prevOpen.current !== open) {
            prevOpen.current = open;
            skip ||=
                skipNextAnim.current > 0 &&
                performance.now() - skipNextAnim.current < 1000;
            skipNextAnim.current = 0;
        }

        const thread = threadRef.current;
        if (!shown || !thread) {
            layerMounted.current = false;
            applyProgress(1, false);
            return;
        }

        if (!layerMounted.current) {
            layerMounted.current = true;
            if (open && !skip) {
                // The layer was just inserted: start it off-screen, then push it in.
                applyProgress(1, false);
                thread.getBoundingClientRect();
                applyProgress(0, true);
                return;
            }
        }

        applyProgress(open && !closing ? 0 : 1, !skip);
        if (skip && !open) setSnapshot(null);
    }, [open, shown, closing, applyProgress, endDrag]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!open || closing || e.pointerType === "mouse") return;
        const left = e.currentTarget.getBoundingClientRect().left;
        if (e.clientX - left > EDGE_PX) return;
        drag.current = {
            x: e.clientX,
            y: e.clientY,
            active: false,
            width: 0,
            lastX: e.clientX,
            raf: 0,
            samples: [{ x: e.clientX, t: performance.now() }],
        };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.active) {
            if (dx > 8 && dx > Math.abs(dy)) {
                d.active = true;
                d.width = e.currentTarget.offsetWidth || window.innerWidth;
                e.currentTarget.setPointerCapture(e.pointerId);
                // Suppresses cell press highlights under the finger (cell-press).
                rootRef.current?.setAttribute("data-swiping", "");
            } else if (Math.abs(dy) > 10) {
                drag.current = null;
            }
            return;
        }
        const now = performance.now();
        d.samples.push({ x: e.clientX, t: now });
        trimSamples(d.samples, now);
        d.lastX = e.clientX;
        if (!d.raf) {
            d.raf = requestAnimationFrame(() => {
                d.raf = 0;
                applyProgress(Math.min(1, Math.max(0, (d.lastX - d.x) / d.width)), false);
            });
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = endDrag();
        if (!d?.active) return;
        const now = performance.now();
        d.samples.push({ x: e.clientX, t: now });
        trimSamples(d.samples, now);
        const first = d.samples[0];
        const last = d.samples[d.samples.length - 1];
        const recentDx = last.x - first.x;
        const vx = recentDx / Math.max(1, last.t - first.t);
        const dx = Math.max(0, e.clientX - d.x);
        const commit =
            recentDx >= 0 && (dx > d.width * 0.5 || (vx > COMMIT_VX && recentDx > 0));
        if (commit) {
            // Hold the released position; the layout effect animates on from here.
            applyProgress(Math.min(1, dx / d.width), false);
            setClosing(true);
            closeThread();
        } else {
            applyProgress(0, true);
        }
    };

    const onPointerCancel = () => {
        const d = endDrag();
        if (d?.active) applyProgress(0, true);
    };

    const frozen = useMemo<AppState | null>(
        () => (!activeThreadId && snapshot ? { ...app, ...snapshot } : null),
        [app, activeThreadId, snapshot]
    );

    return (
        <div ref={rootRef} className="bg-bg relative h-full overflow-hidden">
            <div
                ref={listRef}
                aria-hidden={open}
                inert={open}
                className="absolute inset-0"
            >
                <ConversationList onOpenSettings={onOpenSettings} onCompose={onCompose} />
                {/* Dimming as the thread covers the list */}
                <div
                    ref={dimRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-black opacity-0"
                />
            </div>

            {shown ? (
                <div
                    ref={threadRef}
                    data-motion="fade"
                    className="absolute inset-0 shadow-[-12px_0_32px_rgb(0_0_0/0.12)]"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                >
                    {frozen ? (
                        <AppContext.Provider value={frozen}>
                            <ThreadView compact onOpenContact={onOpenContact} />
                        </AppContext.Provider>
                    ) : (
                        <ThreadView compact onOpenContact={onOpenContact} />
                    )}
                </div>
            ) : null}
        </div>
    );
}

function SplitView({
    onOpenSettings,
    onCompose,
    onOpenContact,
}: {
    onOpenSettings: () => void;
    onCompose: () => void;
    onOpenContact: () => void;
}) {
    const { activeThreadId } = useApp();
    return (
        <div className="bg-bg flex h-full">
            <aside
                aria-label="Conversations"
                className="border-separator h-full lg:rounded-4xl lg:m-4 lg:h-[calc(100%-2rem)] w-[var(--sidebar-width)] shrink-0 overflow-hidden border-r-[0.5px] lg:w-[400px]"
            >
                <ConversationList
                    sidebar
                    onOpenSettings={onOpenSettings}
                    onCompose={onCompose}
                />
            </aside>
            <main className="min-w-0 flex-1">
                {activeThreadId ? (
                    <ThreadView
                        key={activeThreadId}
                        compact={false}
                        onOpenContact={onOpenContact}
                    />
                ) : (
                    <ContentUnavailable
                        className="h-full"
                        icon={<MessagesSquare />}
                        title="No Conversation Selected"
                        description="Choose a conversation from the list, or start a new one."
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
                )}
            </main>
        </div>
    );
}

/** Drops `?compose=1` from the URL, keeping the entry's own state keys. */
function stripComposeParam() {
    const params = new URLSearchParams(location.search);
    params.delete("compose");
    const qs = params.toString();
    // Without Next's internal markers its router re-syncs to the new URL (it copies
    // them back in); the app's own keys (thread, pushed) are preserved.
    const state: Record<string, unknown> = { ...(history.state ?? {}) };
    delete state.__NA;
    delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
    history.replaceState(
        state,
        "",
        location.pathname + (qs ? `?${qs}` : "") + location.hash
    );
}

export function AppShell() {
    const { status, activeThreadId, messagesByThread } = useApp();
    const toast = useToast();
    const compact = useIsCompact();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);

    // Keyboard-aware sizing (--vvh/--vvt/--kb) for every screen, Pairing included.
    useVisualViewport();

    // `split:` CSS variant (globals.css).
    useLayoutEffect(() => {
        document.documentElement.dataset.layout = compact ? "compact" : "split";
    }, [compact]);
    useEffect(() => () => void delete document.documentElement.dataset.layout, []);

    // theme-color follows the in-app appearance (the head boot script runs before
    // Next inserts the theme-color metas, so it can't), and turns black behind
    // bottom sheets.
    useEffect(() => {
        applyAppearance(loadAppearance());
        return watchSheetThemeColor();
    }, []);

    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const openCompose = useCallback(() => setComposeOpen(true), []);
    const openContact = useCallback(() => setContactOpen(true), []);

    // Sheets belong to the screen they were opened over: the contact card closes
    // whenever the conversation changes, and every sheet closes when a
    // conversation opens (e.g. from a notification) so it isn't hidden behind one.
    const prevTid = useRef(activeThreadId);
    useEffect(() => {
        if (activeThreadId === prevTid.current) return;
        prevTid.current = activeThreadId;
        setContactOpen(false);
        if (activeThreadId) {
            setSettingsOpen(false);
            setComposeOpen(false);
        }
    }, [activeThreadId]);

    // AppProvider dispatches this before a notification-driven open.
    useEffect(() => {
        const closeAll = () => {
            setSettingsOpen(false);
            setComposeOpen(false);
            setContactOpen(false);
        };
        window.addEventListener("app:external-open", closeAll);
        return () => window.removeEventListener("app:external-open", closeAll);
    }, []);

    // Home Screen shortcut "New Message" (manifest) opens /?compose=1.
    useEffect(() => {
        if (status !== "ready") return;
        if (new URLSearchParams(location.search).get("compose") !== "1") return;
        setComposeOpen(true);
        stripComposeParam();
    }, [status]);

    useEffect(() => {
        if (status !== "loading") hideLaunchSplash();
    }, [status]);

    // While retrying from Can't Connect, keep that screen up (with a spinner)
    // instead of blanking the page.
    const [wasOffline, setWasOffline] = useState(false);
    useEffect(() => {
        if (status === "offline") setWasOffline(true);
        else if (status !== "loading") setWasOffline(false);
    }, [status]);

    // A new deploy is live while this (long-suspended) PWA still runs the old
    // build: offer a reload, and reload silently when the app is next hidden
    // with nothing in progress (an open thread or sheet, or an unconfirmed send,
    // which lives only in memory).
    const busyRef = useRef(false);
    useEffect(() => {
        busyRef.current =
            Boolean(activeThreadId) ||
            settingsOpen ||
            composeOpen ||
            Object.values(messagesByThread).some((list) => list.some((m) => m.local));
    }, [activeThreadId, settingsOpen, composeOpen, messagesByThread]);
    useEffect(() => {
        const current = process.env.NEXT_PUBLIC_BUILD_ID;
        if (status !== "ready" || !current || current === "dev") return;
        let lastCheck = 0;
        let found = false;
        const check = () => {
            if (found || document.visibilityState !== "visible") return;
            if (Date.now() - lastCheck < UPDATE_CHECK_EVERY_MS) return;
            lastCheck = Date.now();
            health()
                .then((res) => {
                    if (
                        found ||
                        !res.build ||
                        res.build === "dev" ||
                        res.build === current
                    )
                        return;
                    found = true;
                    toast({
                        title: "Update Available",
                        body: "Tap to reload",
                        duration: 8000,
                        onPress: () => location.reload(),
                    });
                })
                .catch(() => {});
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") check();
            else if (found && !busyRef.current) location.reload();
        };
        const first = window.setTimeout(check, 30_000);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.clearTimeout(first);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [status, toast]);

    // Keyboard shortcuts on hardware keyboards: ⌘N new message, ⌘, settings.
    useEffect(() => {
        if (status !== "ready") return;
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
            if (e.key === "n" && !e.shiftKey) {
                e.preventDefault();
                setComposeOpen(true);
            } else if (e.key === ",") {
                e.preventDefault();
                setSettingsOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [status]);

    // The layout's launch splash covers the screen until the session is known.
    if (status === "loading") return wasOffline ? <CantConnect retrying /> : null;
    if (status === "signedOut") return <PairingScreen />;
    if (status === "offline") return <CantConnect retrying={false} />;

    const props = {
        onOpenSettings: openSettings,
        onCompose: openCompose,
        onOpenContact: openContact,
    };

    return (
        <div
            data-vaul-drawer-wrapper
            className="bg-bg pl-safe pr-safe h-[var(--vvh,100dvh)] overflow-hidden"
            // `translate`, not transform: vaul writes an inline transform here
            // while a sheet is open, and the two must compose.
            style={{ translate: "0 var(--vvt, 0px)" }}
        >
            <div className="relative h-full">
                {compact ? <CompactStack {...props} /> : <SplitView {...props} />}
            </div>
            <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
            <NewMessageSheet open={composeOpen} onOpenChange={setComposeOpen} />
            <ContactInfoSheet
                open={contactOpen && Boolean(activeThreadId)}
                onOpenChange={setContactOpen}
            />
        </div>
    );
}
