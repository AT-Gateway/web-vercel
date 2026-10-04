"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ios/Spinner";

type Tone = "tint" | "red" | "green" | "label";

const toneText: Record<Tone, string> = {
    tint: "text-tint",
    red: "text-red",
    green: "text-green",
    label: "text-label",
};

const toneBg: Record<Tone, string> = {
    tint: "bg-tint",
    red: "bg-red",
    green: "bg-green",
    label: "bg-label",
};

const toneTinted: Record<Tone, string> = {
    tint: "bg-tint/15 text-tint",
    red: "bg-red/15 text-red",
    green: "bg-green/15 text-green",
    label: "bg-fill-3 text-label",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "prominent" | "tinted" | "gray" | "glass" | "plain";
    tone?: Tone;
    /** "bar": 44pt capsule for sheet toolbars. */
    size?: "sm" | "md" | "lg" | "bar";
    loading?: boolean;
    icon?: React.ReactNode;
};

/**
 * Capsule button in the iOS button styles: .borderedProminent ("prominent"),
 * .bordered ("tinted"/"gray"), .glass and .plain.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = "prominent",
        tone = "tint",
        size = "md",
        loading = false,
        icon,
        className,
        children,
        disabled,
        type = "button",
        ...rest
    },
    ref
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                "tap relative inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap",
                "ease-ios transition-[transform,opacity,background-color,filter] duration-200",
                "active:scale-[0.97] active:brightness-90 disabled:cursor-default disabled:active:scale-100",
                size === "sm" &&
                    // 34pt visual, 44pt hit area.
                    "text-subhead min-h-[34px] px-3.5 before:absolute before:-inset-x-1 before:-inset-y-[5px] before:content-['']",
                size === "md" && "text-body min-h-11 px-5",
                size === "lg" && "text-headline min-h-[52px] w-full px-6",
                size === "bar" && "text-body min-h-11 px-4",
                variant === "prominent" &&
                    cn(toneBg[tone], "disabled:bg-fill disabled:text-label-3 text-white"),
                variant === "tinted" && cn(toneTinted[tone], "disabled:opacity-40"),
                variant === "gray" &&
                    cn("bg-fill-3", toneText[tone], "disabled:text-label-3"),
                variant === "glass" &&
                    cn("glass", toneText[tone], "disabled:text-label-3"),
                variant === "plain" &&
                    cn(
                        toneText[tone],
                        "disabled:text-label-3 active:opacity-50 active:brightness-100"
                    ),
                className
            )}
            {...rest}
        >
            <span
                className={cn("inline-flex items-center gap-2", loading && "opacity-0")}
            >
                {icon}
                {children}
            </span>
            {loading ? (
                <span className="absolute inset-0 flex items-center justify-center">
                    <Spinner
                        size={18}
                        className={
                            variant === "prominent" ? "text-white" : "text-label-2"
                        }
                    />
                </span>
            ) : null}
        </button>
    );
});

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Accessible name — required because the visible label is only an icon. */
    label: string;
    icon: React.ReactNode;
    variant?: "glass" | "plain" | "gray" | "prominent" | "tinted";
    tone?: Tone;
    size?: "sm" | "md";
};

/** Icon-only button with a 44pt hit target and an accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            icon,
            variant = "glass",
            tone = "label",
            size = "md",
            className,
            type = "button",
            ...rest
        },
        ref
    ) {
        return (
            <button
                ref={ref}
                type={type}
                aria-label={label}
                title={label}
                className={cn(
                    "tap relative inline-flex shrink-0 items-center justify-center rounded-full",
                    "ease-ios transition-[transform,opacity,background-color,filter] duration-200",
                    "active:scale-[0.92] disabled:cursor-default disabled:opacity-35 disabled:active:scale-100",
                    size === "md"
                        ? "size-11 [&_svg]:size-[21px]"
                        : "size-[34px] [&_svg]:size-[17px]",
                    // Small visual buttons still get a 44pt hit area.
                    size === "sm" &&
                        "before:absolute before:-inset-[5px] before:content-['']",
                    variant === "glass" && cn("glass", toneText[tone]),
                    variant === "plain" && cn(toneText[tone], "active:opacity-50"),
                    variant === "gray" && cn("bg-fill-3", toneText[tone]),
                    variant === "tinted" && toneTinted[tone],
                    variant === "prominent" && cn(toneBg[tone], "text-white"),
                    className
                )}
                {...rest}
            >
                {icon}
            </button>
        );
    }
);

/** iOS 26 groups adjacent toolbar items into one glass capsule. */
export function GlassGroup({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "glass flex items-center rounded-full [&>button]:bg-transparent [&>button]:shadow-none [&>button]:backdrop-filter-none",
                className
            )}
        >
            {children}
        </div>
    );
}
