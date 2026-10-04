"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error";
type ToastInput = {
    title: string;
    body?: string;
    tone?: ToastTone;
    /** Runs when the banner is tapped (before it dismisses). */
    onPress?: () => void;
    /** How long it stays up, in ms. */
    duration?: number;
    icon?: React.ReactNode;
};
type ToastItem = ToastInput & { id: number; leaving: boolean };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
    return useContext(ToastContext);
}

const VISIBLE_MS = 2600;

/** iOS 26-style status banner: a glass capsule that drops in from the top. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 320);
    }, []);

    const show = useCallback(
        (t: ToastInput) => {
            const id = nextId.current++;
            // Only one banner at a time; a new one replaces the old.
            setItems((prev) => [
                ...prev.map((p) => ({ ...p, leaving: true })),
                { ...t, id, leaving: false },
            ]);
            window.setTimeout(
                () => setItems((prev) => prev.filter((p) => p.id === id || !p.leaving)),
                320
            );
            // Long enough to read: errors stay longer, plus ~30ms per body char.
            const duration =
                t.duration ??
                Math.min(
                    7000,
                    (t.tone === "error" ? 4500 : VISIBLE_MS) + (t.body?.length ?? 0) * 30
                );
            window.setTimeout(() => dismiss(id), duration);
        },
        [dismiss]
    );

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center pt-[calc(var(--safe-top)+10px)] pr-[calc(16px+var(--safe-right))] pl-[calc(16px+var(--safe-left))]"
                // Follow the visual viewport (iOS scrolls it when the keyboard opens).
                style={{ top: "var(--vvt, 0px)" }}
            >
                {items.map((t) => (
                    <Banner key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function Banner({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
    const startY = useRef<number | null>(null);
    const [dragY, setDragY] = useState(0);
    // A drag (not a tap) must never run onPress.
    const moved = useRef(false);
    const last = useRef<{ y: number; t: number } | null>(null);
    const prev = useRef<{ y: number; t: number } | null>(null);

    useEffect(() => {
        if (item.leaving) setDragY(0);
    }, [item.leaving]);

    const icon =
        item.icon ??
        (item.tone === "success" ? (
            <CircleCheck className="text-green size-5" strokeWidth={2.4} />
        ) : item.tone === "error" ? (
            <CircleAlert className="text-red size-5" strokeWidth={2.4} />
        ) : null);

    return (
        <button
            type="button"
            onClick={() => {
                if (moved.current) {
                    moved.current = false;
                    return;
                }
                item.onPress?.();
                onDismiss();
            }}
            onPointerDown={(e) => {
                startY.current = e.clientY;
                moved.current = false;
                last.current = { y: e.clientY, t: e.timeStamp };
                prev.current = null;
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
                if (startY.current === null) return;
                const dy = e.clientY - startY.current;
                moved.current ||= Math.abs(dy) > 6;
                prev.current = last.current;
                last.current = { y: e.clientY, t: e.timeStamp };
                setDragY(Math.min(0, dy));
            }}
            onPointerUp={(e) => {
                // Upward velocity over the last move sample, in px/ms.
                const from = prev.current ?? last.current;
                const dt = from ? e.timeStamp - from.t : 0;
                const velocity = from && dt > 0 ? (from.y - e.clientY) / dt : 0;
                if (dragY < -24 || (moved.current && velocity > 0.3)) onDismiss();
                else setDragY(0);
                startY.current = null;
                last.current = null;
                prev.current = null;
            }}
            onPointerCancel={() => {
                startY.current = null;
                setDragY(0);
            }}
            className={cn(
                "glass-strong pointer-events-auto absolute flex max-w-[min(420px,calc(100%-32px-var(--safe-left)-var(--safe-right)))] min-w-[180px] touch-none items-center gap-3 rounded-full py-2.5 pr-5 pl-4 text-left select-none",
                item.leaving ? "animate-banner-out" : "animate-banner-in",
                !icon && "pl-5"
            )}
            style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        >
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <span className="flex min-w-0 flex-col">
                <span className="text-subhead truncate font-semibold">{item.title}</span>
                {item.body ? (
                    <span className="text-footnote text-label-2 line-clamp-2">
                        {item.body}
                    </span>
                ) : null}
            </span>
        </button>
    );
}
