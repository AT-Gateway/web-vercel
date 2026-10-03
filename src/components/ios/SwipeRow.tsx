"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

/**
 * Touch swipe actions (UITableView-style). Leading actions reveal on a
 * right swipe, trailing on a left swipe; a long trailing swipe runs the first
 * trailing action. Mouse and keyboard users reach the same actions through
 * the row's context menu.
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
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const g = useRef<{
        x: number;
        y: number;
        base: number;
        axis: "x" | "y" | null;
        moved: boolean;
    } | null>(null);
    const suppressClick = useRef(false);
    const offsetRef = useRef(0);
    offsetRef.current = offset;

    const leadW = leading.length * ACTION_WIDTH;
    const trailW = trailing.length * ACTION_WIDTH;

    // Only one row open at a time.
    useEffect(() => {
        const onOpen = (e: Event) => {
            if ((e as CustomEvent<string>).detail !== id) setOffset(0);
        };
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_EVENT, onOpen);
    }, [id]);

    const close = () => setOffset(0);

    const run = (a: SwipeAction) => {
        close();
        a.onAction();
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === "mouse") return;
        g.current = {
            x: e.clientX,
            y: e.clientY,
            base: offsetRef.current,
            axis: null,
            moved: false,
        };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const s = g.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
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
        const min = trailing.length ? -(trailW + 140) : 0;
        const max = leading.length ? leadW + 60 : 0;
        // Rubber-band past the action widths.
        if (next < -trailW) next = -trailW + (next + trailW) * 0.55;
        if (next > leadW) next = leadW + (next - leadW) * 0.35;
        setOffset(Math.max(min, Math.min(max, next)));
    };

    const onPointerUp = () => {
        const s = g.current;
        g.current = null;
        if (!s || s.axis !== "x") return;
        setDragging(false);
        if (s.moved) suppressClick.current = true;

        const o = offsetRef.current;
        if (trailing.length && o < -(trailW + 70)) {
            run(trailing[0]);
        } else if (trailing.length && o < -trailW / 2) {
            setOffset(-trailW);
        } else if (leading.length && o > leadW / 2) {
            setOffset(leadW);
        } else {
            close();
        }
    };

    const fullSwipe = trailing.length > 0 && offset < -(trailW + 70);

    return (
        <div className={cn("relative overflow-hidden", className)}>
            {leading.length ? (
                <div
                    className="absolute inset-y-0 left-0 flex"
                    style={{ width: Math.max(0, offset) }}
                    aria-hidden={offset <= 0}
                >
                    {leading.map((a) => (
                        <ActionButton
                            key={a.label}
                            action={a}
                            onRun={() => run(a)}
                            hidden={offset <= 0}
                        />
                    ))}
                </div>
            ) : null}
            {trailing.length ? (
                <div
                    className="absolute inset-y-0 right-0 flex justify-end"
                    style={{ width: Math.max(0, -offset) }}
                    aria-hidden={offset >= 0}
                >
                    {trailing.map((a, i) => (
                        <ActionButton
                            key={a.label}
                            action={a}
                            onRun={() => run(a)}
                            hidden={offset >= 0}
                            // During a full swipe the first action expands to fill the row.
                            grow={fullSwipe ? i === 0 : true}
                            collapsed={fullSwipe && i !== 0}
                        />
                    ))}
                </div>
            ) : null}
            <div
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
