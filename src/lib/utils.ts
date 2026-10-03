import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the custom iOS text styles (globals.css @theme);
 * otherwise it treats `text-body` like a color and drops it when a real color
 * class such as `text-label-2` follows.
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [
                {
                    text: [
                        "large-title",
                        "title-1",
                        "title-2",
                        "title-3",
                        "headline",
                        "body",
                        "callout",
                        "subhead",
                        "footnote",
                        "caption-1",
                        "caption-2",
                    ],
                },
            ],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
