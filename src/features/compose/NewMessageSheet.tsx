"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, UserRoundSearch } from "lucide-react";
import { type Contact, listContacts } from "@/lib/api";
import { cleanPhone, looksLikePhone, normalizeDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { Sheet, SheetBody, SheetHeader } from "@/components/ios/Sheet";
import { Button } from "@/components/ios/Button";
import { Avatar } from "@/components/ios/Avatar";
import { Spinner } from "@/components/ios/Spinner";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { useDismissKeyboardOnDrag } from "@/hooks/useDismissKeyboardOnDrag";
import { useApp } from "@/features/app/AppProvider";

function groupByLetter(contacts: Contact[]): Array<[string, Contact[]]> {
    const map = new Map<string, Contact[]>();
    for (const c of [...contacts].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
    )) {
        const first = Array.from(c.displayName.trim())[0]?.toUpperCase() ?? "#";
        const key = /\p{L}/u.test(first) ? first : "#";
        map.set(key, [...(map.get(key) ?? []), c]);
    }
    return Array.from(map.entries());
}

export function NewMessageSheet({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
}) {
    const { session, openThread } = useApp();
    const [to, setTo] = useState("");
    // Results remember the query they answer, so Go never acts on stale ones.
    const [results, setResults] = useState<{ for: string; contacts: Contact[] }>({
        for: "",
        contacts: [],
    });
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    // Go was pressed before the results for the current query arrived.
    const [pendingGo, setPendingGo] = useState(false);
    const dragProps = useDismissKeyboardOnDrag({ direction: "any" });
    const query = to.trim();

    useEffect(() => {
        if (open) {
            setTo("");
            setPendingGo(false);
        }
    }, [open]);

    useEffect(() => {
        if (!open || !session) return;
        let stale = false;
        setLoading(true);
        const t = window.setTimeout(
            () => {
                listContacts(session.pairToken, query, 120)
                    .then((r) => {
                        if (stale) return;
                        setResults({ for: query, contacts: r.contacts ?? [] });
                        setLoadError(false);
                    })
                    .catch(() => {
                        if (stale) return;
                        setResults({ for: query, contacts: [] });
                        setLoadError(true);
                    })
                    .finally(() => !stale && setLoading(false));
            },
            query ? 200 : 0
        );
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [open, session, query]);

    const groups = useMemo(() => groupByLetter(results.contacts), [results.contacts]);
    // The first row shown is what Go opens.
    const topHit: Contact | undefined = groups[0]?.[1][0];
    const asNumber = looksLikePhone(to) ? cleanPhone(to) : null;
    const showTopHit = Boolean(query) && !asNumber && results.for === query;

    const start = useCallback(
        (peer: string, name?: string | null) => {
            openThread({ peer, name });
            onOpenChange(false);
        },
        [openThread, onOpenChange]
    );

    useEffect(() => {
        if (!pendingGo || results.for !== query) return;
        setPendingGo(false);
        if (topHit) start(topHit.rawNumber || topHit.norm, topHit.displayName);
    }, [pendingGo, results.for, query, topHit, start]);

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            description="Choose a recipient for a new message"
        >
            <SheetHeader
                title="New Message"
                trailing={
                    <Button
                        variant="glass"
                        tone="label"
                        size="bar"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                }
            />
            <form
                className="hairline-b flex min-h-12 shrink-0 items-center gap-2 px-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (asNumber) start(asNumber);
                    else if (!query) return;
                    else if (results.for === query) {
                        if (topHit) {
                            start(topHit.rawNumber || topHit.norm, topHit.displayName);
                        }
                    } else setPendingGo(true);
                }}
            >
                <label htmlFor="new-message-to" className="text-body text-label-2">
                    To:
                </label>
                <input
                    id="new-message-to"
                    autoFocus
                    value={to}
                    onChange={(e) => {
                        setTo(normalizeDigits(e.target.value));
                        setPendingGo(false);
                    }}
                    placeholder="Name or phone number"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    dir="auto"
                    className="text-body h-12 min-w-0 flex-1 bg-transparent outline-none"
                />
            </form>

            <SheetBody {...dragProps}>
                {asNumber ? (
                    <button
                        type="button"
                        onClick={() => start(asNumber)}
                        className="tap cell-press flex w-full items-center gap-3 px-4 py-2.5 text-left"
                    >
                        <span className="bg-tint flex size-10 items-center justify-center rounded-full text-white">
                            <MessageSquarePlus className="size-5" strokeWidth={2.2} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-body truncate">Send to {asNumber}</span>
                            <span className="text-subhead text-label-2">
                                Text Message
                            </span>
                        </span>
                    </button>
                ) : null}

                {loadError ? (
                    <p role="status" className="text-footnote text-label-2 px-4 py-3">
                        Couldn&apos;t load contacts. You can still type a phone number.
                    </p>
                ) : null}

                {loading && results.contacts.length === 0 && !loadError ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : groups.length === 0 ? (
                    asNumber || loadError ? null : (
                        <ContentUnavailable
                            className="pt-14"
                            icon={<UserRoundSearch />}
                            title={to ? "No Contacts Found" : "No Contacts"}
                            description="Type a phone number to message anyone."
                        />
                    )
                ) : (
                    groups.map(([letter, list]) => (
                        <section key={letter} aria-label={letter}>
                            <h3 className="bg-grouped text-footnote text-label-2 sticky top-0 z-10 px-4 py-1 font-semibold">
                                {letter}
                            </h3>
                            <ul>
                                {list.map((c) => {
                                    const isTop = showTopHit && c === topHit;
                                    return (
                                        <li key={c.norm}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    start(
                                                        c.rawNumber || c.norm,
                                                        c.displayName
                                                    )
                                                }
                                                className={cn(
                                                    "tap cell-press flex w-full items-center gap-3 pl-4 text-left",
                                                    isTop && "bg-fill-4"
                                                )}
                                            >
                                                <Avatar
                                                    name={c.displayName}
                                                    size={36}
                                                    className="my-1.5"
                                                />
                                                <span className="border-separator flex min-w-0 flex-1 items-center gap-2 border-b-[0.5px] py-2 pr-4">
                                                    <span className="flex min-w-0 flex-1 flex-col">
                                                        <span
                                                            className="text-body truncate"
                                                            dir="auto"
                                                        >
                                                            {c.displayName}
                                                        </span>
                                                        <span className="text-footnote text-label-2 truncate">
                                                            {c.rawNumber || c.norm}
                                                        </span>
                                                    </span>
                                                    {isTop ? (
                                                        <span className="text-caption-1 text-label-2 shrink-0">
                                                            Top Hit
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))
                )}
            </SheetBody>
        </Sheet>
    );
}
