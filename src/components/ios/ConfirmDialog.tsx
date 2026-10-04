"use client";

import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { useBackDismiss } from "@/hooks/useBackDismiss";

export type ConfirmOptions = {
    title: string;
    message?: string;
    confirmLabel: string;
    destructive?: boolean;
};

/**
 * Destructive confirmation: an action sheet anchored to the bottom on iPhone,
 * a centered alert on wider screens — as UIKit presents confirmationDialog.
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    message,
    confirmLabel,
    destructive = true,
    onConfirm,
}: ConfirmOptions & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}) {
    const compact = useIsCompact();
    useBackDismiss(open, () => onOpenChange(false));

    const confirm = () => {
        // Confirm first: useConfirm resolves on the first call it receives.
        onConfirm();
        onOpenChange(false);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-[70] bg-[var(--scrim)]" />
                {compact ? (
                    <Dialog.Content
                        className={cn(
                            "fixed inset-x-2 bottom-0 z-[70] flex flex-col gap-2 pb-[max(8px,var(--safe-bottom))] outline-none",
                            "data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
                        )}
                    >
                        <div className="glass-strong overflow-hidden rounded-[22px]">
                            <div className="px-4 pt-3.5 pb-3 text-center">
                                <Dialog.Title className="text-footnote text-label-2 font-semibold">
                                    {title}
                                </Dialog.Title>
                                {message ? (
                                    <Dialog.Description className="text-footnote text-label-2 mt-1">
                                        {message}
                                    </Dialog.Description>
                                ) : (
                                    <Dialog.Description className="sr-only">
                                        {title}
                                    </Dialog.Description>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={confirm}
                                className={cn(
                                    "tap hairline-t text-title-3 active:bg-fill-3 min-h-[57px] w-full",
                                    destructive ? "text-red" : "text-tint"
                                )}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                autoFocus
                                className="tap glass-strong text-title-3 text-tint min-h-[57px] w-full rounded-[22px] font-semibold active:brightness-95"
                            >
                                Cancel
                            </button>
                        </Dialog.Close>
                    </Dialog.Content>
                ) : (
                    <Dialog.Content
                        className={cn(
                            "glass-strong fixed top-1/2 left-1/2 z-[70] w-[300px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] outline-none",
                            "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
                        )}
                    >
                        <div className="px-5 pt-5 pb-4 text-center">
                            <Dialog.Title className="text-headline">{title}</Dialog.Title>
                            {message ? (
                                <Dialog.Description className="text-footnote text-label mt-1">
                                    {message}
                                </Dialog.Description>
                            ) : (
                                <Dialog.Description className="sr-only">
                                    {title}
                                </Dialog.Description>
                            )}
                        </div>
                        <div className="flex gap-2 px-4 pb-4">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    autoFocus
                                    className="tap bg-fill-3 text-body min-h-11 flex-1 rounded-full font-semibold active:brightness-90"
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="button"
                                onClick={confirm}
                                className={cn(
                                    "tap text-body min-h-11 flex-1 rounded-full font-semibold text-white active:brightness-90",
                                    destructive ? "bg-red" : "bg-tint"
                                )}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </Dialog.Content>
                )}
            </Dialog.Portal>
        </Dialog.Root>
    );
}

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void };

/**
 * Imperative helper: `const [dialog, confirm, cancel] = useConfirm(); await confirm({...})`.
 *
 * `cancel()` resolves a pending confirm as `false` and removes the dialog
 * (call it when the owning screen closes). Each promise resolves exactly once;
 * asking again while one is pending resolves the old one as `false`.
 */
export function useConfirm(): [
    React.ReactNode,
    (opts: ConfirmOptions) => Promise<boolean>,
    () => void,
] {
    const [state, setState] = React.useState<PendingConfirm | null>(null);
    const [open, setOpen] = React.useState(false);
    // Mirrors `state`, updated synchronously so ask/cancel never see a stale one.
    const stateRef = React.useRef<PendingConfirm | null>(null);

    const ask = React.useCallback(
        (opts: ConfirmOptions) =>
            new Promise<boolean>((settle) => {
                stateRef.current?.resolve(false);
                let done = false;
                const resolve = (v: boolean) => {
                    if (done) return;
                    done = true;
                    settle(v);
                };
                const next = { ...opts, resolve };
                stateRef.current = next;
                setState(next);
                setOpen(true);
            }),
        []
    );

    const cancel = React.useCallback(() => {
        stateRef.current?.resolve(false);
        stateRef.current = null;
        setOpen(false);
        setState(null);
    }, []);

    const node = state ? (
        <ConfirmDialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) state.resolve(false);
            }}
            title={state.title}
            message={state.message}
            confirmLabel={state.confirmLabel}
            destructive={state.destructive}
            onConfirm={() => state.resolve(true)}
        />
    ) : null;

    return [node, ask, cancel];
}
