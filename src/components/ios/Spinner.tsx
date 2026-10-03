import { cn } from "@/lib/utils";

/** iOS activity indicator: eight spokes fading in sequence. */
export function Spinner({
    size = 20,
    className,
    label = "Loading",
}: {
    size?: number;
    className?: string;
    label?: string;
}) {
    const spokes = 8;
    return (
        <span
            role="progressbar"
            aria-label={label}
            className={cn("text-label-2 relative inline-block shrink-0", className)}
            style={{ width: size, height: size }}
        >
            {Array.from({ length: spokes }).map((_, i) => (
                <span
                    key={i}
                    className="animate-spinner absolute top-0 left-1/2 rounded-full bg-current"
                    style={{
                        width: Math.max(2, size * 0.09),
                        height: size * 0.28,
                        marginLeft: -Math.max(1, size * 0.045),
                        transformOrigin: `50% ${size / 2}px`,
                        transform: `rotate(${(360 / spokes) * i}deg)`,
                        animationDelay: `${-((spokes - i) / spokes) * 0.8}s`,
                    }}
                />
            ))}
        </span>
    );
}
