"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, UserRoundSearch } from "lucide-react";
import { type Contact, listContacts } from "@/lib/api";
import { cleanPhone, looksLikePhone } from "@/lib/phone";
import { Sheet, SheetBody, SheetHeader } from "@/components/ios/Sheet";
import { Button } from "@/components/ios/Button";
import { Avatar } from "@/components/ios/Avatar";
import { Spinner } from "@/components/ios/Spinner";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
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
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) setTo("");
    }, [open]);

    useEffect(() => {
        if (!open || !session) return;
        let stale = false;
        setLoading(true);
        const t = window.setTimeout(
            () => {
                listContacts(session.pairToken, to.trim(), 120)
                    .then((r) => !stale && setContacts(r.contacts ?? []))
                    .catch(() => !stale && setContacts([]))
                    .finally(() => !stale && setLoading(false));
            },
            to ? 200 : 0
        );
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [open, session, to]);

    const groups = useMemo(() => groupByLetter(contacts), [contacts]);
    const asNumber = looksLikePhone(to) ? cleanPhone(to) : null;

    const start = (peer: string, name?: string | null) => {
        openThread({ peer, name });
        onOpenChange(false);
    };

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
                        size="sm"
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
                    else if (contacts[0])
                        start(
                            contacts[0].rawNumber || contacts[0].norm,
                            contacts[0].displayName
                        );
                }}
            >
                <label htmlFor="new-message-to" className="text-body text-label-2">
                    To:
                </label>
                <input
                    id="new-message-to"
                    autoFocus
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Name or phone number"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    dir="auto"
                    className="text-body h-12 min-w-0 flex-1 bg-transparent outline-none"
                />
            </form>

            <SheetBody>
                {asNumber ? (
                    <button
                        type="button"
                        onClick={() => start(asNumber)}
                        className="tap active:bg-fill-4 flex w-full items-center gap-3 px-4 py-2.5 text-left"
                    >
                        <span className="bg-green flex size-10 items-center justify-center rounded-full text-white">
                            <MessageSquarePlus className="size-5" strokeWidth={2.2} />
                        </span>
                        <span className="flex flex-col">
                            <span className="text-body">Send to {asNumber}</span>
                            <span className="text-subhead text-label-2">
                                Text Message
                            </span>
                        </span>
                    </button>
                ) : null}

                {loading && contacts.length === 0 ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : groups.length === 0 ? (
                    asNumber ? null : (
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
                            <h3 className="bg-grouped/90 text-footnote text-label-2 sticky top-0 z-10 px-4 py-1 font-semibold backdrop-blur-md">
                                {letter}
                            </h3>
                            <ul>
                                {list.map((c) => (
                                    <li key={c.norm}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                start(
                                                    c.rawNumber || c.norm,
                                                    c.displayName
                                                )
                                            }
                                            className="tap active:bg-fill-4 flex w-full items-center gap-3 pl-4 text-left"
                                        >
                                            <Avatar
                                                name={c.displayName}
                                                size={36}
                                                className="my-1.5"
                                            />
                                            <span className="border-separator flex min-w-0 flex-1 flex-col border-b-[0.5px] py-2 pr-4">
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
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </SheetBody>
        </Sheet>
    );
}
