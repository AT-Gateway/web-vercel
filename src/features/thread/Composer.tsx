"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CardSim } from "lucide-react";
import { smsInfo } from "@/lib/sms";
import { isTouchDevice } from "@/lib/device";
import { cn } from "@/lib/utils";
import { Menu } from "@/components/ios/Menu";
import { IconButton, Button } from "@/components/ios/Button";
import { useApp } from "@/features/app/AppProvider";

// Drafts survive switching conversations, like Messages.
const drafts = new Map<string, string>();

const MAX_HEIGHT = 152;

export function Composer({ autoFocus }: { autoFocus?: boolean }) {
    const {
        activeThreadId,
        activePeer,
        activeBlocked,
        activeName,
        simSlot,
        setSimSlot,
        sendMessage,
        unblockThread,
    } = useApp();
    const [text, setText] = useState(() =>
        activeThreadId ? (drafts.get(activeThreadId) ?? "") : ""
    );
    const ref = useRef<HTMLTextAreaElement>(null);
    const threadRef = useRef(activeThreadId);

    // Swap drafts when the conversation changes.
    useEffect(() => {
        if (threadRef.current === activeThreadId) return;
        threadRef.current = activeThreadId;
        setText(activeThreadId ? (drafts.get(activeThreadId) ?? "") : "");
    }, [activeThreadId]);

    useEffect(() => {
        if (!activeThreadId) return;
        if (text) drafts.set(activeThreadId, text);
        else drafts.delete(activeThreadId);
    }, [text, activeThreadId]);

    useEffect(() => {
        if (autoFocus && !isTouchDevice()) ref.current?.focus({ preventScroll: true });
    }, [autoFocus, activeThreadId]);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    }, [text]);

    const info = useMemo(() => smsInfo(text), [text]);
    const canSend = text.trim().length > 0 && Boolean(activePeer);
    const showCounter =
        info.segments > 1 || (info.segments === 1 && info.remaining <= 20);

    const send = () => {
        if (!canSend) return;
        const value = text;
        setText("");
        void sendMessage(value);
        ref.current?.focus({ preventScroll: true });
    };

    if (activeBlocked) {
        return (
            <div className="edge-bottom absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1 px-4 pt-3 pb-[calc(12px+var(--safe-bottom))]">
                <p className="text-footnote text-label-2">
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
        <div className="edge-bottom absolute inset-x-0 bottom-0 z-20 px-3 pt-2 pb-[calc(8px+var(--safe-bottom))]">
            <div className="mx-auto flex max-w-3xl items-end gap-2">
                <Menu
                    label="Send from"
                    side="top"
                    align="start"
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
                            className="!size-10"
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
                            "scrollbar-none text-body block max-h-[152px] min-h-10 w-full resize-none bg-transparent py-[9px] pl-4 leading-[22px] outline-none",
                            canSend ? "pr-11" : "pr-4"
                        )}
                    />
                    {showCounter ? (
                        <span
                            aria-live="polite"
                            title={
                                info.encoding === "UCS-2"
                                    ? "Unicode text: 70 characters per SMS"
                                    : undefined
                            }
                            className={cn(
                                "text-caption-2 pointer-events-none absolute -top-5 right-2 font-medium tabular-nums",
                                info.segments > 3 ? "text-orange" : "text-label-2"
                            )}
                        >
                            {info.segments > 1 ? `${info.segments} SMS · ` : ""}
                            {info.remaining} left
                        </span>
                    ) : null}
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
