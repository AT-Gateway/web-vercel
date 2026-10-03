import React from "react";
import { cn } from "@/lib/utils";

/** Web counterpart of SwiftUI's ContentUnavailableView. */
export function ContentUnavailable({
    icon,
    title,
    description,
    actions,
    className,
}: {
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            role="status"
            className={cn(
                "flex flex-col items-center justify-center px-8 py-10 text-center",
                className
            )}
        >
            {icon ? (
                <div
                    aria-hidden
                    className="text-label-2 mb-3 [&_svg]:size-12 [&_svg]:stroke-[1.5]"
                >
                    {icon}
                </div>
            ) : null}
            <h2 className="text-title-2 text-label font-bold">{title}</h2>
            {description ? (
                <p className="text-callout text-label-2 mt-1.5 max-w-sm">{description}</p>
            ) : null}
            {actions ? (
                <div className="mt-5 flex flex-wrap justify-center gap-3">{actions}</div>
            ) : null}
        </div>
    );
}
