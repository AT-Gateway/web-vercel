"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBackDismiss } from "@/hooks/useBackDismiss";

export type SwipeAction = {
    label: string;
    icon: React.ReactNode;
    tone: "red" | "orange" | "blue" | "purple" | "gray";
    onAction: () => void;
};

const toneBg: Record<SwipeAction["tone"], string> = {
    red: "bg-red",
    orange: "bg-orange",
    blue: "bg-blue",
    purple: "bg-purple",
    gray: "bg-gray",
};

const ACTION_WIDTH = 76;
const OPEN_EVENT = "swipe-row-open";
/** Release speed (px/ms) that counts as a flick. */
const FLICK_VELOCITY = 0.3;
/** Velocity is measured over the last stretch of the drag only. */
const VELOCITY_WINDOW_MS = 80;
/** Past this fraction of the row width, releasing runs the edge action. */
const FULL_SWIPE = 0.6;
/** Resistance once the drag passes the revealed actions. */
const RUBBER_BAND = 0.7;
/** How long a tap that only closed an open row keeps its click swallowed. */
const OUTSIDE_TAP_MS = 400;

type Gesture = {
    x: number;
    y: number;
    base: number;
    axis: "x" | "y" | null;
    moved: boolean;
    /** Row width, measured when the touch starts. */
    w: number;
    samples: { x: number; t: number }[];
};

/**
 * Touch swipe actions (UITableView-style). Leading actions reveal on a
 * right swipe, trailing on a left swipe; a flick opens them, and a long swipe
 * either way runs the first action of that side. An open row closes on a tap
 * elsewhere, on scroll, on Android Back and when another row opens. Mouse and
 * keyboard users reach the same actions through the row's context menu.
 *
 * Like UIKit, the first action of each side sits at the outer edge.
 */
export function SwipeRow({
    leading = [],
    trailing = [],
    children,
    className,
}: {
    leading?: SwipeAction[];
    trailing?: SwipeAction[];
    children: React.ReactNode;
    className?: string;
}) {
    const id = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [offset, setOffsetState] = useState(0);
    const [dragging, setDragging] = useState(false);
    const g = useRef<Gesture | null>(null);
    const suppressClick = useRef(false);
    const offsetRef = useRef(0);
    const widthRef = useRef(0);

    const leadW = leading.length * ACTION_WIDTH;
    const trailW = trailing.length * ACTION_WIDTH;

    const setOffset = useCallback((v: number) => {
        offsetRef.current = v;
        setOffsetState(v);
    }, []);

    const close = useCallback(() => setOffset(0), [setOffset]);

    // Only one row open at a time.
    useEffect(() => {
        const onOpen = (e: Event) => {
            if ((e as CustomEvent<string>).detail !== id && offsetRef.current !== 0) {
                setOffset(0);
            }
        };
        // A notification tap or Back/forward navigates away under the row; an
        // open row left behind would swallow the next Android Back.
        const onNavigate = () => {
            if (offsetRef.current !== 0) setOffset(0);
        };
        window.addEventListener(OPEN_EVENT, onOpen);
        window.addEventListener("app:external-open", onNavigate);
        window.addEventListener("popstate", onNavigate);
        return () => {
            window.removeEventListener(OPEN_EVENT, onOpen);
            window.removeEventListener("app:external-open", onNavigate);
            window.removeEventListener("popstate", onNavigate);
        };
    }, [id, setOffset]);

    // While open: a tap anywhere else only closes the row (its click is
    // swallowed, time-boxed so a touch that turned into a scroll can't eat a
    // later tap), and any scroll closes it.
    const isOpen = offset !== 0;
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const root = rootRef.current;
            if (root && e.target instanceof Node && root.contains(e.target)) return;
            close();
            // One-shot and self-removing: closing re-renders and tears this
            // effect down before the tap's click arrives, so the click guard
            // must not live in the effect.
            const until = performance.now() + OUTSIDE_TAP_MS;
            const onClick = (ev: MouseEvent) => {
                remove();
                if (performance.now() < until) {
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            };
            const timer = window.setTimeout(() => remove(), OUTSIDE_TAP_MS);
            const remove = () => {
                window.clearTimeout(timer);
                document.removeEventListener("click", onClick, true);
            };
            document.addEventListener("click", onClick, true);
        };
        const onScroll = () => {
            // The row's own drag never scrolls; ignore stray scrolls during it.
            if (g.current?.axis === "x") return;
            close();
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("scroll", onScroll, { capture: true });
        };
    }, [isOpen, close]);

    useBackDismiss(isOpen && !dragging, close);

    const run = (a: SwipeAction) => {
        close();
        a.onAction();
    };

    const onPointerDown = (e: React.PointerEvent) => {
        // Reset first: a flag left by a cancelled swipe must not eat this tap.
        suppressClick.current = false;
        if (e.pointerType === "mouse") return;
        const w = rootRef.current?.clientWidth || window.innerWidth;
        widthRef.current = w;
        g.current = {
            x: e.clientX,
            y: e.clientY,
            base: offsetRef.current,
            axis: null,
            moved: false,
            w,
            samples: [{ x: e.clientX, t: e.timeStamp }],
        };
    };

    const addSample = (s: Gesture, x: number, t: number) => {
        s.samples.push({ x, t });
        while (s.samples.length > 1 && t - s.samples[0].t > VELOCITY_WINDOW_MS) {
            s.samples.shift();
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const s = g.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        addSample(s, e.clientX, e.timeStamp);
        if (!s.axis) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                s.axis = "x";
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
                setDragging(true);
            } else if (Math.abs(dy) > 10) {
                s.axis = "y";
            }
            return;
        }
        if (s.axis !== "x") return;
        s.moved = true;

        let next = s.base + dx;
        const min = trailing.length ? -s.w : 0;
        const max = leading.length ? s.w * 0.75 : 0;
        // Rubber-band past the action widths.
        if (next < -trailW) next = -trailW + (next + trailW) * RUBBER_BAND;
        if (next > leadW) next = leadW + (next - leadW) * RUBBER_BAND;
        setOffset(Math.max(min, Math.min(max, next)));
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const s = g.current;
        g.current = null;
        if (!s || s.axis !== "x") return;
        setDragging(false);
        if (s.moved) suppressClick.current = true;

        let vx = 0;
        if (e.type === "pointerup") {
            addSample(s, e.clientX, e.timeStamp);
            const first = s.samples[0];
            const last = s.samples[s.samples.length - 1];
            const dt = last.t - first.t;
            if (dt > 0) vx = (last.x - first.x) / dt;
        }

        const o = offsetRef.current;
        if (trailing.length && o < -s.w * FULL_SWIPE) {
            run(trailing[0]);
        } else if (leading.length && o > s.w * FULL_SWIPE) {
            run(leading[0]);
        } else if ((o < 0 && vx > FLICK_VELOCITY) || (o > 0 && vx < -FLICK_VELOCITY)) {
            // A flick back toward the content closes.
            close();
        } else if (
            trailing.length &&
            o < 0 &&
            (o < -trailW / 2 || vx < -FLICK_VELOCITY)
        ) {
            setOffset(-trailW);
        } else if (leading.length && o > 0 && (o > leadW / 2 || vx > FLICK_VELOCITY)) {
            setOffset(leadW);
        } else {
            close();
        }
    };

    const w = widthRef.current || Infinity;
    const fullTrailing = trailing.length > 0 && offset < -w * FULL_SWIPE;
    const fullLeading = leading.length > 0 && offset > w * FULL_SWIPE;

    return (
        <div ref={rootRef} className={cn("relative overflow-hidden", className)}>
            {leading.length ? (
                <div
                    className="absolute inset-y-0 left-0 flex"
                    style={{ width: Math.max(0, offset) }}
                    aria-hidden={offset <= 0}
                >
                    {leading.map((a, i) => (
                        <ActionButton
                            key={a.label}
                            action={a}
                            onRun={() => run(a)}
                            hidden={offset <= 0}
                            // During a full swipe the first action expands to fill the row.
                            grow={fullLeading ? i === 0 : true}
                            collapsed={fullLeading && i !== 0}
                        />
                    ))}
                </div>
            ) : null}
            {trailing.length ? (
                <div
                    // Reversed so the first action sits at the trailing edge.
                    className="absolute inset-y-0 right-0 flex flex-row-reverse"
                    style={{ width: Math.max(0, -offset) }}
                    aria-hidden={offset >= 0}
                >
                    {trailing.map((a, i) => (
                        <ActionButton
                            key={a.label}
                            action={a}
                            onRun={() => run(a)}
                            hidden={offset >= 0}
                            grow={fullTrailing ? i === 0 : true}
                            collapsed={fullTrailing && i !== 0}
                        />
                    ))}
                </div>
            ) : null}
            <div
                data-swiping={dragging || isOpen || undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClickCapture={(e) => {
                    if (suppressClick.current || offsetRef.current !== 0) {
                        suppressClick.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                        if (offsetRef.current !== 0) close();
                    }
                }}
                className="relative bg-inherit"
                style={{
                    transform: offset ? `translate3d(${offset}px,0,0)` : undefined,
                    transition: dragging ? "none" : "transform 380ms var(--motion-ios)",
                    touchAction: "pan-y",
                }}
            >
                {children}
            </div>
        </div>
    );
}

function ActionButton({
    action,
    onRun,
    hidden,
    grow = true,
    collapsed = false,
}: {
    action: SwipeAction;
    onRun: () => void;
    hidden: boolean;
    grow?: boolean;
    collapsed?: boolean;
}) {
    return (
        <button
            type="button"
            tabIndex={hidden ? -1 : 0}
            onClick={onRun}
            className={cn(
                "tap flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden text-white",
                "ease-ios transition-[flex-grow] duration-200",
                grow ? "flex-1" : "flex-none",
                collapsed && "w-0 flex-none",
                toneBg[action.tone]
            )}
        >
            <span aria-hidden className="[&_svg]:size-[22px]">
                {action.icon}
            </span>
            <span className="text-caption-1 font-medium whitespace-nowrap">
                {action.label}
            </span>
        </button>
    );
}
