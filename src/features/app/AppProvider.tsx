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
import { useSearchParams } from "next/navigation";
import {
    ApiError,
    apiUrl,
    blockThread as apiBlockThread,
    type BlockedChat,
    type Contact,
    type Conversation,
    deleteFailedMessage,
    deleteThread as apiDeleteThread,
    listBlockedChats,
    listConversations,
    listMessages,
    markThreadRead,
    markThreadUnread,
    type Message,
    isAuthError,
    pairMe,
    revokeDevice,
    sendSms,
    unblockThread as apiUnblockThread,
    upsertContact,
} from "@/lib/api";
import { threadIdForPeer } from "@/lib/phone";
import { disablePush, resyncPush } from "@/lib/push";
import {
    clearCachedInbox,
    clearDrafts,
    clearPairToken,
    clearSession,
    getOrCreateDeviceId,
    loadCachedInbox,
    loadSession,
    saveCachedInbox,
    saveSession,
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

/** "offline": a token exists but the server couldn't verify it and nothing is cached. */
type SessionStatus = "loading" | "signedOut" | "ready" | "offline";

export type OpenThreadInput = { threadId?: string; peer: string; name?: string | null };

export type OlderMessagesState = "more" | "loading" | "end";

export type AppState = {
    session: Session | null;
    status: SessionStatus;
    signIn: (s: Session) => void;
    signOut: () => void;
    retryConnect: () => void;

    conversations: Conversation[];
    conversationsLoaded: boolean;
    /** The last list load failed for a non-auth reason. */
    conversationsError: boolean;
    /** `background` skips the request while another list load is in flight. */
    refreshConversations: (opts?: { background?: boolean }) => Promise<void>;

    blockedChats: BlockedChat[];
    refreshBlocked: () => Promise<void>;
    /** Thread ids with a block/unblock request in flight. */
    pendingBlock: ReadonlySet<string>;

    messagesByThread: Record<string, Message[]>;
    loadingThreadId: string | null;
    /** `background` skips the request while one for the same thread is in flight. */
    refreshThread: (threadId: string, opts?: { background?: boolean }) => Promise<void>;
    /** The initial load of that thread failed and nothing is cached. */
    threadErrors: Record<string, boolean>;
    /** Whether earlier messages exist beyond what is loaded, per thread. */
    olderMessages: Record<string, OlderMessagesState>;
    loadOlderMessages: (threadId: string) => Promise<void>;

    activeThreadId: string | null;
    activePeer: string;
    activeName: string | null;
    activeBlocked: boolean;
    openThread: (input: OpenThreadInput) => void;
    closeThread: () => void;

    simSlot: 0 | 1;
    setSimSlot: (slot: 0 | 1) => void;

    sendMessage: (text: string) => Promise<void>;
    /** Local rows resend with the same id and SIM; failed server rows may pick a SIM. */
    retryMessage: (m: Message, opts?: { slot?: 0 | 1 }) => Promise<void>;
    /** Drops an unsent or failed message (and deletes a failed server row). */
    discardMessage: (m: Message) => Promise<void>;
    blockThread: (threadId: string, peer: string) => Promise<boolean>;
    unblockThread: (threadId: string) => Promise<boolean>;
    deleteThread: (threadId: string) => Promise<boolean>;
    markUnread: (threadId: string) => void;
    markRead: (threadId: string) => void;
    saveContact: (displayName: string, number: string) => Promise<Contact | null>;

    /** Copies a verification code with a toast; falls back to a tap-to-copy toast. */
    copyCode: (code: string) => void;

    /** "offline" when the browser is offline or list loads keep failing. */
    connection: "ok" | "offline";
    /** Whole minutes (in ms) since the Android gateway last polled; null if unknown. */
    gatewayIdleMs: number | null;

    unreadTotal: number;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
    return ctx;
}

const POLL_MS = 12_000;
/** Rows fetched when a thread is first opened, and per "Load Earlier Messages". */
const PAGE_SIZE = 100;
/** Rows fetched by polls of a thread that is already loaded. */
const POLL_PAGE_SIZE = 40;
const CACHE_THREADS = 10;
const CACHE_MESSAGES = 40;

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

function isAbort(e: unknown): boolean {
    return (e as Error | null)?.name === "AbortError";
}

/** A v4 UUID, also outside secure contexts where crypto.randomUUID is missing. */
function newId(): string {
    const c = typeof crypto !== "undefined" ? crypto : undefined;
    if (typeof c?.randomUUID === "function") return c.randomUUID();
    const b = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- structural sharing ----------

function shallowEqual(a: object, b: object): boolean {
    if (a === b) return true;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (
            !Object.prototype.hasOwnProperty.call(b, k) ||
            (a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]
        ) {
            return false;
        }
    }
    return true;
}

/**
 * Returns `prev` itself when nothing changed, so a poll with no news causes no
 * re-render; otherwise `next` with every unchanged element swapped for the
 * previous object (memoized rows and bubbles then skip rendering).
 */
function reuseList<T extends object>(prev: T[], next: T[], key: (t: T) => string): T[] {
    if (prev.length === next.length && next.every((n, i) => shallowEqual(prev[i], n))) {
        return prev;
    }
    const byKey = new Map(prev.map((p) => [key(p), p] as const));
    return next.map((n) => {
        const p = byKey.get(key(n));
        return p && shallowEqual(p, n) ? p : n;
    });
}

function byTsThenId(a: Message, b: Message): number {
    return a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Merges a page of the newest server messages into what is loaded.
 * - Earlier rows outside the page are kept, unless a full page shares no row
 *   with them (a gap could hide messages between the two, so they're dropped).
 * - A short page is the whole thread, so nothing older is kept.
 * - Optimistic rows stay until the server returns their id. While a retry is
 *   in flight, the local copy beats the server's failed row it is retrying in
 *   place (`retrying`), and a failed row being replaced by a new id is hidden.
 */
function mergeLatest(
    prevAll: Message[],
    rawPage: Message[],
    limit: number,
    retry: { retrying: ReadonlySet<string>; hidden: ReadonlySet<string> }
): Message[] {
    const page = retry.hidden.size
        ? rawPage.filter((m) => !retry.hidden.has(m.id))
        : rawPage;
    const pageIds = new Set(page.map((m) => m.id));
    const prevById = new Map(prevAll.map((m) => [m.id, m] as const));
    const complete = rawPage.length < limit;
    const overlap = prevAll.some((m) => !m.local && pageIds.has(m.id));
    // Same (ts, id) order as the server's keyset, so loaded rows sharing the
    // page's oldest timestamp are kept rather than dropped.
    const oldest = page[0];
    const older =
        !complete && overlap && oldest
            ? prevAll.filter(
                  (m) => !m.local && byTsThenId(m, oldest) < 0 && !pageIds.has(m.id)
              )
            : [];
    const rows = page.map((m) => {
        const p = prevById.get(m.id);
        return p &&
            p.local &&
            p.status === "queued" &&
            m.status === "failed" &&
            retry.retrying.has(m.id)
            ? p
            : m;
    });
    const locals = prevAll.filter((m) => m.local && !pageIds.has(m.id));
    const merged = [...older, ...rows, ...locals].sort(byTsThenId);
    return reuseList(prevAll, merged, (m) => m.id);
}

/** Adds an older page in front of what is loaded. */
function mergeOlder(prevAll: Message[], page: Message[]): Message[] {
    const have = new Set(prevAll.map((m) => m.id));
    const added = page.filter((m) => !have.has(m.id));
    if (!added.length) return prevAll;
    return [...added, ...prevAll].sort(byTsThenId);
}

// ---------- navigation ----------

let navTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Flags the next history change as the app's own (not a browser gesture), so
 * CompactStack animates it. Cleared 700 ms later.
 */
function markNav() {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    el.dataset.navSource = "app";
    if (navTimer) clearTimeout(navTimer);
    navTimer = setTimeout(() => {
        delete el.dataset.navSource;
        navTimer = undefined;
    }, 700);
}

/** The thread in the current URL, read from `location` (updated synchronously). */
function threadInUrl(): string | null {
    if (typeof location === "undefined") return null;
    const q = new URLSearchParams(location.search);
    const peer = q.get("peer");
    return q.get("tid") || (peer ? threadIdForPeer(peer) : null) || null;
}

type WaitingSend = {
    tid: string;
    to: string;
    text: string;
    id: string;
    slot: 0 | 1;
    replaces?: string;
};

type DeliverResult = "ok" | "offline" | "failed";

export function AppProvider({ children }: { children: React.ReactNode }) {
    const params = useSearchParams();
    const toast = useToast();

    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<SessionStatus>("loading");

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoaded, setConversationsLoaded] = useState(false);
    const [conversationsError, setConversationsError] = useState(false);
    // True once the list came from the server (not the launch cache) this session.
    const [conversationsFresh, setConversationsFresh] = useState(false);
    const [blockedChats, setBlockedChats] = useState<BlockedChat[]>([]);
    const [pendingBlock, setPendingBlock] = useState<ReadonlySet<string>>(
        () => new Set<string>()
    );
    const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>(
        {}
    );
    const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
    const [threadErrors, setThreadErrors] = useState<Record<string, boolean>>({});
    const [olderMessages, setOlderMessages] = useState<
        Record<string, OlderMessagesState>
    >({});
    const [simSlot, setSimSlotState] = useState<0 | 1>(0);
    // Names for threads opened from contacts before any message exists.
    const [pendingNames, setPendingNames] = useState<Record<string, string>>({});
    const [online, setOnline] = useState(true);
    const [failing, setFailing] = useState(false);
    const [gatewayIdleMs, setGatewayIdleMs] = useState<number | null>(null);

    const urlThreadId = params.get("tid");
    const urlPeer = params.get("peer");
    const activeThreadId = urlThreadId || (urlPeer ? threadIdForPeer(urlPeer) : null);

    // Refs mirror state so stable callbacks can read the latest values.
    const sessionRef = useRef(session);
    sessionRef.current = session;
    const activeRef = useRef(activeThreadId);
    activeRef.current = activeThreadId;
    const conversationsRef = useRef(conversations);
    conversationsRef.current = conversations;
    const messagesRef = useRef(messagesByThread);
    messagesRef.current = messagesByThread;
    const blockedRef = useRef(blockedChats);
    blockedRef.current = blockedChats;

    // Latest inbound message id already marked read, per thread, so polling the
    // open thread only posts /read when a new message has actually arrived.
    const readMarks = useRef(new Map<string, string>());
    const threadReq = useRef<{ tid: string; ac: AbortController } | null>(null);
    const olderRef = useRef<Record<string, OlderMessagesState>>({});
    const pendingRef = useRef<Set<string>>(new Set());
    const gatewayIdleRef = useRef<number | null>(null);

    // List refresh sequencing: a response is dropped when a newer request was
    // started or an optimistic mutation happened after it was sent.
    const convReq = useRef(0);
    const mutationSeq = useRef(0);
    const convInFlight = useRef(false);
    const convQueued = useRef(false);
    const pollFailures = useRef(0);

    // Sends waiting for the network, in order; and the failed server row each
    // retried message replaces.
    const waitingRef = useRef(new Map<string, WaitingSend>());
    const flushingRef = useRef(false);
    const flushRef = useRef<() => Promise<void>>(async () => {});
    const replacesRef = useRef(new Map<string, string>());

    // Launch cache of the inbox.
    const recentThreads = useRef<string[]>([]);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hydratedFor = useRef<string | null>(null);

    // history.back() in flight, and a thread to open once it has landed.
    const closingRef = useRef(false);
    const pendingOpen = useRef<OpenThreadInput | null>(null);
    const refreshConvRef = useRef<(opts?: { background?: boolean }) => Promise<void>>(
        async () => {}
    );

    // ---------- small state helpers ----------
    const setOlder = useCallback((tid: string, v: OlderMessagesState) => {
        if (olderRef.current[tid] === v) return;
        olderRef.current = { ...olderRef.current, [tid]: v };
        setOlderMessages(olderRef.current);
    }, []);

    const setPending = useCallback((tid: string, on: boolean) => {
        const next = new Set(pendingRef.current);
        if (on) next.add(tid);
        else next.delete(tid);
        pendingRef.current = next;
        setPendingBlock(next);
    }, []);

    const patchMessage = useCallback(
        (tid: string, id: string, patch: Partial<Message>) => {
            setMessagesByThread((prev) => {
                const list = prev[tid];
                if (!list || !list.some((m) => m.id === id)) return prev;
                return {
                    ...prev,
                    [tid]: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
                };
            });
        },
        []
    );

    const touchRecent = useCallback((tid: string) => {
        const r = recentThreads.current.filter((t) => t !== tid);
        r.unshift(tid);
        recentThreads.current = r.slice(0, CACHE_THREADS);
    }, []);

    const scheduleCacheSave = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveTimer.current = null;
            const s = sessionRef.current;
            if (!s) return;
            const threads: Record<string, Message[]> = {};
            for (const tid of recentThreads.current) {
                const list = messagesRef.current[tid];
                if (list)
                    threads[tid] = list.filter((m) => !m.local).slice(-CACHE_MESSAGES);
            }
            saveCachedInbox(s.pairingId, {
                conversations: conversationsRef.current.slice(0, 200),
                threads,
            });
        }, 1000);
    }, []);

    /** Forgets everything held for the signed-in pairing (memory and storage). */
    const resetData = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        clearCachedInbox();
        clearDrafts();
        threadReq.current?.ac.abort();
        threadReq.current = null;
        convInFlight.current = false;
        convQueued.current = false;
        readMarks.current.clear();
        waitingRef.current.clear();
        replacesRef.current.clear();
        recentThreads.current = [];
        hydratedFor.current = null;
        olderRef.current = {};
        pendingRef.current = new Set();
        pollFailures.current = 0;
        gatewayIdleRef.current = null;
        convReq.current++;
        setConversations([]);
        setConversationsLoaded(false);
        setConversationsError(false);
        setConversationsFresh(false);
        setBlockedChats([]);
        setPendingBlock(new Set());
        setMessagesByThread({});
        setLoadingThreadId(null);
        setThreadErrors({});
        setOlderMessages({});
        setPendingNames({});
        setFailing(false);
        setGatewayIdleMs(null);
    }, []);

    // ---------- session ----------
    const [connectAttempt, setConnectAttempt] = useState(0);
    const retryConnect = useCallback(() => {
        setStatus("loading");
        setConnectAttempt((n) => n + 1);
    }, []);

    useEffect(() => {
        setSimSlotState(loadSimSlot());
        const token = loadPairToken();
        if (!token) {
            setStatus("signedOut");
            return;
        }

        // Open instantly from the last verified session; verify in the background.
        const cached = loadSession();
        const hasCache = cached?.pairToken === token;
        if (hasCache && cached) {
            setSession((prev) => prev ?? cached);
            setStatus("ready");
            // Show the last loaded inbox right away, once per pairing.
            if (hydratedFor.current !== cached.pairingId) {
                hydratedFor.current = cached.pairingId;
                const inbox = loadCachedInbox(cached.pairingId);
                if (inbox) {
                    setConversations((prev) =>
                        prev.length ? prev : inbox.conversations
                    );
                    setMessagesByThread((prev) =>
                        Object.keys(prev).length ? prev : inbox.threads
                    );
                    setConversationsLoaded(true);
                    recentThreads.current = Object.keys(inbox.threads).slice(
                        0,
                        CACHE_THREADS
                    );
                }
            }
        }

        let cancelled = false;
        pairMe(token)
            .then((me) => {
                if (cancelled) return;
                const fresh: Session = {
                    pairToken: token,
                    pairingId: me.pairingId,
                    gatewayDeviceId: me.gatewayDeviceId,
                    gatewayPubSpkiB64: me.gatewayPubSpkiB64,
                    demo: Boolean(me.demo) || token.startsWith("demo:"),
                };
                saveSession(fresh);
                // Keep the same object when nothing changed so data effects don't restart.
                setSession((prev) =>
                    prev &&
                    prev.pairingId === fresh.pairingId &&
                    prev.gatewayDeviceId === fresh.gatewayDeviceId &&
                    prev.demo === fresh.demo
                        ? prev
                        : fresh
                );
                setStatus("ready");
                // Make sure the server holds this browser's current push subscription.
                resyncPush(token).catch(() => {});
            })
            .catch((e) => {
                if (cancelled) return;
                if (isAuthError(e)) {
                    // The server no longer accepts this device.
                    clearPairToken();
                    clearSession();
                    resetData();
                    setSession(null);
                    setStatus("signedOut");
                } else if (!hasCache) {
                    setStatus("offline");
                }
                // With a cached session, a network error just means we're offline.
            });
        return () => {
            cancelled = true;
        };
    }, [connectAttempt, resetData]);

    const signIn = useCallback((s: Session) => {
        savePairToken(s.pairToken);
        saveSession(s);
        setSession(s);
        setStatus("ready");
        resyncPush(s.pairToken).catch(() => {});
    }, []);

    const signOut = useCallback(() => {
        const token = sessionRef.current?.pairToken;
        // Best effort: revoke this browser's token on the server too.
        if (token) revokeDevice(token, getOrCreateDeviceId()).catch(() => {});
        // Unsubscribe so the Notifications switch reads Off after signing back in.
        disablePush().catch(() => {});
        clearPairToken();
        clearSession();
        resetData();
        setSession(null);
        setStatus("signedOut");
        const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
        nav.clearAppBadge?.().catch(() => {});
        markNav();
        history.replaceState({}, "", "/");
    }, [resetData]);

    // ---------- data ----------
    const refreshConversations = useCallback(
        async (opts?: { background?: boolean }) => {
            const s = sessionRef.current;
            if (!s) return;
            if (opts?.background && convInFlight.current) {
                // Run once more when the current load ends, so news isn't missed.
                convQueued.current = true;
                return;
            }
            const seq = ++convReq.current;
            const mut = mutationSeq.current;
            convInFlight.current = true;
            let superseded = false;
            try {
                const res = await listConversations(s.pairToken, 200);
                if (seq !== convReq.current) return;
                if (mut !== mutationSeq.current) {
                    // An optimistic change happened meanwhile; this data predates it.
                    superseded = true;
                    return;
                }
                const visible = document.visibilityState === "visible";
                const prevList = conversationsRef.current;
                const prevById = new Map(prevList.map((c) => [c.threadId, c] as const));
                const mapped = (res.conversations ?? []).map((c) => ({
                    ...c,
                    // Keep the optimistic value while a block/unblock is in flight.
                    blocked: pendingRef.current.has(c.threadId)
                        ? Boolean(prevById.get(c.threadId)?.blocked ?? c.blocked)
                        : Boolean(c.blocked),
                    // The open, visible thread is being read right now; its /read
                    // call (from refreshThread) may land after this response.
                    unreadCount:
                        visible && c.threadId === activeRef.current ? 0 : c.unreadCount,
                }));
                // Threads read on another device: drop their notifications here too.
                for (const c of mapped) {
                    const p = prevById.get(c.threadId);
                    if (p && p.unreadCount > 0 && c.unreadCount === 0) {
                        clearThreadNotifications(c.threadId);
                    }
                }
                setConversations((prev) => reuseList(prev, mapped, (c) => c.threadId));
                setConversationsLoaded(true);
                setConversationsError(false);
                setConversationsFresh(true);
                pollFailures.current = 0;
                setFailing(false);

                const raw = res.gatewayIdleMs;
                const idle =
                    typeof raw === "number" && Number.isFinite(raw)
                        ? Math.floor(Math.max(0, raw) / 60_000) * 60_000
                        : null;
                if (idle !== gatewayIdleRef.current) {
                    gatewayIdleRef.current = idle;
                    setGatewayIdleMs(idle);
                }

                scheduleCacheSave();
                void flushRef.current();
            } catch (e) {
                if (seq !== convReq.current) return;
                // A revoked token signs the device out instead of failing quietly forever.
                if (isAuthError(e)) {
                    toast({
                        title: "Signed out",
                        body: "This device's access was revoked.",
                        tone: "error",
                    });
                    signOut();
                    return;
                }
                setConversationsLoaded(true);
                setConversationsError(true);
                pollFailures.current += 1;
                if (pollFailures.current >= 2) setFailing(true);
            } finally {
                if (seq === convReq.current) {
                    convInFlight.current = false;
                    if (superseded || convQueued.current) {
                        convQueued.current = false;
                        void refreshConvRef.current({ background: true });
                    }
                }
            }
        },
        [scheduleCacheSave, signOut, toast]
    );
    refreshConvRef.current = refreshConversations;

    const refreshBlocked = useCallback(async () => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const res = await listBlockedChats(s.pairToken);
            setBlockedChats((prev) =>
                reuseList(prev, res.blockedChats ?? [], (b) => b.threadId)
            );
        } catch {
            // Non-critical; blocked state is also reflected on conversations.
        }
    }, []);

    const refreshThread = useCallback(
        async (threadId: string, opts?: { background?: boolean }) => {
            const s = sessionRef.current;
            if (!s || !threadId) return;

            const current = threadReq.current;
            // A slow poll must finish rather than be restarted by the next tick.
            if (opts?.background && current?.tid === threadId) return;
            current?.ac.abort();
            const ac = new AbortController();
            const req = { tid: threadId, ac };
            threadReq.current = req;

            const initial = !(threadId in messagesRef.current);
            const limit = initial ? PAGE_SIZE : POLL_PAGE_SIZE;
            if (initial) setLoadingThreadId(threadId);
            try {
                const res = await listMessages(s.pairToken, threadId, limit, {
                    signal: ac.signal,
                });
                if (ac.signal.aborted || sessionRef.current?.pairToken !== s.pairToken) {
                    return;
                }
                const page = res.messages ?? [];

                // Earlier-messages state: a short page is the whole thread; a full
                // page is "more" on first load or when it replaced older rows.
                const prevAll = messagesRef.current[threadId] ?? [];
                const pageIds = new Set(page.map((m) => m.id));
                const gap =
                    page.length >= limit &&
                    prevAll.some((m) => !m.local) &&
                    !prevAll.some((m) => !m.local && pageIds.has(m.id));
                const olderNow = olderRef.current[threadId];
                if (olderNow !== "loading") {
                    if (page.length < limit) setOlder(threadId, "end");
                    else if (initial || olderNow === undefined || gap) {
                        setOlder(threadId, "more");
                    }
                }

                const retrying = new Set<string>();
                const hidden = new Set<string>();
                for (const [id, replaced] of replacesRef.current) {
                    if (id === replaced) retrying.add(id);
                    else hidden.add(replaced);
                }
                setMessagesByThread((prev) => {
                    const before = prev[threadId] ?? [];
                    const next = mergeLatest(before, page, limit, { retrying, hidden });
                    return next === before && threadId in prev
                        ? prev
                        : { ...prev, [threadId]: next };
                });
                setThreadErrors((prev) => {
                    if (!prev[threadId]) return prev;
                    const next = { ...prev };
                    delete next[threadId];
                    return next;
                });
                touchRecent(threadId);
                scheduleCacheSave();

                // Mark read only while the thread is on screen, and only when a new
                // inbound message has arrived since the last time we marked it.
                const latestIn = [...page].reverse().find((m) => m.direction === "in");
                if (
                    latestIn &&
                    activeRef.current === threadId &&
                    document.visibilityState === "visible" &&
                    readMarks.current.get(threadId) !== latestIn.id
                ) {
                    readMarks.current.set(threadId, latestIn.id);
                    clearThreadNotifications(threadId);
                    setConversations((prev) =>
                        prev.some((c) => c.threadId === threadId && c.unreadCount !== 0)
                            ? prev.map((c) =>
                                  c.threadId === threadId ? { ...c, unreadCount: 0 } : c
                              )
                            : prev
                    );
                    markThreadRead(s.pairToken, threadId).catch(() => {});
                }
            } catch (e) {
                if (ac.signal.aborted || isAbort(e)) return;
                // Keep showing what we have; the next poll retries.
                if (initial) {
                    setThreadErrors((prev) =>
                        prev[threadId] ? prev : { ...prev, [threadId]: true }
                    );
                }
            } finally {
                const replacedBySameThread =
                    ac.signal.aborted && threadReq.current?.tid === threadId;
                if (initial && !replacedBySameThread) {
                    setLoadingThreadId((cur) => (cur === threadId ? null : cur));
                }
                if (threadReq.current === req) threadReq.current = null;
            }
        },
        [scheduleCacheSave, setOlder, touchRecent]
    );

    const loadOlderMessages = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s || olderRef.current[threadId] !== "more") return;
            const loaded = (messagesRef.current[threadId] ?? []).filter((m) => !m.local);
            if (!loaded.length) return;
            // Keyset cursor (ts, id) of the oldest loaded row: rows sharing its
            // timestamp aren't skipped at the page boundary.
            const oldest = loaded.reduce((min, m) => (byTsThenId(m, min) < 0 ? m : min));
            setOlder(threadId, "loading");
            try {
                const res = await listMessages(s.pairToken, threadId, PAGE_SIZE, {
                    before: oldest.ts,
                    beforeId: oldest.id,
                });
                if (sessionRef.current?.pairToken !== s.pairToken) return;
                const page = res.messages ?? [];
                setMessagesByThread((prev) => {
                    const cur = prev[threadId] ?? [];
                    const next = mergeOlder(cur, page);
                    return next === cur ? prev : { ...prev, [threadId]: next };
                });
                setOlder(threadId, page.length >= PAGE_SIZE ? "more" : "end");
            } catch {
                setOlder(threadId, "more");
                toast({ title: "Couldn't Load Messages", tone: "error" });
            }
        },
        [setOlder, toast]
    );

    // Initial load + polling (+ live events where a long-lived stream exists).
    useEffect(() => {
        if (!session) return;
        void refreshConversations();
        void refreshBlocked();

        // Serverless (Vercel) only answers the stream with a one-shot hello, so
        // it is opened only where real streaming exists. Elsewhere polling plus
        // the service worker's "sms" message keep things fresh.
        let es: EventSource | null = null;
        if (process.env.NEXT_PUBLIC_REALTIME === "sse") {
            es = new EventSource(
                apiUrl(`/api/sms/stream?pt=${encodeURIComponent(session.pairToken)}`)
            );
            const onThreadEvent = (ev: Event) => {
                try {
                    const data = JSON.parse((ev as MessageEvent).data || "{}");
                    const tid = String(
                        data.threadId || threadIdForPeer(String(data.peer || ""))
                    );
                    void refreshConversations({ background: true });
                    if (tid && activeRef.current === tid) void refreshThread(tid);
                } catch {
                    // ignore malformed events
                }
            };
            es.addEventListener("message", onThreadEvent);
            es.addEventListener("status", onThreadEvent);
            es.addEventListener("contacts", () => {
                void refreshConversations({ background: true });
                if (activeRef.current) void refreshThread(activeRef.current);
            });
            es.addEventListener("chats", () => {
                void refreshConversations({ background: true });
                void refreshBlocked();
            });
        }

        const tick = () => {
            if (document.visibilityState !== "visible") return;
            void refreshConversations({ background: true });
            if (activeRef.current) {
                void refreshThread(activeRef.current, { background: true });
            }
        };
        const timer = window.setInterval(tick, POLL_MS);
        // Refresh immediately when the app returns to the foreground.
        document.addEventListener("visibilitychange", tick);
        window.addEventListener("online", tick);

        return () => {
            es?.close();
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", tick);
            window.removeEventListener("online", tick);
        };
    }, [session, refreshConversations, refreshBlocked, refreshThread]);

    useEffect(() => {
        if (!session || !activeThreadId) return;
        // Opening a thread always marks it read, even if it was marked unread.
        readMarks.current.delete(activeThreadId);
        void refreshThread(activeThreadId);
    }, [session, activeThreadId, refreshThread]);

    // ---------- connection ----------
    useEffect(() => {
        setOnline(navigator.onLine);
        const on = () => {
            setOnline(true);
            void flushRef.current();
        };
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    const connection: "ok" | "offline" = !online || failing ? "offline" : "ok";

    // ---------- navigation ----------
    // Threads are pushed with the History API, not next/router: Next keeps
    // useSearchParams in sync with pushState/replaceState, and nothing asks the
    // server for a new RSC payload, so opening a thread is instant and works offline.
    const openThread = useCallback(({ threadId, peer, name }: OpenThreadInput) => {
        const tid = threadId || threadIdForPeer(peer);
        if (!tid) return;
        if (closingRef.current) {
            // A history.back() is still landing; open once it has.
            pendingOpen.current = { threadId: tid, peer, name };
            return;
        }
        if (name) setPendingNames((prev) => ({ ...prev, [tid]: name }));
        if (conversationsRef.current.some((c) => c.threadId === tid && c.unreadCount)) {
            mutationSeq.current++;
            setConversations((prev) =>
                prev.map((c) => (c.threadId === tid ? { ...c, unreadCount: 0 } : c))
            );
        }
        const href = `/?tid=${encodeURIComponent(tid)}&peer=${encodeURIComponent(peer)}`;
        markNav();
        // Fresh state objects (without Next's __NA marker) make Next sync its router.
        if (threadInUrl()) {
            history.replaceState(
                { thread: tid, pushed: Boolean(history.state?.pushed) },
                "",
                href
            );
        } else {
            history.pushState({ thread: tid, pushed: true }, "", href);
        }
    }, []);

    const closeThread = useCallback(() => {
        // The keyboard leaves together with the pop.
        (document.activeElement as HTMLElement | null)?.blur?.();
        if (closingRef.current) return;
        markNav();
        if (history.state?.pushed) {
            closingRef.current = true;
            history.back();
            // Failsafe in case popstate never arrives.
            setTimeout(() => {
                closingRef.current = false;
            }, 1000);
        } else if (threadInUrl()) {
            history.replaceState({}, "", "/");
        }
    }, []);

    useEffect(() => {
        const onPop = () => {
            closingRef.current = false;
            const next = pendingOpen.current;
            pendingOpen.current = null;
            if (next) openThread(next);
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [openThread]);

    // A thread opened cold (notification, deep link) has no list under it, so
    // Back would leave the app. On the first tap or key press (a user activation,
    // or Chrome marks the entry skippable) slip a list entry in underneath.
    // Spreading history.state keeps Next's __NA marker, so its router ignores it.
    useEffect(() => {
        if (status !== "ready" || !activeThreadId || history.state?.pushed) return;
        const tid = activeThreadId;
        const remove = () => {
            window.removeEventListener("pointerup", run, true);
            window.removeEventListener("keydown", run, true);
        };
        function run() {
            remove();
            if (history.state?.pushed || !threadInUrl()) return;
            const href = location.pathname + location.search;
            markNav();
            history.replaceState(
                { ...history.state, thread: undefined, pushed: undefined },
                "",
                "/"
            );
            history.pushState({ ...history.state, thread: tid, pushed: true }, "", href);
        }
        window.addEventListener("pointerup", run, true);
        window.addEventListener("keydown", run, true);
        return remove;
    }, [status, activeThreadId]);

    // ---------- notifications & verification codes ----------
    const copyCode = useCallback(
        (code: string) => {
            const copy = (): Promise<void> => {
                try {
                    return navigator.clipboard
                        .writeText(code)
                        .then(() =>
                            toast({ title: "Code Copied", body: code, tone: "success" })
                        );
                } catch (e) {
                    return Promise.reject(e);
                }
            };
            copy().catch(() => {
                // Some browsers (Safari) only allow copying from a tap.
                toast({
                    title: `Tap to copy ${code}`,
                    body: "Verification code from your notification",
                    duration: 8000,
                    onPress: () => {
                        copy().catch(() =>
                            toast({ title: "Couldn't Copy", tone: "error" })
                        );
                    },
                });
            });
        },
        [toast]
    );

    // Messages from the service worker: notification taps (handled in the running
    // app instead of reloading it), a push arrived, or the push subscription changed.
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        const onMessage = (e: MessageEvent) => {
            const data = e.data;
            if (!data || typeof data !== "object") return;
            if (data.type === "open-url" && typeof data.url === "string") {
                let u: URL;
                try {
                    u = new URL(data.url, location.href);
                } catch {
                    return;
                }
                const tid = u.searchParams.get("tid");
                const peer = u.searchParams.get("peer") ?? "";
                const code = u.searchParams.get("code");
                window.dispatchEvent(new Event("app:external-open"));
                if (tid || peer) openThread({ threadId: tid ?? undefined, peer });
                if (code) copyCode(code);
            } else if (data.type === "sms") {
                void refreshConversations({ background: true });
                const tid = typeof data.threadId === "string" ? data.threadId : null;
                if (tid && activeRef.current === tid) void refreshThread(tid);
            } else if (data.type === "push-resync") {
                const s = sessionRef.current;
                if (s) resyncPush(s.pairToken).catch(() => {});
            }
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }, [openThread, copyCode, refreshConversations, refreshThread]);

    // ?code= comes from tapping an OTP notification: copy it, then drop it from the URL.
    const urlCode = params.get("code");
    useEffect(() => {
        if (!urlCode || status !== "ready") return;
        copyCode(urlCode);
        const next = new URLSearchParams(location.search);
        next.delete("code");
        const qs = next.toString();
        const { thread, pushed } = (history.state ?? {}) as {
            thread?: string;
            pushed?: boolean;
        };
        markNav();
        history.replaceState({ thread, pushed }, "", qs ? `/?${qs}` : "/");
    }, [urlCode, status, copyCode]);

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
        // The badge only follows server data: the launch cache may be stale, and
        // an empty list before the first load must not clear a real badge.
        if (conversationsFresh) {
            const nav = navigator as Navigator & {
                setAppBadge?: (n?: number) => Promise<void>;
                clearAppBadge?: () => Promise<void>;
            };
            if (unreadTotal > 0) nav.setAppBadge?.(unreadTotal).catch(() => {});
            else nav.clearAppBadge?.().catch(() => {});
        }
        return () => observer.disconnect();
    }, [unreadTotal, conversationsFresh]);

    // ---------- actions ----------
    const setSimSlot = useCallback((slot: 0 | 1) => {
        setSimSlotState(slot);
        saveSimSlot(slot);
    }, []);

    /**
     * Sends one message. The id doubles as the server's idempotency key, so
     * resending it (after a dropped response or from the waiting queue) never
     * sends a second SMS, and the bubble keeps its React key throughout.
     */
    const deliver = useCallback(
        async (w: WaitingSend): Promise<DeliverResult> => {
            const s = sessionRef.current;
            if (!s) return "failed";
            try {
                const res = await sendSms(s.pairToken, {
                    to: w.to,
                    body: w.text,
                    simSlotIndex: w.slot,
                    clientId: w.id,
                    ...(w.replaces ? { replacesMessageId: w.replaces } : {}),
                });
                replacesRef.current.delete(w.id);
                // An older server ignores clientId; follow the id it assigned.
                if (res?.id && res.id !== w.id) patchMessage(w.tid, w.id, { id: res.id });
                // Only refresh a thread that's still on screen: a non-background
                // refreshThread aborts whatever thread load is in flight, which
                // could be another conversation's first load.
                await Promise.all([
                    refreshConversations(),
                    activeRef.current === w.tid ? refreshThread(w.tid) : undefined,
                ]);
                return "ok";
            } catch (e) {
                if (e instanceof ApiError && e.status === 0) {
                    // Offline or timed out: wait for the network, then resend the same id.
                    patchMessage(w.tid, w.id, { status: "queued", waiting: true });
                    waitingRef.current = new Map([
                        [w.id, w],
                        ...[...waitingRef.current].filter(([id]) => id !== w.id),
                    ]);
                    return "offline";
                }
                patchMessage(w.tid, w.id, { status: "failed", waiting: false });
                toast({ title: "Not Delivered", body: errorText(e), tone: "error" });
                return "failed";
            }
        },
        [patchMessage, refreshConversations, refreshThread, toast]
    );

    /** Resends waiting messages in order; stops at the first one that is still offline. */
    const flushWaiting = useCallback(async () => {
        if (flushingRef.current || waitingRef.current.size === 0) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        flushingRef.current = true;
        try {
            for (;;) {
                const first = waitingRef.current.values().next();
                if (first.done) break;
                const w = first.value;
                waitingRef.current.delete(w.id);
                patchMessage(w.tid, w.id, { waiting: false });
                const result = await deliver(w);
                if (result === "offline") break;
            }
        } finally {
            flushingRef.current = false;
        }
    }, [deliver, patchMessage]);
    flushRef.current = flushWaiting;

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
            const id = newId();
            // Keep order: behind messages already waiting for the network.
            const queueBehind = waitingRef.current.size > 0;
            const optimistic: Message = {
                id,
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
                local: true,
                ...(queueBehind ? { waiting: true } : {}),
            };
            setMessagesByThread((prev) => ({
                ...prev,
                [tid]: [...(prev[tid] ?? []), optimistic],
            }));
            const w: WaitingSend = { tid, to, text, id, slot: simSlot };
            if (queueBehind) {
                waitingRef.current.set(id, w);
                await flushWaiting();
                return;
            }
            await deliver(w);
        },
        [
            activePeer,
            activeThreadId,
            activeBlocked,
            activeName,
            simSlot,
            deliver,
            flushWaiting,
            toast,
        ]
    );

    const retryMessage = useCallback(
        async (m: Message, opts?: { slot?: 0 | 1 }) => {
            const tid = m.threadId;
            if (m.local) {
                // Same id and SIM: the original may already be enqueued server-side.
                waitingRef.current.delete(m.id);
                const slot: 0 | 1 = m.simSlotIndex === 1 ? 1 : 0;
                patchMessage(tid, m.id, {
                    status: "queued",
                    waiting: false,
                    ts: Date.now(),
                });
                await deliver({
                    tid,
                    to: m.peer,
                    text: m.body,
                    id: m.id,
                    slot,
                    replaces: replacesRef.current.get(m.id),
                });
                return;
            }
            // A row the Android gateway reported as failed. Always resend under a
            // fresh id (the server deletes the failed row via replacesMessageId):
            // a gateway that remembers handled outbox ids would otherwise never
            // send the retry.
            const slot: 0 | 1 = opts?.slot ?? (m.simSlotIndex === 1 ? 1 : 0);
            const id = newId();
            const retry: Message = {
                ...m,
                id,
                local: true,
                waiting: false,
                status: "queued",
                ts: Date.now(),
                simSlotIndex: slot,
            };
            setMessagesByThread((prev) => {
                const list = (prev[tid] ?? []).filter((x) => x.id !== m.id);
                return { ...prev, [tid]: [...list, retry].sort(byTsThenId) };
            });
            replacesRef.current.set(id, m.id);
            await deliver({ tid, to: m.peer, text: m.body, id, slot, replaces: m.id });
        },
        [deliver, patchMessage]
    );

    const discardMessage = useCallback(
        async (m: Message) => {
            waitingRef.current.delete(m.id);
            const replaces = replacesRef.current.get(m.id);
            replacesRef.current.delete(m.id);
            setMessagesByThread((prev) => {
                const list = prev[m.threadId];
                if (!list || !list.some((x) => x.id === m.id)) return prev;
                return { ...prev, [m.threadId]: list.filter((x) => x.id !== m.id) };
            });
            // A failed server row (or the one a local retry was replacing) is
            // deleted on the server too, or the next poll would bring it back.
            const serverId = !m.local && m.status === "failed" ? m.id : replaces;
            const s = sessionRef.current;
            if (!serverId || !s) return;
            try {
                await deleteFailedMessage(s.pairToken, serverId);
            } catch (e) {
                // 404: already gone (or no longer failed); nothing to undo.
                if (e instanceof ApiError && e.status === 404) return;
                toast({ title: "Couldn't Delete", body: errorText(e), tone: "error" });
                void refreshThread(m.threadId);
            }
        },
        [refreshThread, toast]
    );

    const blockThread = useCallback(
        async (threadId: string, peer: string) => {
            const s = sessionRef.current;
            if (!s || pendingRef.current.has(threadId)) return false;
            setPending(threadId, true);
            mutationSeq.current++;
            const conv = conversationsRef.current.find((c) => c.threadId === threadId);
            const wasBlocked = Boolean(conv?.blocked);
            const prevEntry = blockedRef.current.find((b) => b.threadId === threadId);
            setConversations((prev) =>
                prev.map((c) => (c.threadId === threadId ? { ...c, blocked: true } : c))
            );
            setBlockedChats((prev) =>
                prev.some((b) => b.threadId === threadId)
                    ? prev
                    : [
                          ...prev,
                          {
                              threadId,
                              peer,
                              peerName: conv?.peerName ?? null,
                              note: null,
                              blockedAt: Date.now(),
                          },
                      ]
            );
            try {
                await apiBlockThread(s.pairToken, { threadId, peer });
                toast({
                    title: "Contact Blocked",
                    body: "You won't receive messages from this number.",
                });
                void refreshConversations();
                void refreshBlocked();
                return true;
            } catch (e) {
                setConversations((prev) =>
                    prev.map((c) =>
                        c.threadId === threadId ? { ...c, blocked: wasBlocked } : c
                    )
                );
                setBlockedChats((prev) =>
                    prevEntry ? prev : prev.filter((b) => b.threadId !== threadId)
                );
                toast({ title: "Couldn't Block", body: errorText(e), tone: "error" });
                return false;
            } finally {
                setPending(threadId, false);
            }
        },
        [refreshConversations, refreshBlocked, setPending, toast]
    );

    const unblockThread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s || pendingRef.current.has(threadId)) return false;
            setPending(threadId, true);
            mutationSeq.current++;
            const conv = conversationsRef.current.find((c) => c.threadId === threadId);
            const wasBlocked = Boolean(conv?.blocked);
            const prevEntry = blockedRef.current.find((b) => b.threadId === threadId);
            setConversations((prev) =>
                prev.map((c) => (c.threadId === threadId ? { ...c, blocked: false } : c))
            );
            setBlockedChats((prev) =>
                prev.some((b) => b.threadId === threadId)
                    ? prev.filter((b) => b.threadId !== threadId)
                    : prev
            );
            try {
                await apiUnblockThread(s.pairToken, threadId);
                toast({ title: "Contact Unblocked", tone: "success" });
                void refreshConversations();
                void refreshBlocked();
                return true;
            } catch (e) {
                setConversations((prev) =>
                    prev.map((c) =>
                        c.threadId === threadId ? { ...c, blocked: wasBlocked } : c
                    )
                );
                if (prevEntry) {
                    setBlockedChats((prev) =>
                        prev.some((b) => b.threadId === threadId)
                            ? prev
                            : [...prev, prevEntry]
                    );
                }
                toast({ title: "Couldn't Unblock", body: errorText(e), tone: "error" });
                return false;
            } finally {
                setPending(threadId, false);
            }
        },
        [refreshConversations, refreshBlocked, setPending, toast]
    );

    const deleteThread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return false;
            // Optimistically remove the row so the list animates immediately.
            mutationSeq.current++;
            const removed = conversationsRef.current.find((c) => c.threadId === threadId);
            const msgs = messagesRef.current[threadId];
            setConversations((prev) => prev.filter((c) => c.threadId !== threadId));
            // Leave the conversation first, so its view isn't showing deleted content.
            if (activeRef.current === threadId) closeThread();
            try {
                await apiDeleteThread(s.pairToken, threadId);
                setMessagesByThread((prev) => {
                    if (!(threadId in prev)) return prev;
                    const next = { ...prev };
                    delete next[threadId];
                    return next;
                });
                recentThreads.current = recentThreads.current.filter(
                    (t) => t !== threadId
                );
                void refreshConversations();
                void refreshBlocked();
                return true;
            } catch (e) {
                setConversations((prev) =>
                    removed && !prev.some((c) => c.threadId === removed.threadId)
                        ? [...prev, removed].sort((a, b) => b.lastTs - a.lastTs)
                        : prev
                );
                if (msgs) {
                    setMessagesByThread((prev) =>
                        threadId in prev ? prev : { ...prev, [threadId]: msgs }
                    );
                }
                toast({ title: "Couldn't Delete", body: errorText(e), tone: "error" });
                return false;
            }
        },
        [closeThread, refreshConversations, refreshBlocked, toast]
    );

    const markUnread = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return;
            // An open thread would immediately mark itself read again, so close it.
            if (activeRef.current === threadId) closeThread();
            readMarks.current.delete(threadId);
            mutationSeq.current++;
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
            void refreshConversations();
        },
        [closeThread, refreshConversations, toast]
    );

    const markRead = useCallback(
        async (threadId: string) => {
            const s = sessionRef.current;
            if (!s) return;
            mutationSeq.current++;
            setConversations((prev) =>
                prev.map((c) => (c.threadId === threadId ? { ...c, unreadCount: 0 } : c))
            );
            clearThreadNotifications(threadId);
            try {
                await markThreadRead(s.pairToken, threadId);
            } catch (e) {
                toast({
                    title: "Couldn't Mark as Read",
                    body: errorText(e),
                    tone: "error",
                });
            }
            void refreshConversations();
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
                mutationSeq.current++;
                await refreshConversations();
                if (activeRef.current) void refreshThread(activeRef.current);
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

    const value = useMemo<AppState>(
        () => ({
            session,
            status,
            signIn,
            signOut,
            retryConnect,
            conversations,
            conversationsLoaded,
            conversationsError,
            refreshConversations,
            blockedChats,
            refreshBlocked,
            pendingBlock,
            messagesByThread,
            loadingThreadId,
            refreshThread,
            threadErrors,
            olderMessages,
            loadOlderMessages,
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
            discardMessage,
            blockThread,
            unblockThread,
            deleteThread,
            markUnread,
            markRead,
            saveContact,
            copyCode,
            connection,
            gatewayIdleMs,
            unreadTotal,
        }),
        [
            session,
            status,
            signIn,
            signOut,
            retryConnect,
            conversations,
            conversationsLoaded,
            conversationsError,
            refreshConversations,
            blockedChats,
            refreshBlocked,
            pendingBlock,
            messagesByThread,
            loadingThreadId,
            refreshThread,
            threadErrors,
            olderMessages,
            loadOlderMessages,
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
            discardMessage,
            blockThread,
            unblockThread,
            deleteThread,
            markUnread,
            markRead,
            saveContact,
            copyCode,
            connection,
            gatewayIdleMs,
            unreadTotal,
        ]
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
