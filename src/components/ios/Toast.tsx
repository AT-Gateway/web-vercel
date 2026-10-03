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
            window.setTimeout(() => dismiss(id), t.duration ?? VISIBLE_MS);
        },
        [dismiss]
    );

    return (
        <ToastContext.Provider value={show}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center px-4 pt-[calc(var(--safe-top)+10px)]"
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
                item.onPress?.();
                onDismiss();
            }}
            onPointerDown={(e) => {
                startY.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
                if (startY.current === null) return;
                setDragY(Math.min(0, e.clientY - startY.current));
            }}
            onPointerUp={() => {
                if (dragY < -24) onDismiss();
                else setDragY(0);
                startY.current = null;
            }}
            className={cn(
                "glass-strong pointer-events-auto absolute flex max-w-[min(420px,100%)] min-w-[180px] items-center gap-3 rounded-full py-2.5 pr-5 pl-4 text-left",
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
