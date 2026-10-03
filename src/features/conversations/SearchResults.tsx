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
import { looksLikePhone, threadIdForPeer } from "@/lib/phone";
import { Avatar } from "@/components/ios/Avatar";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { Spinner } from "@/components/ios/Spinner";
import { useApp } from "@/features/app/AppProvider";

function Highlight({ text, query }: { text: string; query: string }) {
    const q = query.trim();
    if (!q) return <>{text}</>;
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    const parts: React.ReactNode[] = [];
    let i = 0;
    let hit = lower.indexOf(needle);
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
                    {text.slice(hit, hit + q.length)}
                </mark>
            );
            i = hit + q.length;
        }
        hit = lower.indexOf(needle, hit + q.length);
    }
    parts.push(text.slice(i));
    return <>{parts}</>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return <h2 className="text-title-3 px-4 pt-5 pb-1.5 font-bold">{children}</h2>;
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
    const q = query.trim();

    useEffect(() => {
        if (!session || !q) {
            setContacts([]);
            setMessages([]);
            return;
        }
        let stale = false;
        setLoading(true);
        const t = window.setTimeout(async () => {
            const [c, m] = await Promise.allSettled([
                listContacts(session.pairToken, q, 20),
                searchMessages(session.pairToken, q, 30),
            ]);
            if (stale) return;
            setContacts(c.status === "fulfilled" ? (c.value.contacts ?? []) : []);
            setMessages(m.status === "fulfilled" ? (m.value.messages ?? []) : []);
            setLoading(false);
        }, 220);
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [session, q]);

    const matchingConversations = useMemo(() => {
        const needle = q.toLowerCase();
        const digits = q.replace(/\D+/g, "");
        return conversations.filter(
            (c) =>
                (c.peerName ?? "").toLowerCase().includes(needle) ||
                c.peer.toLowerCase().includes(needle) ||
                (digits.length >= 3 && c.peer.replace(/\D+/g, "").includes(digits))
        );
    }, [conversations, q]);

    const otherContacts = useMemo(() => {
        const known = new Set(conversations.map((c) => c.threadId));
        return contacts.filter((c) => !known.has(threadIdForPeer(c.rawNumber || c.norm)));
    }, [contacts, conversations]);

    const canMessageNumber =
        looksLikePhone(q) &&
        !conversations.some((c) => c.threadId === threadIdForPeer(q));

    const nothing =
        !loading &&
        !matchingConversations.length &&
        !otherContacts.length &&
        !messages.length &&
        !canMessageNumber;

    if (nothing) {
        return (
            <ContentUnavailable
                className="pt-16"
                icon={<Search />}
                title={`No Results for “${q}”`}
                description="Check the spelling or try a new search."
            />
        );
    }

    return (
        <div className="pb-8">
            {canMessageNumber ? (
                <button
                    type="button"
                    onClick={() => openThread({ peer: q })}
                    className="tap active:bg-fill-4 flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                    <Avatar size={40} />
                    <span className="flex flex-col">
                        <span className="text-body text-tint">Send Message</span>
                        <span className="text-subhead text-label-2">{q}</span>
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
                                    query={q}
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
                                    query={q}
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
                                    className="tap active:bg-fill-4 flex w-full items-start gap-3 pl-4 text-left"
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
                                        <span
                                            dir="auto"
                                            className="text-subhead text-label-2 line-clamp-2 text-start"
                                        >
                                            {m.direction === "out" ? "You: " : ""}
                                            <Highlight text={m.body} query={q} />
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
    query: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="tap active:bg-fill-4 flex w-full items-center gap-3 pl-4 text-left"
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
