/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    return (
        /iPad|iPhone|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    );
}

/** Running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return (
            window.matchMedia?.("(display-mode: standalone)").matches === true ||
            (navigator as Navigator & { standalone?: boolean }).standalone === true
        );
    } catch {
        return false;
    }
}

/** A human label for this browser, e.g. "Safari on iPhone", sent when pairing. */
export function describeThisDevice(): string {
    if (typeof navigator === "undefined") return "Web";
    const ua = navigator.userAgent;

    const platform = /iPhone/.test(ua)
        ? "iPhone"
        : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
          ? "iPad"
          : /Android/.test(ua)
            ? "Android"
            : /Macintosh/.test(ua)
              ? "Mac"
              : /Windows/.test(ua)
                ? "Windows"
                : /Linux/.test(ua)
                  ? "Linux"
                  : "Web";

    const browser = /Edg\//.test(ua)
        ? "Edge"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";

    return `${browser} on ${platform}${isStandalone() ? " (Home Screen)" : ""}`;
}

export function isTouchDevice(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
