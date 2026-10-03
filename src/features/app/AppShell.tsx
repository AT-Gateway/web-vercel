"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare, SquarePen } from "lucide-react";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ios/Button";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { Spinner } from "@/components/ios/Spinner";
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

function LaunchScreen() {
    const [showSpinner, setShowSpinner] = useState(false);
    useEffect(() => {
        const t = window.setTimeout(() => setShowSpinner(true), 600);
        return () => window.clearTimeout(t);
    }, []);
    return (
        <div className="bg-bg flex h-dvh items-center justify-center">
            {showSpinner ? <Spinner size={24} /> : null}
        </div>
    );
}

/**
 * iPhone navigation stack: the thread pushes over the list with the iOS
 * parallax, and can be dismissed by dragging from the left edge.
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

    const [dragX, setDragX] = useState<number | null>(null);
    const [width, setWidth] = useState(390);
    const drag = useRef<{ x: number; y: number; t: number; active: boolean } | null>(
        null
    );

    useEffect(() => {
        const update = () => setWidth(window.innerWidth);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
        if (!open || e.pointerType === "mouse" || e.clientX > EDGE_PX) return;
        drag.current = {
            x: e.clientX,
            y: e.clientY,
            t: performance.now(),
            active: false,
        };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.active) {
            if (dx > 8 && dx > Math.abs(dy)) {
                d.active = true;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } else if (Math.abs(dy) > 10) {
                drag.current = null;
            }
            return;
        }
        setDragX(Math.max(0, dx));
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = drag.current;
        drag.current = null;
        if (!d?.active) return;
        const dx = Math.max(0, e.clientX - d.x);
        const velocity = dx / Math.max(1, performance.now() - d.t);
        setDragX(null);
        if (dx > width * 0.35 || velocity > 0.5) closeThread();
    };

    const progress = dragX !== null ? Math.min(1, dragX / width) : open ? 0 : 1;
    const dragging = dragX !== null;
    const transition = dragging
        ? "none"
        : `transform ${PUSH_MS}ms var(--motion-ios), opacity ${PUSH_MS}ms var(--motion-ios)`;
    const shown = open || Boolean(snapshot);

    const frozen: AppState | null =
        !activeThreadId && snapshot ? { ...app, ...snapshot } : null;

    return (
        <div className="bg-bg relative h-dvh overflow-hidden">
            <div
                aria-hidden={open}
                inert={open}
                className="absolute inset-0"
                style={{
                    transform: `translate3d(${-(1 - progress) * 30}%,0,0)`,
                    transition,
                }}
            >
                <ConversationList onOpenSettings={onOpenSettings} onCompose={onCompose} />
                {/* Dimming as the thread covers the list */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-black"
                    style={{ opacity: (1 - progress) * 0.12, transition }}
                />
            </div>

            {shown ? (
                <div
                    data-motion="fade"
                    className="absolute inset-0 shadow-[-12px_0_32px_rgb(0_0_0/0.12)]"
                    style={{
                        transform: `translate3d(${progress * 100}%,0,0)`,
                        transition,
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
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
        <div className="bg-bg flex h-dvh">
            <aside
                aria-label="Conversations"
                className="border-separator h-full w-[var(--sidebar-width)] shrink-0 overflow-hidden border-r-[0.5px] lg:w-[400px]"
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

export function AppShell() {
    const { status, activeThreadId } = useApp();
    const compact = useIsCompact();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);

    const openSettings = useCallback(() => setSettingsOpen(true), []);
    const openCompose = useCallback(() => setComposeOpen(true), []);
    const openContact = useCallback(() => setContactOpen(true), []);

    // The contact sheet belongs to the open conversation.
    useEffect(() => {
        if (!activeThreadId) setContactOpen(false);
    }, [activeThreadId]);

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

    if (status === "loading") return <LaunchScreen />;
    if (status === "signedOut") return <PairingScreen />;

    const props = {
        onOpenSettings: openSettings,
        onCompose: openCompose,
        onOpenContact: openContact,
    };

    return (
        <div data-vaul-drawer-wrapper className="bg-bg h-dvh overflow-hidden">
            {compact ? <CompactStack {...props} /> : <SplitView {...props} />}
            <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
            <NewMessageSheet open={composeOpen} onOpenChange={setComposeOpen} />
            <ContactInfoSheet
                open={contactOpen && Boolean(activeThreadId)}
                onOpenChange={setContactOpen}
            />
        </div>
    );
}
