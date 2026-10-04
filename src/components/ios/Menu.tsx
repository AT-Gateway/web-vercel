"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackDismiss } from "@/hooks/useBackDismiss";

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
/** Rendered height of a section divider: h-2 plus my-1. */
const SECTION_DIVIDER_H = 16;
const MENU_W = 250;

function MenuList({
    sections,
    onClose,
    label,
    title,
    autoFocusFirst = true,
    keepFocus = false,
}: {
    sections: MenuSections;
    onClose: () => void;
    label: string;
    /** Optional non-interactive header, like UIMenu's title. */
    title?: React.ReactNode;
    /** Focus the first item on open (keyboard access). */
    autoFocusFirst?: boolean;
    /** Items never take focus on press, so the focused field keeps the keyboard. */
    keepFocus?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const visible = sections.filter((s) => s.length > 0);
    const hasChecks = visible.some((s) => s.some((i) => i.checked !== undefined));

    useLayoutEffect(() => {
        if (!autoFocusFirst) return;
        ref.current
            ?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
            ?.focus();
        // Only on open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            className={cn(
                "glass-strong w-[250px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[22px] py-1.5 shadow-[var(--menu-shadow)]",
                // Safety net: never taller than the visible viewport.
                "max-h-[calc(var(--vvh,100dvh)-var(--safe-top)-var(--safe-bottom)-24px)]"
            )}
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
                            onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
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

type TriggerHandlers = {
    onPointerDown?: (e: React.PointerEvent) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
};

function compose<E>(a: ((e: E) => void) | undefined, b: (e: E) => void) {
    return (e: E) => {
        a?.(e);
        b(e);
    };
}

/** Pull-down menu attached to a button (UIMenu / SwiftUI Menu). */
export function Menu({
    trigger,
    sections,
    label,
    align = "end",
    side = "bottom",
    keepFocus = false,
}: {
    trigger: React.ReactElement;
    sections: MenuSections;
    label: string;
    align?: "start" | "center" | "end";
    side?: "top" | "bottom";
    /**
     * Never take focus from the currently focused field (the composer keeps
     * the keyboard). Keyboard-opened menus still focus their first item.
     */
    keepFocus?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const openedBy = useRef<"pointer" | "keyboard">("pointer");
    useBackDismiss(open, () => setOpen(false));

    const tp = trigger.props as TriggerHandlers;
    const wrappedTrigger = React.cloneElement(
        trigger as React.ReactElement<TriggerHandlers>,
        {
            onPointerDown: compose(tp.onPointerDown, () => {
                openedBy.current = "pointer";
            }),
            onKeyDown: compose(tp.onKeyDown, (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                    openedBy.current = "keyboard";
                }
            }),
            ...(keepFocus
                ? {
                      onMouseDown: compose(tp.onMouseDown, (e: React.MouseEvent) =>
                          e.preventDefault()
                      ),
                  }
                : {}),
        }
    );
    // Read at render time: the opening click/keypress has already set it.
    // eslint-disable-next-line react-hooks/refs
    const autoFocusFirst = !keepFocus || openedBy.current === "keyboard";

    return (
        <>
            <Popover.Root open={open} onOpenChange={setOpen}>
                <Popover.Trigger asChild>{wrappedTrigger}</Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        align={align}
                        side={side}
                        sideOffset={8}
                        collisionPadding={12}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        // The tap-catcher below closes the menu; don't let Radix's
                        // deferred outside-click dismissal run as well.
                        onInteractOutside={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => {
                            if (keepFocus && openedBy.current !== "keyboard") {
                                e.preventDefault();
                            }
                        }}
                        className="data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in z-[80] origin-(--radix-popover-content-transform-origin) outline-none"
                    >
                        <MenuList
                            sections={sections}
                            label={label}
                            onClose={() => setOpen(false)}
                            autoFocusFirst={autoFocusFirst}
                            keepFocus={keepFocus}
                        />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
            {open && typeof document !== "undefined"
                ? createPortal(
                      // Tap-catcher (UIKit dims nothing but swallows the dismissing
                      // tap): an outside tap only closes the menu, never activates
                      // what's underneath (trigger included), scrolling underneath is
                      // blocked, and preventDefault keeps a focused field focused.
                      // React events still bubble to ancestors through the portal, so
                      // stop them before an enclosing vaul drawer starts a drag.
                      <div
                          aria-hidden
                          className="fixed inset-0 z-[79]"
                          style={{ touchAction: "none", pointerEvents: "auto" }}
                          onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                          }}
                          onPointerMove={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                              e.stopPropagation();
                              setOpen(false);
                          }}
                      />,
                      document.body
                  )
                : null}
        </>
    );
}

type ContextMenuState = { rect: DOMRect } | null;

const CLOSE_MS = 180;

function cssPx(cs: CSSStyleDeclaration, name: string): number {
    return parseFloat(cs.getPropertyValue(name)) || 0;
}

/**
 * Long-press (touch) or right-click (mouse) context menu with a lifted preview
 * over a blurred backdrop, like UIContextMenuInteraction.
 *
 * Spread `triggerProps` onto the target element and render `node` anywhere.
 * `open()` opens it programmatically, anchored to the trigger element.
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
    /** `clipped`: the preview was shortened to fit above the menu (top-align it). */
    renderPreview?: (o: { clipped: boolean }) => React.ReactNode;
    align?: "start" | "end";
    disabled?: boolean;
}) {
    const [state, setState] = useState<ContextMenuState>(null);
    const [closing, setClosing] = useState(false);
    const [measuredH, setMeasuredH] = useState<number | null>(null);
    const closingRef = useRef(false);
    const closeTimer = useRef<number | null>(null);
    const openWidth = useRef(0);
    const targetRef = useRef<HTMLElement | null>(null);
    const press = useRef<{ x: number; y: number; timer: number } | null>(null);
    const suppressClick = useRef(false);

    const openAt = useCallback(() => {
        const el = targetRef.current;
        if (!el || disabled) return;
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
        closingRef.current = false;
        setClosing(false);
        setMeasuredH(null);
        navigator.vibrate?.(10);
        openWidth.current = window.innerWidth;
        setState({ rect: el.getBoundingClientRect() });
    }, [disabled]);

    const close = useCallback(() => {
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
        closeTimer.current = window.setTimeout(() => {
            closeTimer.current = null;
            closingRef.current = false;
            setState(null);
            setClosing(false);
            setMeasuredH(null);
        }, CLOSE_MS);
    }, []);

    useEffect(
        () => () => {
            if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
            if (press.current) window.clearTimeout(press.current.timer);
        },
        []
    );

    useBackDismiss(Boolean(state) && !closing, close);

    // Rotation leaves stale coordinates: close. Width-only, because the
    // Android keyboard hiding (the menu takes focus) also resizes the window.
    useEffect(() => {
        if (!state) return;
        const onResize = () => {
            if (Math.abs(window.innerWidth - openWidth.current) > 1) close();
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", close);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("orientationchange", close);
        };
    }, [state, close]);

    const cancelPress = () => {
        if (press.current) window.clearTimeout(press.current.timer);
        press.current = null;
    };

    const triggerProps = {
        ref: (el: HTMLElement | null) => {
            targetRef.current = el;
        },
        onContextMenu: (e: React.MouseEvent) => {
            if (state) {
                e.preventDefault();
                return;
            }
            if (disabled) return;
            e.preventDefault();
            cancelPress();
            openAt();
        },
        onPointerDown: (e: React.PointerEvent) => {
            // Reset first: a stale flag from an earlier long-press must not eat
            // the next (mouse or disabled) click.
            suppressClick.current = false;
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

    // Measure the real menu height once mounted (the portal mounts a tick
    // later, so a callback ref rather than a layout effect).
    const measureMenu = (el: HTMLDivElement | null) => {
        if (!el) return;
        const h = el.offsetHeight;
        if (h && h !== measuredH) setMeasuredH(h);
    };

    let node: React.ReactNode = null;
    if (state) {
        const { rect } = state;
        // Fixed positioning is relative to the layout viewport; keep within the
        // visible part of it (the keyboard shrinks/offsets the visual viewport).
        const vv = window.visualViewport;
        const vh = vv?.height ?? window.innerHeight;
        const vTop = vv?.offsetTop ?? 0;
        const vw = window.innerWidth;
        const cs = getComputedStyle(document.documentElement);
        const safeTop = cssPx(cs, "--safe-top");
        const safeBottom = cssPx(cs, "--safe-bottom");
        const safeLeft = cssPx(cs, "--safe-left");
        const safeRight = cssPx(cs, "--safe-right");

        const visible = sections.filter((s) => s.length);
        const estimatedH =
            visible.reduce((n, s) => n + s.length * ITEM_HEIGHT, 0) +
            Math.max(0, visible.length - 1) * SECTION_DIVIDER_H +
            (title ? 36 : 0) +
            12;
        const menuH = measuredH ?? estimatedH;
        const gap = 10;
        const top0 = vTop + 12 + safeTop;
        const bottomLimit = vTop + vh - safeBottom - 12;

        let previewTop = rect.top;
        let previewH = 0;
        let clipped = false;
        let menuTop: number;
        let placedAbove = false;

        if (renderPreview) {
            previewH = rect.height;
            const avail = bottomLimit - top0 - gap - menuH;
            if (previewH > avail) {
                previewH = Math.max(avail, 80);
                clipped = true;
            }
            previewTop = Math.max(
                top0,
                Math.min(rect.top, bottomLimit - menuH - gap - previewH)
            );
            menuTop = Math.min(previewTop + previewH + gap, bottomLimit - menuH);
        } else {
            menuTop = rect.bottom + gap;
            if (menuTop + menuH > bottomLimit) {
                if (rect.top - gap - menuH >= top0) {
                    menuTop = rect.top - gap - menuH;
                    placedAbove = true;
                } else {
                    menuTop = bottomLimit - menuH;
                }
            }
            menuTop = Math.max(top0, menuTop);
        }

        const minLeft = 12 + safeLeft;
        const maxLeft = vw - (MENU_W + 12) - safeRight;
        const menuLeft = Math.max(
            minLeft,
            Math.min(maxLeft, align === "end" ? rect.right - MENU_W : rect.left)
        );
        const side = align === "end" ? "right" : "left";

        node = (
            <Dialog.Root open onOpenChange={(o) => !o && close()}>
                <Dialog.Portal>
                    <Dialog.Overlay
                        className={cn(
                            "fixed inset-0 z-[80] bg-[var(--scrim)] backdrop-blur-[14px]",
                            closing
                                ? "animate-fade-out pointer-events-none"
                                : "animate-fade-in"
                        )}
                        onClick={close}
                    />
                    <Dialog.Content
                        aria-describedby={undefined}
                        className={cn(
                            "fixed inset-0 z-[80] outline-none",
                            closing && "pointer-events-none"
                        )}
                        onClick={(e) => {
                            if (e.target === e.currentTarget) close();
                        }}
                    >
                        <Dialog.Title className="sr-only">{label}</Dialog.Title>
                        {renderPreview ? (
                            <div
                                aria-hidden
                                className={cn(
                                    "pointer-events-none fixed",
                                    closing ? "animate-pop-out" : "animate-pop-in"
                                )}
                                style={{
                                    top: previewTop,
                                    left: rect.left,
                                    width: rect.width,
                                    height: previewH,
                                    transformOrigin: `${side} center`,
                                    ...(clipped
                                        ? {
                                              overflow: "hidden",
                                              maskImage:
                                                  "linear-gradient(#000 calc(100% - 48px), transparent)",
                                              WebkitMaskImage:
                                                  "linear-gradient(#000 calc(100% - 48px), transparent)",
                                          }
                                        : null),
                                }}
                            >
                                {renderPreview({ clipped })}
                            </div>
                        ) : null}
                        <div
                            ref={measureMenu}
                            className={cn(
                                "fixed",
                                closing ? "animate-pop-out" : "animate-pop-in"
                            )}
                            style={{
                                top: menuTop,
                                left: menuLeft,
                                transformOrigin: `${placedAbove ? "bottom" : "top"} ${side}`,
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

    // isOpen stays true through the close animation so the source stays hidden.
    return { triggerProps, node, isOpen: Boolean(state), open: openAt };
}
