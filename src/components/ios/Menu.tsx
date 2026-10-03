"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuItem = {
    label: string;
    icon?: React.ReactNode;
    /**
     * iOS 27 hides menu icons by default and shows them only for key actions.
     * Set this to surface `icon` for the item.
     */
    keyAction?: boolean;
    onSelect: () => void;
    destructive?: boolean;
    checked?: boolean;
    disabled?: boolean;
};

/** Each inner array is a section, separated by a thick divider like UIMenu. */
export type MenuSections = MenuItem[][];

const ITEM_HEIGHT = 44;
const SECTION_GAP = 8;

function MenuList({
    sections,
    onClose,
    label,
    title,
}: {
    sections: MenuSections;
    onClose: () => void;
    label: string;
    /** Optional non-interactive header, like UIMenu's title. */
    title?: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const visible = sections.filter((s) => s.length > 0);
    const hasChecks = visible.some((s) => s.some((i) => i.checked !== undefined));

    useLayoutEffect(() => {
        ref.current
            ?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
            ?.focus();
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const items = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
                '[role^="menuitem"]:not([disabled])'
            ) ?? []
        );
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            items[(i + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            items[(i - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Home") {
            e.preventDefault();
            items[0]?.focus();
        } else if (e.key === "End") {
            e.preventDefault();
            items[items.length - 1]?.focus();
        }
    };

    return (
        <div
            ref={ref}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            className="glass-strong w-[250px] overflow-hidden rounded-[22px] py-1.5 shadow-[var(--menu-shadow)]"
        >
            {title ? (
                <div className="hairline-b text-footnote text-label-2 px-4 pt-1.5 pb-2">
                    {title}
                </div>
            ) : null}
            {visible.map((section, si) => (
                <div key={si} role="group">
                    {si > 0 ? (
                        <div
                            aria-hidden
                            className="bg-fill-4 mx-0 my-1 h-2"
                            style={{ height: SECTION_GAP }}
                        />
                    ) : null}
                    {section.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role={
                                item.checked !== undefined ? "menuitemradio" : "menuitem"
                            }
                            aria-checked={item.checked}
                            disabled={item.disabled}
                            onClick={() => {
                                onClose();
                                // Let the menu close before running actions that open other UI.
                                window.setTimeout(item.onSelect, 0);
                            }}
                            className={cn(
                                "tap text-body flex w-full items-center gap-3 px-4 text-left outline-none",
                                "focus-visible:bg-fill-3 active:bg-fill-3 disabled:text-label-3",
                                item.destructive ? "text-red" : "text-label"
                            )}
                            style={{ minHeight: ITEM_HEIGHT }}
                        >
                            {hasChecks ? (
                                <span className="flex w-4 shrink-0 justify-center">
                                    {item.checked ? (
                                        <Check className="size-4" strokeWidth={2.6} />
                                    ) : null}
                                </span>
                            ) : null}
                            {item.icon && item.keyAction ? (
                                <span
                                    aria-hidden
                                    className="flex w-5 shrink-0 justify-center [&_svg]:size-[19px]"
                                >
                                    {item.icon}
                                </span>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Pull-down menu attached to a button (UIMenu / SwiftUI Menu). */
export function Menu({
    trigger,
    sections,
    label,
    align = "end",
    side = "bottom",
}: {
    trigger: React.ReactElement;
    sections: MenuSections;
    label: string;
    align?: "start" | "center" | "end";
    side?: "top" | "bottom";
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>{trigger}</Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align={align}
                    side={side}
                    sideOffset={8}
                    collisionPadding={12}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    className="data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in z-[80] origin-(--radix-popover-content-transform-origin) outline-none"
                >
                    <MenuList
                        sections={sections}
                        label={label}
                        onClose={() => setOpen(false)}
                    />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

type ContextMenuState = { rect: DOMRect } | null;

/**
 * Long-press (touch) or right-click (mouse) context menu with a lifted preview
 * over a blurred backdrop, like UIContextMenuInteraction.
 *
 * Spread `triggerProps` onto the target element and render `node` anywhere.
 */
export function useContextMenu({
    sections,
    label,
    title,
    renderPreview,
    align = "start",
    disabled,
}: {
    sections: MenuSections;
    label: string;
    title?: React.ReactNode;
    renderPreview?: () => React.ReactNode;
    align?: "start" | "end";
    disabled?: boolean;
}) {
    const [state, setState] = useState<ContextMenuState>(null);
    const targetRef = useRef<HTMLElement | null>(null);
    const press = useRef<{ x: number; y: number; timer: number } | null>(null);
    const suppressClick = useRef(false);

    const openAt = useCallback(() => {
        const el = targetRef.current;
        if (!el || disabled) return;
        navigator.vibrate?.(10);
        setState({ rect: el.getBoundingClientRect() });
    }, [disabled]);

    const cancelPress = () => {
        if (press.current) window.clearTimeout(press.current.timer);
        press.current = null;
    };

    const triggerProps = {
        ref: (el: HTMLElement | null) => {
            targetRef.current = el;
        },
        onContextMenu: (e: React.MouseEvent) => {
            if (disabled) return;
            e.preventDefault();
            cancelPress();
            openAt();
        },
        onPointerDown: (e: React.PointerEvent) => {
            if (disabled || e.pointerType === "mouse") return;
            cancelPress();
            const timer = window.setTimeout(() => {
                suppressClick.current = true;
                press.current = null;
                openAt();
            }, 450);
            press.current = { x: e.clientX, y: e.clientY, timer };
        },
        onPointerMove: (e: React.PointerEvent) => {
            const p = press.current;
            if (!p) return;
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onClickCapture: (e: React.MouseEvent) => {
            if (suppressClick.current) {
                suppressClick.current = false;
                e.preventDefault();
                e.stopPropagation();
            }
        },
        onKeyDown: (e: React.KeyboardEvent) => {
            // Keyboard access: Shift+F10 or the context-menu key.
            if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
                e.preventDefault();
                openAt();
            }
        },
    };

    const close = () => setState(null);

    let node: React.ReactNode = null;
    if (state) {
        const { rect } = state;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const visible = sections.filter((s) => s.length);
        const menuH =
            visible.reduce((n, s) => n + s.length * ITEM_HEIGHT, 0) +
            (visible.length - 1) * SECTION_GAP +
            (title ? 36 : 0) +
            12;
        const gap = 10;
        const top0 =
            12 +
            (parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue("--safe-top")
            ) || 0);
        const previewH = renderPreview ? rect.height : 0;

        let previewTop = rect.top;
        let menuTop = rect.bottom + gap;
        if (menuTop + menuH > vh - 16) {
            if (rect.top - gap - menuH >= top0 && !renderPreview) {
                menuTop = rect.top - gap - menuH;
            } else {
                // Shift the preview up so both fit, keeping the preview on screen.
                previewTop = Math.max(top0, vh - 16 - menuH - gap - previewH);
                menuTop = previewTop + previewH + gap;
            }
        }
        const menuLeft =
            align === "end"
                ? Math.max(12, Math.min(vw - 262, rect.right - 250))
                : Math.max(12, Math.min(vw - 262, rect.left));

        node = (
            <Dialog.Root open onOpenChange={(o) => !o && close()}>
                <Dialog.Portal>
                    <Dialog.Overlay
                        className="animate-fade-in fixed inset-0 z-[80] bg-[var(--scrim)] backdrop-blur-[14px]"
                        onClick={close}
                    />
                    <Dialog.Content
                        aria-describedby={undefined}
                        className="fixed inset-0 z-[80] outline-none"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) close();
                        }}
                    >
                        <Dialog.Title className="sr-only">{label}</Dialog.Title>
                        {renderPreview ? (
                            <div
                                aria-hidden
                                className="animate-pop-in pointer-events-none fixed"
                                style={{
                                    top: previewTop,
                                    left: rect.left,
                                    width: rect.width,
                                    height: rect.height,
                                    transformOrigin:
                                        align === "end" ? "right center" : "left center",
                                }}
                            >
                                {renderPreview()}
                            </div>
                        ) : null}
                        <div
                            className="animate-pop-in fixed"
                            style={{
                                top: menuTop,
                                left: menuLeft,
                                transformOrigin:
                                    align === "end" ? "top right" : "top left",
                            }}
                        >
                            <MenuList
                                sections={sections}
                                label={label}
                                title={title}
                                onClose={close}
                            />
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        );
    }

    return { triggerProps, node, isOpen: Boolean(state) };
}
