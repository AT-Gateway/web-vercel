"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { ArrowUp, CardSim } from "lucide-react";
import { smsInfo } from "@/lib/sms";
import { isTouchDevice } from "@/lib/device";
import { loadDrafts, loadSession, saveDrafts } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Menu } from "@/components/ios/Menu";
import { IconButton, Button } from "@/components/ios/Button";
import { useToast } from "@/components/ios/Toast";
import { useApp } from "@/features/app/AppProvider";

// Drafts survive switching conversations and reloads, like Messages. Text only.
const drafts = new Map<string, string>();
/** Pairing the in-memory drafts were loaded for (undefined: not loaded yet). */
let draftsFor: string | null | undefined;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function seedDrafts(pairingId: string | null) {
    if (draftsFor === pairingId) return;
    drafts.clear();
    if (pairingId) {
        for (const [k, v] of Object.entries(loadDrafts())) drafts.set(k, v);
    }
    draftsFor = pairingId;
}

function flushDrafts() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    // Signed out (or switched pairing) meanwhile: storage was wiped on purpose,
    // don't write the old pairing's drafts back.
    const s = loadSession();
    if (!s || s.pairingId !== draftsFor) {
        if (storageAvailable()) {
            drafts.clear();
            draftsFor = undefined;
        }
        return;
    }
    saveDrafts(Object.fromEntries(drafts));
}

function storageAvailable(): boolean {
    try {
        return typeof window !== "undefined" && window.localStorage != null;
    } catch {
        return false;
    }
}

function scheduleDraftSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDrafts, 300);
}

/** Fallback when the computed max-height can't be read. */
const MAX_HEIGHT = 152;

export function Composer({ autoFocus }: { autoFocus?: boolean }) {
    const {
        session,
        activeThreadId,
        activePeer,
        activeBlocked,
        activeName,
        simSlot,
        setSimSlot,
        sendMessage,
        unblockThread,
    } = useApp();
    const toast = useToast();
    seedDrafts(session?.pairingId ?? null);
    const [text, setText] = useState(() =>
        activeThreadId ? (drafts.get(activeThreadId) ?? "") : ""
    );
    const ref = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // Swap drafts when the conversation changes. Done while rendering, so the
    // save effect below never pairs the old text with the new thread.
    const [textThread, setTextThread] = useState(activeThreadId);
    if (textThread !== activeThreadId) {
        setTextThread(activeThreadId);
        setText(activeThreadId ? (drafts.get(activeThreadId) ?? "") : "");
    }

    useEffect(() => {
        if (!activeThreadId) return;
        if ((drafts.get(activeThreadId) ?? "") === text) return;
        if (text) drafts.set(activeThreadId, text);
        else drafts.delete(activeThreadId);
        scheduleDraftSave();
    }, [text, activeThreadId]);

    // Save pending drafts before the page goes away (iOS may evict a hidden PWA).
    useEffect(() => {
        const flushPending = () => {
            if (saveTimer) flushDrafts();
        };
        const onVisibility = () => {
            if (document.visibilityState === "hidden") flushPending();
        };
        window.addEventListener("pagehide", flushPending);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pagehide", flushPending);
            document.removeEventListener("visibilitychange", onVisibility);
            flushPending();
        };
    }, []);

    useEffect(() => {
        if (autoFocus && !isTouchDevice()) ref.current?.focus({ preventScroll: true });
    }, [autoFocus, activeThreadId]);

    // Publish the composer's height to the thread (--composer-h on the parent)
    // so the transcript's bottom padding and the floating controls follow it.
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        let last = -1;
        const publish = () => {
            const h = el.offsetHeight;
            if (h === last) return;
            last = h;
            el.parentElement?.style.setProperty("--composer-h", `${h}px`);
            el.dispatchEvent(new CustomEvent("composer-resize", { bubbles: true }));
        };
        publish();
        const ro = new ResizeObserver(publish);
        ro.observe(el);
        return () => ro.disconnect();
    }, [activeBlocked]);

    const autosize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const max = parseFloat(getComputedStyle(el).maxHeight) || MAX_HEIGHT;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    }, []);

    useLayoutEffect(autosize, [text, autosize]);

    // Re-measure when the field's width changes (rotation, split view resize),
    // since the same text then wraps onto a different number of lines.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let width = el.clientWidth;
        const ro = new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            autosize();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [activeBlocked, autosize]);

    const info = useMemo(() => smsInfo(text), [text]);
    const canSend = text.trim().length > 0 && Boolean(activePeer);
    const showCounter =
        info.segments > 1 || (info.segments === 1 && info.remaining <= 20);

    // Screen readers hear the part count only when it changes, not every keystroke.
    const [announcement, setAnnouncement] = useState("");
    const prevSegments = useRef(info.segments);
    useEffect(() => {
        const prev = prevSegments.current;
        prevSegments.current = info.segments;
        if (prev === info.segments || info.segments === 0) return;
        if (info.segments > 1 || prev > 1) {
            setAnnouncement(
                info.segments === 1 ? "Fits in 1 SMS" : `${info.segments} SMS messages`
            );
        }
    }, [info.segments]);

    const send = () => {
        if (!canSend) return;
        const value = text;
        setText("");
        void sendMessage(value);
        ref.current?.focus({ preventScroll: true });
    };

    if (activeBlocked) {
        return (
            <div
                ref={rootRef}
                className="edge-bottom absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1 px-4 pt-3 pb-[calc(12px+var(--safe-bottom-kb))]"
            >
                <p className="text-footnote text-label-2 text-center">
                    You blocked {activeName || activePeer}. Their messages aren&apos;t
                    being saved.
                </p>
                <Button
                    variant="plain"
                    size="sm"
                    onClick={() => activeThreadId && unblockThread(activeThreadId)}
                >
                    Unblock
                </Button>
            </div>
        );
    }

    const simLabel = simSlot === 1 ? "SIM 2" : "SIM 1";

    return (
        <div
            ref={rootRef}
            className="edge-bottom absolute inset-x-0 bottom-0 z-20 px-3 pt-2 pb-[calc(8px+var(--safe-bottom-kb))]"
        >
            {showCounter ? (
                <div className="mx-auto flex max-w-[var(--thread-max)] justify-end px-2 pb-1">
                    <button
                        type="button"
                        // Keep the keyboard up.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                            toast({
                                title:
                                    info.encoding === "UCS-2"
                                        ? "Persian and emoji use 70 characters per SMS"
                                        : "160 characters per SMS",
                            })
                        }
                        className={cn(
                            "tap text-caption-2 relative font-medium tabular-nums",
                            // ≥44pt hit area, extended upward (away from the field).
                            "before:absolute before:-inset-x-3 before:-top-7 before:-bottom-1 before:content-['']",
                            info.segments > 3 ? "text-orange" : "text-label-2"
                        )}
                    >
                        {info.segments > 1 ? `${info.segments} SMS · ` : ""}
                        {info.remaining} left
                    </button>
                </div>
            ) : null}
            <span className="sr-only" aria-live="polite">
                {announcement}
            </span>
            <div className="mx-auto flex max-w-[var(--thread-max)] items-end gap-2">
                <Menu
                    label="Send from"
                    side="top"
                    align="start"
                    keepFocus
                    sections={[
                        [
                            {
                                label: "SIM 1",
                                icon: <CardSim />,
                                checked: simSlot === 0,
                                onSelect: () => setSimSlot(0),
                            },
                            {
                                label: "SIM 2",
                                icon: <CardSim />,
                                checked: simSlot === 1,
                                onSelect: () => setSimSlot(1),
                            },
                        ],
                    ]}
                    trigger={
                        <IconButton
                            label={`Send from ${simLabel}`}
                            // 40pt visual, 44pt hit area.
                            className="!size-10 before:absolute before:-inset-[2px] before:content-['']"
                            icon={
                                <span className="relative flex items-center justify-center">
                                    <CardSim strokeWidth={1.9} />
                                    <span className="bg-label text-bg absolute -right-2 -bottom-1.5 flex size-[15px] items-center justify-center rounded-full text-[0.625rem] leading-none font-bold">
                                        {simSlot + 1}
                                    </span>
                                </span>
                            }
                        />
                    }
                />

                <div className="glass relative flex min-h-10 min-w-0 flex-1 items-end rounded-[20px]">
                    <textarea
                        ref={ref}
                        rows={1}
                        value={text}
                        dir="auto"
                        aria-label={`Message ${activeName || activePeer}`}
                        placeholder={`Text Message · ${simLabel}`}
                        enterKeyHint={isTouchDevice() ? "enter" : "send"}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            // Hardware keyboards send on Return; Shift+Return or touch keyboards add a line.
                            if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !e.nativeEvent.isComposing &&
                                !isTouchDevice()
                            ) {
                                e.preventDefault();
                                send();
                            }
                        }}
                        className={cn(
                            "scrollbar-none text-body block max-h-[min(152px,calc(var(--vvh,100dvh)*0.3))] min-h-10 w-full resize-none bg-transparent py-[9px] pl-4 leading-[22px] outline-none [unicode-bidi:plaintext]",
                            canSend ? "pr-11" : "pr-4"
                        )}
                    />
                    <button
                        type="button"
                        aria-label="Send"
                        disabled={!canSend}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={send}
                        className={cn(
                            "tap bg-tint absolute right-[5px] bottom-[5px] flex size-[30px] items-center justify-center rounded-full text-white",
                            // 44pt hit area around the 30pt visual.
                            "before:absolute before:-inset-[7px] before:content-['']",
                            "ease-spring transition-[transform,opacity] duration-200 active:scale-90",
                            canSend
                                ? "scale-100 opacity-100"
                                : "pointer-events-none scale-50 opacity-0"
                        )}
                    >
                        <ArrowUp className="size-[19px]" strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );
}
