import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/format";

/** Contacts-style monogram: gray gradient, white initials, or a person glyph. */
export function Avatar({
    name,
    size = 40,
    className,
}: {
    name?: string | null;
    size?: number;
    className?: string;
}) {
    const initials = initialsFor(name);
    return (
        <span
            aria-hidden
            className={cn(
                "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white select-none",
                className
            )}
            style={{
                width: size,
                height: size,
                backgroundImage:
                    "linear-gradient(to bottom, var(--avatar-top), var(--avatar-bottom))",
            }}
        >
            {initials ? (
                <span
                    className="font-semibold tracking-[0.02em]"
                    style={{
                        fontSize: size * (initials.length > 1 ? 0.4 : 0.45),
                        lineHeight: 1,
                    }}
                >
                    {initials}
                </span>
            ) : (
                <svg
                    viewBox="0 0 40 40"
                    width={size}
                    height={size}
                    className="absolute inset-0"
                >
                    <circle cx="20" cy="15.5" r="7" fill="currentColor" opacity="0.95" />
                    <path
                        d="M6.5 35.2C8.6 28.9 13.8 25 20 25s11.4 3.9 13.5 10.2A19.9 19.9 0 0 1 20 40a19.9 19.9 0 0 1-13.5-4.8Z"
                        fill="currentColor"
                        opacity="0.95"
                    />
                </svg>
            )}
        </span>
    );
}
