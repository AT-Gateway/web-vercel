"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
    type Contact,
    type Conversation,
    listContacts,
    type Message,
    searchMessages,
} from "@/lib/api";
import { formatListDate } from "@/lib/format";
import {
    cleanPhone,
    looksLikePhone,
    normalizeDigits,
    threadIdForPeer,
} from "@/lib/phone";
import { normalizeFa } from "@/lib/text";
import { Avatar } from "@/components/ios/Avatar";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { Spinner } from "@/components/ios/Spinner";
import { useApp } from "@/features/app/AppProvider";

/**
 * Bolds every match of `query` (already folded with normalizeFa) in `text`.
 * normalizeFa keeps the length, so indices found in the folded text slice the
 * original.
 */
function Highlight({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const hay = normalizeFa(text);
    const parts: React.ReactNode[] = [];
    let i = 0;
    let hit = hay.indexOf(query);
    // Start the snippet near the first hit so it is visible in two lines.
    if (hit > 40) {
        i = text.lastIndexOf(" ", hit - 20) + 1 || hit - 20;
        parts.push("…");
    }
    while (hit !== -1) {
        if (hit >= i) {
            parts.push(text.slice(i, hit));
            parts.push(
                <mark key={hit} className="text-label bg-transparent font-semibold">
                    {text.slice(hit, hit + query.length)}
                </mark>
            );
            i = hit + query.length;
        }
        hit = hay.indexOf(query, hit + query.length);
    }
    parts.push(text.slice(i));
    return <>{parts}</>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return <h2 className="text-title-3 px-4 pt-5 pb-1.5 font-bold">{children}</h2>;
}

/** Digits only, without leading zeros, so "0912…" also finds "+98912…". */
function digitKey(s: string): string {
    return normalizeDigits(s).replace(/\D+/g, "").replace(/^0+/, "");
}

export function SearchResults({
    query,
    conversations,
}: {
    query: string;
    conversations: Conversation[];
}) {
    const { session, openThread } = useApp();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [serverFailed, setServerFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const token = session?.pairToken;
    const q = query.trim();
    /** Folded for local matching and highlighting (Persian letters, digits, case). */
    const qn = normalizeFa(q);

    useEffect(() => {
        if (!token || !q) {
            setContacts([]);
            setMessages([]);
            setServerFailed(false);
            setLoading(false);
            return;
        }
        let stale = false;
        setLoading(true);
        const t = window.setTimeout(async () => {
            // The server folds Persian letters and digits itself.
            const [c, m] = await Promise.allSettled([
                listContacts(token, q, 20),
                searchMessages(token, q, 30),
            ]);
            if (stale) return;
            setContacts(c.status === "fulfilled" ? (c.value.contacts ?? []) : []);
            setMessages(m.status === "fulfilled" ? (m.value.messages ?? []) : []);
            setServerFailed(c.status === "rejected" || m.status === "rejected");
            setLoading(false);
        }, 220);
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [token, q, attempt]);

    const matchingConversations = useMemo(() => {
        const digits = digitKey(q);
        return conversations.filter(
            (c) =>
                normalizeFa(c.peerName ?? "").includes(qn) ||
                normalizeFa(c.peer).includes(qn) ||
                (digits.length >= 3 && digitKey(c.peer).includes(digits))
        );
    }, [conversations, q, qn]);

    const otherContacts = useMemo(() => {
        const known = new Set(conversations.map((c) => c.threadId));
        return contacts.filter((c) => !known.has(threadIdForPeer(c.rawNumber || c.norm)));
    }, [contacts, conversations]);

    const qDigits = normalizeDigits(q);
    const number = cleanPhone(q);
    const canMessageNumber =
        looksLikePhone(qDigits) &&
        !conversations.some((c) => c.threadId === threadIdForPeer(qDigits));

    const hasResults =
        matchingConversations.length > 0 ||
        otherContacts.length > 0 ||
        messages.length > 0 ||
        canMessageNumber;

    // "No Results" only when both searches succeeded and nothing matched.
    if (!loading && !serverFailed && !hasResults) {
        return (
            <ContentUnavailable
                className="pt-16"
                icon={<Search />}
                title={
                    <>
                        No Results for “<bdi>{q}</bdi>”
                    </>
                }
                description="Check the spelling or try a new search."
            />
        );
    }

    return (
        <div className="pb-8">
            {canMessageNumber ? (
                <button
                    type="button"
                    onClick={() => openThread({ peer: number })}
                    className="tap cell-press flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                    <Avatar size={40} />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body text-tint">Send Message</span>
                        <span className="text-subhead text-label-2 truncate">
                            {number}
                        </span>
                    </span>
                </button>
            ) : null}

            {matchingConversations.length || otherContacts.length ? (
                <>
                    <SectionHeader>Contacts</SectionHeader>
                    <ul>
                        {matchingConversations.slice(0, 8).map((c) => (
                            <li key={c.threadId}>
                                <ResultPerson
                                    name={c.peerName}
                                    number={c.peer}
                                    query={qn}
                                    onClick={() =>
                                        openThread({ threadId: c.threadId, peer: c.peer })
                                    }
                                />
                            </li>
                        ))}
                        {otherContacts.slice(0, 8).map((c) => (
                            <li key={c.norm}>
                                <ResultPerson
                                    name={c.displayName}
                                    number={c.rawNumber || c.norm}
                                    query={qn}
                                    onClick={() =>
                                        openThread({
                                            peer: c.rawNumber || c.norm,
                                            name: c.displayName,
                                        })
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}

            {messages.length ? (
                <>
                    <SectionHeader>Messages</SectionHeader>
                    <ul>
                        {messages.map((m) => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        openThread({ threadId: m.threadId, peer: m.peer })
                                    }
                                    className="tap cell-press flex w-full items-start gap-3 pl-4 text-left"
                                >
                                    <Avatar
                                        name={m.peerName}
                                        size={40}
                                        className="mt-2.5"
                                    />
                                    <span className="border-separator flex min-w-0 flex-1 flex-col border-b-[0.5px] py-2.5 pr-4">
                                        <span className="flex items-baseline gap-2">
                                            <span
                                                className="text-headline flex-1 truncate"
                                                dir="auto"
                                            >
                                                {m.peerName || m.peer}
                                            </span>
                                            <span className="text-subhead text-label-2 shrink-0">
                                                {formatListDate(m.ts)}
                                            </span>
                                        </span>
                                        <span className="text-subhead text-label-2 line-clamp-2 text-left">
                                            {m.direction === "out" ? "You: " : ""}
                                            <bdi>
                                                <Highlight text={m.body} query={qn} />
                                            </bdi>
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}

            {loading ? (
                <div className="flex justify-center py-6">
                    <Spinner />
                </div>
            ) : serverFailed ? (
                <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className="tap text-footnote text-label-2 flex min-h-11 w-full items-center justify-center px-4 py-3 active:opacity-60"
                >
                    Couldn&rsquo;t search messages ·&nbsp;
                    <span className="text-tint">Try Again</span>
                </button>
            ) : null}
        </div>
    );
}

function ResultPerson({
    name,
    number,
    query,
    onClick,
}: {
    name: string | null;
    number: string;
    /** Folded with normalizeFa. */
    query: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="tap cell-press flex w-full items-center gap-3 pl-4 text-left"
        >
            <Avatar name={name} size={40} className="my-2" />
            <span className="border-separator flex min-w-0 flex-1 flex-col border-b-[0.5px] py-2.5 pr-4">
                <span className="text-body truncate" dir="auto">
                    <Highlight text={name || number} query={query} />
                </span>
                {name ? (
                    <span className="text-subhead text-label-2 truncate">
                        <Highlight text={number} query={query} />
                    </span>
                ) : null}
            </span>
        </button>
    );
}
