"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Container for inset-grouped sections (Settings-app style). */
export function List({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-[35px] px-4 pb-10", className)}>
            {children}
        </div>
    );
}

export function Section({
    header,
    footer,
    children,
    className,
}: {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("flex flex-col", className)}>
            {header ? (
                <h3 className="text-footnote text-label-2 mb-[7px] px-4 font-normal uppercase">
                    {header}
                </h3>
            ) : null}
            <div className="bg-cell overflow-hidden rounded-[22px]">{children}</div>
            {footer ? (
                <div className="text-footnote text-label-2 mt-[7px] px-4">{footer}</div>
            ) : null}
        </section>
    );
}

/** Rounded-square colored glyph tile used as a row's leading icon. */
export function IconTile({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "flex size-[29px] shrink-0 items-center justify-center rounded-[8px] text-white [&_svg]:size-[18px]",
                className
            )}
        >
            {children}
        </span>
    );
}

type RowProps = {
    icon?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    value?: React.ReactNode;
    accessory?: "chevron" | React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    /** Action rows: blue (tint) or red (destructive) title. */
    tone?: "default" | "tint" | "red";
    centered?: boolean;
    className?: string;
    /** For wrapping a native control with a <label>. */
    as?: "label";
    ariaLabel?: string;
};

export function Row({
    icon,
    title,
    subtitle,
    value,
    accessory,
    onClick,
    disabled,
    tone = "default",
    centered,
    className,
    as,
    ariaLabel,
}: RowProps) {
    const interactive = Boolean(onClick) && !disabled;
    const content = (
        <>
            {icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
            <span
                className={cn(
                    "relative flex min-h-11 min-w-0 flex-1 items-center gap-3 py-[11px] pr-4",
                    // Separator inset to the text, hidden on the last row.
                    "after:bg-separator after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[0.5px] after:content-['']",
                    "group-last/row:after:hidden",
                    centered && "justify-center pr-0"
                )}
            >
                <span className={cn("flex min-w-0 flex-col", !centered && "flex-1")}>
                    <span
                        className={cn(
                            "text-body truncate",
                            tone === "tint" && "text-tint",
                            tone === "red" && "text-red",
                            disabled && "text-label-3"
                        )}
                    >
                        {title}
                    </span>
                    {subtitle ? (
                        <span className="text-subhead text-label-2 truncate">
                            {subtitle}
                        </span>
                    ) : null}
                </span>
                {value !== undefined && value !== null ? (
                    <span className="text-body text-label-2 max-w-[55%] shrink-0 truncate text-right">
                        {value}
                    </span>
                ) : null}
                {accessory === "chevron" ? (
                    <ChevronRight
                        aria-hidden
                        className="text-label-3 -mr-1 size-[18px] shrink-0"
                        strokeWidth={2.5}
                    />
                ) : (
                    accessory
                )}
            </span>
        </>
    );

    const base = cn(
        "group/row flex w-full items-stretch gap-3 pl-4 text-left",
        interactive && "tap transition-colors duration-150 active:bg-cell-pressed",
        className
    );

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label={ariaLabel}
                className={base}
            >
                {content}
            </button>
        );
    }

    if (as === "label")
        return <label className={cn(base, "cursor-pointer")}>{content}</label>;

    return <div className={base}>{content}</div>;
}
