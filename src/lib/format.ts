const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysAgo(ts: number, now = new Date()): number {
    return Math.round((startOfDay(now) - startOfDay(new Date(ts))) / DAY_MS);
}

function valid(ts: number | null | undefined): ts is number {
    return typeof ts === "number" && Number.isFinite(ts) && ts > 0;
}

export function formatTime(ts: number): string {
    if (!valid(ts)) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Conversation list date, matching iOS Messages: time today, then Yesterday, weekday, date. */
export function formatListDate(ts: number): string {
    if (!valid(ts)) return "";
    const d = new Date(ts);
    const diff = daysAgo(ts);
    if (diff <= 0) return formatTime(ts);
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
    return d.toLocaleDateString([], {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
    });
}

/** Centered timestamp between message groups: "Today 9:41 AM", "Mon, Sep 8 at 9:41 AM". */
export function formatThreadTimestamp(ts: number): { day: string; time: string } {
    if (!valid(ts)) return { day: "", time: "" };
    const d = new Date(ts);
    const diff = daysAgo(ts);
    const time = formatTime(ts);
    if (diff <= 0) return { day: "Today", time };
    if (diff === 1) return { day: "Yesterday", time };
    if (diff < 7) return { day: d.toLocaleDateString([], { weekday: "long" }), time };
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return {
        day: d.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            ...(sameYear ? {} : { year: "numeric" }),
        }),
        time: `at ${time}`,
    };
}

export function formatRelative(ts: number | null | undefined): string {
    if (!valid(ts)) return "Never";
    const diffSec = Math.round((Date.now() - ts) / 1000);
    const rtf = new Intl.RelativeTimeFormat([], { numeric: "auto" });
    if (Math.abs(diffSec) < 45) return "Just now";
    const mins = Math.round(diffSec / 60);
    if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 30) return rtf.format(-days, "day");
    return new Date(ts).toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatDateTime(ts: number | null | undefined): string {
    if (!valid(ts)) return "—";
    return new Date(ts).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

/** Countdown "4:59" for short-lived codes. */
export function formatCountdown(msLeft: number): string {
    const total = Math.max(0, Math.ceil(msLeft / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Initials for a monogram avatar, or "" when the name is really a phone number. */
export function initialsFor(name: string | null | undefined): string {
    const n = (name ?? "").trim();
    if (!n || /^[+\d\s()\-.]+$/.test(n)) return "";
    const parts = n.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
    return letters
        .map((p) => Array.from(p)[0] ?? "")
        .join("")
        .toUpperCase();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}
