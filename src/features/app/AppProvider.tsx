"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    blockThread as apiBlockThread,
    type BlockedChat,
    type Contact,
    type Conversation,
    deleteThread as apiDeleteThread,
    listBlockedChats,
    listConversations,
    listMessages,
    markThreadRead,
    markThreadUnread,
    type Message,
    pairMe,
    revokeDevice,
    sendSms,
    unblockThread as apiUnblockThread,
    upsertContact,
} from "@/lib/api";
import { threadIdForPeer } from "@/lib/phone";
import {
    clearPairToken,
    getOrCreateDeviceId,
    loadPairToken,
    loadSimSlot,
    savePairToken,
    saveSimSlot,
} from "@/lib/storage";
import { useToast } from "@/components/ios/Toast";

export type Session = {
    pairToken: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    demo: boolean;
};

type SessionStatus = "loading" | "signedOut" | "ready";

export type OpenThreadInput = { threadId?: string; peer: string; name?: string | null };

export type AppState = {
    session: Session | null;
    status: SessionStatus;
    signIn: (s: Session) => void;
    signOut: () => void;

    conversations: Conversation[];
    conversationsLoaded: boolean;
    refreshConversations: () => Promise<void>;

    blockedChats: BlockedChat[];
    refreshBlocked: () => Promise<void>;

    messagesByThread: Record<string, Message[]>;
    loadingThreadId: string | null;
    refreshThread: (threadId: string) => Promise<void>;

    activeThreadId: string | null;
    activePeer: string;
    activeName: string | null;
    activeBlocked: boolean;
    openThread: (input: OpenThreadInput) => void;
    closeThread: () => void;

    simSlot: 0 | 1;
    setSimSlot: (slot: 0 | 1) => void;

    sendMessage: (text: string) => Promise<void>;
    retryMessage: (m: Message) => Promise<void>;
    blockThread: (threadId: string, peer: string) => Promise<boolean>;
    unblockThread: (threadId: string) => Promise<boolean>;
    deleteThread: (threadId: string) => Promise<boolean>;
    markUnread: (threadId: string) => void;
    markRead: (threadId: string) => void;
    saveContact: (displayName: string, number: string) => Promise<Contact | null>;

    unreadTotal: number;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
    return ctx;
}

const POLL_MS = 12_000;

/** Dismisses this thread's push notifications once it has been read here. */
function clearThreadNotifications(threadId: string) {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
        .then((reg) => reg.getNotifications({ tag: `thread-${threadId}` }))
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => {});
}

function errorText(e: unknown): string | undefined {
    return e instanceof Error ? e.message : undefined;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const params = useSearchParams();
    const toast = useToast();

    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<SessionStatus>("loading");

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoaded, setConversationsLoaded] = useState(false);
    const [blockedChats, setBlockedChats] = useState<BlockedChat[]>([]);
    const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>(
        {}
    );
    const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
    const [simSlot, setSimSlotState] = useState<0 | 1>(0);
    // Names for threads opened from contacts before any message exists.
    const [pendingNames, setPendingNames] = useState<Record<string, string>>({});

    const urlThreadId = params.get("tid");
    const urlPeer = params.get("peer");
    const activeThreadId = urlThreadId || (urlPeer ? threadIdForPeer(urlPeer) : null);

    const sessionRef = useRef(session);
    // Latest inbound message id already marked read, per thread, so polling the
    // open thread only posts /read when a new message has actually arrived.
    const readMarks = useRef(new Map<string, string>());
    sessionRef.current = session;
    const activeRef = useRef(activeThreadId);
    activeRef.current = activeThreadId;
    const pushedThread = useRef(false);
    const threadAbort = useRef<AbortController | null>(null);

    // ---------- session ----------
    useEffect(() => {
        setSimSlotState(loadSimSlot());
        const token = loadPairToken();
        if (!token) {
            setStatus("signedOut");
            return;
        }
        pairMe(token)
            .then((me) => {
                setSession({
                    pairToken: token,
                    pairingId: me.pairingId,
                    gatewayDeviceId: me.gatewayDeviceId,
                    gatewayPubSpkiB64: me.gatewayPubSpkiB64,
                    demo: Boolean(me.demo) || token.startsWith("demo:"),
                });
                setStatus("ready");
            })
            .catch(() => {
                setStatus("signedOut");
            });
    }, []);

    const signIn = useCallback((s: Session) => {
        savePairToken(s.pairToken);
        setSession(s);
        setStatus("ready");
    }, []);

    const signOut = useCallback(() => {
        const token = sessionRef.current?.pairToken;
        // Best effort: revoke this browser's token on the server too.
        if (token) revokeDevice(token, getOrCreateDeviceId()).catch(() => {});
        clearPairToken();
        setSession(null);
        setConversations([]);
        setConversationsLoaded(false);
        setBlockedChats([]);
        setMessagesByThread({});
        setStatus("signedOut");
        router.replace("/");
    }, [router]);

    // ---------- data ----------
    const refreshConversations = useCallback(async () => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const res = await listConversations(s.pairToken, 200);
            const visible = document.visibilityState === "visible";
            setConversations(
                (res.conversations ?? []).map((c) => ({
                    ...c,
                    blocked: Boolean(c.blocked),
                    // The open, visible thread is being read right now; its /read
                    // call (from refreshThread) may land after this response.
                    unreadCount:
                        visible && c.threadId === activeRef.current ? 0 : c.unreadCount,
                }))
            );
            setConversationsLoaded(true);
        } catch (e) {
            // A revoked token signs the device out instead of failing quietly forever.
            if (/pair token/i.test(errorText(e) ?? "")) {
                toast({
                    title: "Signed out",
                    body: "This device's access was revoked.",
                    tone: "error",
                });
                signOut();
                return;
            }
            setConversationsLoaded(true);
        }
    }, [signOut, toast]);

    const refreshBlocked = useCallback(async () => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const res = await listBlockedChats(s.pairToken);
            setBlockedChats(res.blockedChats ?? []);
        } catch {
            // Non-critical; blocked state is also reflected on conversations.
        }
    }, []);

    const refreshThread = useCallback(async (threadId: string) => {
        const s = sessionRef.current;
        if (!s || !threadId) return;

        threadAbort.current?.abort();
        const ac = new AbortController();
        threadAbort.current = ac;

        setLoadingThreadId(threadId);
        try {
            const res = await listMessages(s.pairToken, threadId, 800);
            if (ac.signal.aborted) return;
            setMessagesByThread((prev) => {
                // Keep optimistic local messages that the server hasn't returned yet.
                const pending = (prev[threadId] ?? []).filter(
                    (m) => m.id.startsWith("local-") && m.status !== "failed"
                );
                const server = res.messages ?? [];
                const stillPending = pending.filter(
                    (p) =>
                        !server.some(
                            (m) =>
                                m.direction === "out" &&
                                m.body === p.body &&
                                Math.abs(m.ts - p.ts) < 60_000
                        )
                );
                const failed = (prev[threadId] ?? []).filter(
                    (m) => m.id.startsWith("local-") && m.status === "failed"
                );
                return {
                    ...prev,
                    [threadId]: [...server, ...stillPending, ...failed].sort(
                        (a, b) => a.ts - b.ts
                    ),
                };
            });

            // Mark read only while the thread is on screen, and only when a new
            // inbound message has arrived since the last time we marked it.
            const latestIn = [...(res.messages ?? [])]
                .reverse()
                .find((m) => m.direction === "in");
            if (
                latestIn &&
                activeRef.current === threadId &&
                document.visibilityState === "visible" &&
                readMarks.current.get(threadId) !== latestIn.id
            ) {
                readMarks.current.set(threadId, latestIn.id);
                clearThreadNotifications(threadId);
                setConversations((prev) =>
                    prev.map((c) =>
                        c.threadId === threadId ? { ...c, unreadCount: 0 } : c
                    )
                );
                markThreadRead(s.pairToken, threadId).catch(() => {});
            }
        } catch {
            // Keep showing what we have; the next poll retries.
        } finally {
            if (!ac.signal.aborted) setLoadingThreadId(null);
        }
    }, []);

    // Initial load + polling + live events.
    useEffect(() => {
        if (!session) return;
        refreshConversations();
        refreshBlocked();

        const es = new EventSource(
            `/api/sms/stream?pt=${encodeURIComponent(session.pairToken)}`
        );
        const onThreadEvent = (ev: Event) => {
            try {
                const data = JSON.parse((ev as MessageEvent).data || "{}");
                const tid = String(
                    data.threadId || threadIdForPeer(String(data.peer || ""))
                );
                refreshConversations();
                if (tid && activeRef.current === tid) refreshThread(tid);
            } catch {
                // ignore malformed events
            }
        };
        es.addEventListener("message", onThreadEvent);
        es.addEventListener("status", onThreadEvent);
        es.addEventListener("contacts", () => {
            refreshConversations();
            if (activeRef.current) refreshThread(activeRef.current);
        });
        es.addEventListener("chats", () => {
            refreshConversations();
            refreshBlocked();
        });

        const tick = () => {
            if (document.visibilityState !== "visible") return;
            refreshConversations();
            if (activeRef.current) refreshThread(activeRef.current);
        };
        const timer = window.setInterval(tick, POLL_MS);
        // Refresh immediately when the app returns to the foreground.
        document.addEventListener("visibilitychange", tick);
        window.addEventListener("online", tick);

        return () => {
            es.close();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
            window.removeEventListener("online", tick);
        };
    }, [session, refreshConversations, refreshBlocked, refreshThread]);

    useEffect(() => {
        if (!session || !activeThreadId) return;
        // Opening a thread always marks it read, even if it was marked unread.
        readMarks.current.delete(activeThreadId);
        refreshThread(activeThreadId);
    }, [session, activeThreadId, refreshThread]);

    // ---------- navigation ----------
    const openThread = useCallback(
        ({ threadId, peer, name }: OpenThreadInput) => {
            const tid = threadId || threadIdForPeer(peer);
            if (!tid) return;
            if (name) setPendingNames((prev) => ({ ...prev, [tid]: name }));
            setConversations((prev) =>
                prev.map((c) => (c.threadId === tid ? { ...c, unreadCount: 0 } : c))
            );
            const href = `/?tid=${encodeURIComponent(tid)}&peer=${encodeURIComponent(peer)}`;
            if (activeRef.current) {
                router.replace(href, { scroll: false });
            } else {
                pushedThread.current = true;
                router.push(href, { scroll: false });
            }
        },
        [router]
    );

    const closeThread = useCallback(() => {
        if (pushedThread.current) {
            pushedThread.current = false;
            router.back();
        } else {
            router.replace("/", { scroll: false });
        }
    }, [router]);

    // ---------- derived ----------
    const activeConversation = useMemo(
        () => conversations.find((c) => c.threadId === activeThreadId) ?? null,
        [conversations, activeThreadId]
    );

    const activePeer = activeConversation?.peer || urlPeer || "";
    const activeName =
        activeConversation?.peerName ||
        (activeThreadId ? pendingNames[activeThreadId] : null) ||
        (activeThreadId
            ? messagesByThread[activeThreadId]?.find((m) => m.peerName)?.peerName
            : null) ||
        null;

    const activeBlocked = Boolean(
        activeConversation?.blocked ||
        (activeThreadId &&
            blockedChats.some(
                (b) =>
                    b.threadId === activeThreadId ||
                    threadIdForPeer(b.peer) === activeThreadId
            ))
    );

    const unreadTotal = useMemo(
        () =>
            conversations.reduce(
                (n, c) => n + (c.blocked ? 0 : c.unreadCount > 0 ? 1 : 0),
                0
            ),
        [conversations]
    );

    // App icon badge + tab title, like the Messages badge on the Home Screen.
    useEffect(() => {
        const title = unreadTotal > 0 ? `(${unreadTotal}) Messages` : "Messages";
        document.title = title;
        // Next.js re-applies the metadata title after client navigations
        // (opening/closing a thread), so restore ours whenever it changes.
        const observer = new MutationObserver(() => {
            if (document.title !== title) document.title = title;
        });
        observer.observe(document.head, {
            childList: true,
            characterData: true,
            subtree: true,
        });
        const nav = navigator as Navigator & {
            setAppBadge?: (n?: number) => Promise<void>;
            clearAppBadge?: () => Promise<void>;
        };
        if (unreadTotal > 0) nav.setAppBadge?.(unreadTotal).catch(() => {});
        else nav.clearAppBadge?.().catch(() => {});
        return () => observer.disconnect();
    }, [unreadTotal]);

    // ---------- actions ----------
    const setSimSlot = useCallback((slot: 0 | 1) => {
        setSimSlotState(slot);
        saveSimSlot(slot);
    }, []);

    const deliver = useCallback(
        async (tid: string, to: string, text: string, tempId: string, slot: 0 | 1) => {
            const s = sessionRef.current;
            if (!s) return;
            try {
                await sendSms(s.pairToken, { to, body: text, simSlotIndex: slot });
                await Promise.all([refreshConversations(), refreshThread(tid)]);
            } catch (e) {
                setMessagesByThread((prev) => ({
                    ...prev,
                    [tid]: (prev[tid] ?? []).map((m) =>
                        m.id === tempId ? { ...m, status: "failed" } : m
                    ),
                }));
                toast({ title: "Not Delivered", body: errorText(e), tone: "error" });
            }
        },
        [refreshConversations, refreshThread, toast]
    );

    const sendMessage = useCallback(
        async (raw: string) => {
            const text = raw.trim();
            const to = activePeer.trim();
            const tid = activeThreadId;
            if (!text || !to || !tid) return;
            if (activeBlocked) {
                toast({
                    title: "Contact Blocked",
                    body: "Unblock this conversation to send messages.",
                });
                return;
            }
            const tempId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const optimistic: Message = {
                id: tempId,
                threadId: tid,
                peer: to,
                peerName: activeName,
                direction: "out",
                body: text,
                bodyIsEncrypted: 0,
                ts: Date.now(),
                status: "queued",
                deliveredAt: null,
                simSlotIndex: simSlot,
                subscriptionId: null,
                createdBy: "pwa",
            };
            setMessagesByThread((prev) => ({
                ...prev,
                [tid]: [...(prev[tid] ?? []), optimistic],
            }));
            await deliver(tid, to, text, tempId, simSlot);
        },
        [activePeer, activeThreadId, activeBlocked, activeName, simSlot, deliver, toast]
    );

    const retryMessage = useCallback(
        async (m: Message) => {
            const tid = m.threadId;
            const tempId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const slot: 0 | 1 = m.simSlotIndex === 1 ? 1 : 0;
            setMessagesByThread((prev) => ({
                ...prev,
                [tid]: [
                    ...(prev[tid] ?? []).filter((x) => x.id !== m.id),
                    { ...m, id: tempId, status: "queued", ts: Date.now() },
                ],
            }));
            await deliver(tid, m.peer, m.body, tempId, slot);
        },
        [deliver]
    );

    const blockThread = useCallback(
        async (threadId: string, peer: string) => {
            const s = sessionRef.current;
            if (!s) return false;
            try {
                await apiBlockThread(s.pairToken, { threadId, peer });
                await Promise.all([refreshConversations(), refreshBlocked()]);
                toast({
                    title: "Contact Blocked",
                    body: "You won't receive messages from this number.",
                });
                return true;
            } catch (e) {
                toast({ title: "Couldn't Block", body: errorText(e), tone: "error" });
                return false;
            }
        },
        [refreshConversations, refreshBlocked, toast]
    );

    const unblockThread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return false;
            try {
                await apiUnblockThread(s.pairToken, threadId);
                await Promise.all([refreshConversations(), refreshBlocked()]);
                toast({ title: "Contact Unblocked", tone: "success" });
                return true;
            } catch (e) {
                toast({ title: "Couldn't Unblock", body: errorText(e), tone: "error" });
                return false;
            }
        },
        [refreshConversations, refreshBlocked, toast]
    );

    const deleteThread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return false;
            // Optimistically remove the row so the list animates immediately.
            const snapshot = conversations;
            setConversations((prev) => prev.filter((c) => c.threadId !== threadId));
            try {
                await apiDeleteThread(s.pairToken, threadId);
                setMessagesByThread((prev) => {
                    const next = { ...prev };
                    delete next[threadId];
                    return next;
                });
                if (activeRef.current === threadId) closeThread();
                await Promise.all([refreshConversations(), refreshBlocked()]);
                return true;
            } catch (e) {
                setConversations(snapshot);
                toast({ title: "Couldn't Delete", body: errorText(e), tone: "error" });
                return false;
            }
        },
        [conversations, closeThread, refreshConversations, refreshBlocked, toast]
    );

    const markUnread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return;
            // An open thread would immediately mark itself read again, so close it.
            if (activeRef.current === threadId) closeThread();
            readMarks.current.delete(threadId);
            setConversations((prev) =>
                prev.map((c) =>
                    c.threadId === threadId
                        ? { ...c, unreadCount: Math.max(1, c.unreadCount) }
                        : c
                )
            );
            try {
                await markThreadUnread(s.pairToken, threadId);
            } catch (e) {
                toast({
                    title: "Couldn't Mark as Unread",
                    body: errorText(e),
                    tone: "error",
                });
            }
            refreshConversations();
        },
        [closeThread, refreshConversations, toast]
    );

    const markRead = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return;
            setConversations((prev) =>
                prev.map((c) => (c.threadId === threadId ? { ...c, unreadCount: 0 } : c))
            );
            try {
                await markThreadRead(s.pairToken, threadId);
            } catch (e) {
                toast({
                    title: "Couldn't Mark as Read",
                    body: errorText(e),
                    tone: "error",
                });
            }
            refreshConversations();
        },
        [refreshConversations, toast]
    );

    const saveContact = useCallback(
        async (displayName: string, number: string) => {
            const s = sessionRef.current;
            if (!s) return null;
            try {
                const res = await upsertContact(s.pairToken, { displayName, number });
                const tid = threadIdForPeer(res.contact.rawNumber || res.contact.norm);
                setPendingNames((prev) => ({ ...prev, [tid]: res.contact.displayName }));
                await refreshConversations();
                if (activeRef.current) refreshThread(activeRef.current);
                toast({ title: "Contact Saved", tone: "success" });
                return res.contact;
            } catch (e) {
                toast({
                    title: "Couldn't Save Contact",
                    body: errorText(e),
                    tone: "error",
                });
                return null;
            }
        },
        [refreshConversations, refreshThread, toast]
    );

    const value: AppState = {
        session,
        status,
        signIn,
        signOut,
        conversations,
        conversationsLoaded,
        refreshConversations,
        blockedChats,
        refreshBlocked,
        messagesByThread,
        loadingThreadId,
        refreshThread,
        activeThreadId,
        activePeer,
        activeName,
        activeBlocked,
        openThread,
        closeThread,
        simSlot,
        setSimSlot,
        sendMessage,
        retryMessage,
        blockThread,
        unblockThread,
        deleteThread,
        markUnread,
        markRead,
        saveContact,
        unreadTotal,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
