"use client";

import React, { createContext, useContext, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { useBackDismiss } from "@/hooks/useBackDismiss";

type SheetKind = "drawer" | "dialog";
const SheetKindContext = createContext<SheetKind>("dialog");

type SheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** "large" fills the screen on iPhone; "auto" hugs its content. */
    detent?: "large" | "auto";
    /** Accessible description for screen readers. */
    description?: string;
    children: React.ReactNode;
    className?: string;
    /**
     * Android system Back. Defaults to closing the sheet; set it to handle Back
     * inside the sheet first (e.g. pop a Settings page).
     */
    onBack?: () => void;
};

/**
 * Modal sheet: a draggable bottom sheet on compact widths (with the iOS
 * card-stack background scale), a centered form sheet on regular widths.
 */
export function Sheet({
    open,
    onOpenChange,
    detent = "large",
    description,
    children,
    className,
    onBack,
}: SheetProps) {
    useBackDismiss(open, () => (onBack ?? (() => onOpenChange(false)))());

    // Freeze the container kind while open: switching between the vaul drawer
    // and the Radix dialog mid-presentation (rotation, split resize) would
    // remount the content and lose its state. `null` = follow the live value
    // (a sheet that mounts open follows it until it first closes).
    const compactNow = useIsCompact();
    const [frozen, setFrozen] = useState<boolean | null>(open ? null : compactNow);
    if (!open && frozen !== compactNow) setFrozen(compactNow);
    const compact = frozen ?? compactNow;

    if (compact) {
        return (
            <SheetKindContext.Provider value="drawer">
                <Drawer.Root
                    open={open}
                    onOpenChange={onOpenChange}
                    shouldScaleBackground
                    setBackgroundColorOnScale={false}
                    repositionInputs={false}
                >
                    <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
                        <Drawer.Content
                            aria-describedby={undefined}
                            className={cn(
                                "elevated bg-grouped px-safe fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-visible rounded-t-[38px] outline-none",
                                "shadow-[0_-10px_40px_rgb(0_0_0/0.18)]",
                                // 24px top gap lets the scaled card behind peek out.
                                detent === "large"
                                    ? "h-[calc(var(--vvh,100dvh)-var(--safe-top)-24px)]"
                                    : "max-h-[calc(var(--vvh,100dvh)-var(--safe-top)-24px)]",
                                className
                            )}
                            // Sit on top of the on-screen keyboard (--kb from useVisualViewport).
                            style={{ bottom: "var(--kb, 0px)" }}
                        >
                            {description ? (
                                <Drawer.Description className="sr-only">
                                    {description}
                                </Drawer.Description>
                            ) : null}
                            <div
                                aria-hidden
                                className="bg-label-3 absolute top-[5px] left-1/2 z-40 h-[5px] w-9 -translate-x-1/2 rounded-full"
                            />
                            {/* overflow: clip (not hidden) can't be scrolled by focus(),
                                so autofocusing a field mid-animation can't shift the
                                content sideways; vaul's ::after filler stays visible. */}
                            <div className="flex min-h-0 flex-1 flex-col overflow-clip rounded-t-[38px]">
                                {children}
                            </div>
                        </Drawer.Content>
                    </Drawer.Portal>
                </Drawer.Root>
            </SheetKindContext.Provider>
        );
    }

    return (
        <SheetKindContext.Provider value="dialog">
            <Dialog.Root open={open} onOpenChange={onOpenChange}>
                <Dialog.Portal>
                    <Dialog.Overlay className="data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[14px]" />
                    <Dialog.Content
                        aria-describedby={undefined}
                        className={cn(
                            "elevated fixed top-1/2 left-1/2 z-50 flex w-[min(560px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col",
                            "bg-grouped overflow-visible rounded-[32px] shadow-[var(--menu-shadow)] outline-none",
                            "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
                            detent === "large"
                                ? "h-[min(760px,calc(100dvh-64px))]"
                                : "max-h-[calc(100dvh-64px)]",
                            className
                        )}
                    >
                        {description ? (
                            <Dialog.Description className="sr-only">
                                {description}
                            </Dialog.Description>
                        ) : null}
                        <div className="flex min-h-0 flex-1 flex-col overflow-clip rounded-[32px]">
                            {children}
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </SheetKindContext.Provider>
    );
}

/** The title primitive for whichever container the sheet is using. */
export function SheetTitle({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const kind = useContext(SheetKindContext);
    const Title = kind === "drawer" ? Drawer.Title : Dialog.Title;
    return <Title className={className}>{children}</Title>;
}

/** Sheet navigation bar: Cancel · Title · Done. */
export function SheetHeader({
    title,
    leading,
    trailing,
    className,
}: {
    title: React.ReactNode;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "relative z-30 flex min-h-[64px] shrink-0 items-center gap-2 px-4 pt-3 pb-2",
                className
            )}
        >
            <div className="flex min-w-fit flex-1 justify-start">{leading}</div>
            <SheetTitle className="text-headline min-w-0 shrink truncate text-center">
                {title}
            </SheetTitle>
            <div className="flex min-w-fit flex-1 justify-end">{trailing}</div>
        </div>
    );
}

/** Scrollable sheet body that leaves room for the home indicator. */
export function SheetBody({
    children,
    className,
    ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            {...rest}
            className={cn(
                "pb-safe-kb min-h-0 flex-1 overflow-y-auto overscroll-contain",
                className
            )}
        >
            {children}
        </div>
    );
}
