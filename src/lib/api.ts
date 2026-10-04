export type ApiOk<T> = T & { ok: true };
export type ApiErr = { ok: false; error: string };

export type PairMeRes = ApiOk<{
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    deviceId: string;
    deviceType: string;
    deviceLabel: string | null;
    createdAt: number;
    lastSeenAt: number | null;
    demo?: boolean;
}>;

export type PairCompleteRes = ApiOk<{
    pairToken: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    demo?: boolean;
}>;

export type Conversation = {
    threadId: string;
    peer: string;
    peerName: string | null;
    lastTs: number;
    lastPreview: string;
    lastBodyIsEncrypted: 0 | 1;
    unreadCount: number;
    blocked?: boolean;
};

export type ListConversationsRes = ApiOk<{
    conversations: Conversation[];
    /** Milliseconds since the Android gateway last polled the outbox (server clock). */
    gatewayIdleMs?: number | null;
}>;

export type Message = {
    id: string;
    threadId: string;
    peer: string;
    peerName: string | null;
    direction: "in" | "out";
    body: string;
    bodyIsEncrypted: 0 | 1;
    ts: number;
    status: "received" | "queued" | "sent" | "failed";
    deliveredAt: number | null;
    simSlotIndex: number | null;
    subscriptionId: number | null;
    createdBy: "android" | "pwa" | "telegram";
    /** Client-only: an optimistic row the server hasn't returned yet. */
    local?: boolean;
    /** Client-only: the send is queued until the network comes back. */
    waiting?: boolean;
};

export type ListMessagesRes = ApiOk<{ messages: Message[] }>;

export type Contact = {
    displayName: string;
    rawNumber: string | null;
    norm: string;
    source?: "android" | "web";
    nameLocked?: boolean;
};

export type Device = {
    deviceId: string;
    deviceType: string;
    deviceLabel: string | null;
    createdAt: number;
    lastSeenAt: number | null;
};

export type SendSmsRes = ApiOk<{ id: string; duplicate?: boolean }>;

export type ListContactsRes = ApiOk<{ contacts: Contact[] }>;

export type BlockedChat = {
    threadId: string;
    peer: string;
    peerName: string | null;
    note: string | null;
    blockedAt: number;
};

export type ListBlockedChatsRes = ApiOk<{ blockedChats: BlockedChat[] }>;

export type TelegramStatusRes = ApiOk<{
    configured: boolean;
    enabled: boolean;
    featureEnabled: boolean;
    mode: "webhook" | "polling";
    webhookConfigured: boolean;
    botUsername: string | null;
    alertsEnabled: boolean;
    subscribers: Array<{
        chatId: string;
        label: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        enabled: boolean;
        updatedAt: number;
    }>;
    legacyAllowedChatIds: number;
}>;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** API failure with the HTTP status (0 = network error or timeout). */
export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/** The server rejected the pair token (revoked or unknown device). */
export function isAuthError(e: unknown): boolean {
    return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

/** Absolute URL for an API path, honoring NEXT_PUBLIC_API_BASE_URL. */
export function apiUrl(path: string): string {
    if (!API_BASE) return path;
    return API_BASE.replace(/\/$/, "") + path;
}

const TIMEOUT_TEXT = "The server took too long to respond.";

function statusText(status: number, data: any): string {
    if (status === 408 || status === 504) return TIMEOUT_TEXT;
    if (status === 429) return "Too many requests. Try again in a moment.";
    if (status >= 500) return "The server had a problem. Try again.";
    const msg = data?.error || data?.message;
    return typeof msg === "string" && msg ? msg : `Something went wrong (${status}).`;
}

type ApiFetchOpts = RequestInit & {
    pairToken?: string;
    /** Aborts the request and throws ApiError(…, 0) after this long. Default 15 s. */
    timeoutMs?: number;
};

async function apiFetch<T>(path: string, opts: ApiFetchOpts = {}): Promise<T> {
    const { pairToken, timeoutMs = 15_000, signal, ...init } = opts;
    const headers: Record<string, string> = {
        ...(init.headers as any),
    };

    if (pairToken) {
        headers["X-Pair-Token"] = pairToken;
        headers["ngrok-skip-browser-warning"] = "1";
    }

    if (init.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    // One controller for both the timeout and the caller's signal
    // (AbortSignal.any is missing before iOS 17.4).
    const ac = new AbortController();
    let timedOut = false;
    const t = setTimeout(() => {
        timedOut = true;
        ac.abort();
    }, timeoutMs);
    const onAbort = () => ac.abort();
    if (signal) {
        if (signal.aborted) ac.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
        let res: Response;
        try {
            res = await fetch(apiUrl(path), {
                ...init,
                headers,
                signal: ac.signal,
            });
        } catch (err) {
            if (timedOut) throw new ApiError(TIMEOUT_TEXT, 0);
            if ((err as Error)?.name === "AbortError" && signal?.aborted) throw err;
            throw new ApiError(
                typeof navigator !== "undefined" && navigator.onLine === false
                    ? "You're offline."
                    : "Can't reach the server.",
                0
            );
        }

        let text: string;
        try {
            text = await res.text();
        } catch (err) {
            if (timedOut) throw new ApiError(TIMEOUT_TEXT, 0);
            if ((err as Error)?.name === "AbortError" && signal?.aborted) throw err;
            throw new ApiError("Can't reach the server.", 0);
        }
        let data: any = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }

        if (!res.ok) throw new ApiError(statusText(res.status, data), res.status);

        return data as T;
    } finally {
        clearTimeout(t);
        signal?.removeEventListener("abort", onAbort);
    }
}

export async function health(): Promise<{
    ok: true;
    ts: number;
    vapidEnabled: boolean;
    telegramEnabled: boolean;
    databaseConfigured?: boolean;
    demoModeEnabled?: boolean;
    demoCode?: string | null;
    build?: string;
}> {
    return apiFetch("/api/health");
}

export async function vapidPublicKey(): Promise<{ key: string }> {
    return apiFetch("/api/vapidPublicKey");
}

export async function pairComplete(params: {
    code: string;
    pwaDeviceId: string;
    pwaPubSpkiB64?: string;
    deviceLabel?: string;
}): Promise<PairCompleteRes> {
    return apiFetch("/api/pair/complete", {
        method: "POST",
        body: JSON.stringify(params),
    });
}

export async function pairMe(pairToken: string, timeoutMs = 10_000): Promise<PairMeRes> {
    // Bounded, so app start never waits forever on a cold or unreachable server.
    return apiFetch("/api/pair/me", { pairToken, timeoutMs });
}

export async function createInvite(
    pairToken: string
): Promise<ApiOk<{ code: string; expiresAt: number }>> {
    return apiFetch("/api/pair/invite", { method: "POST", pairToken });
}

export async function listDevices(
    pairToken: string
): Promise<ApiOk<{ devices: Device[] }>> {
    return apiFetch("/api/pair/devices", { pairToken });
}

export async function revokeDevice(
    pairToken: string,
    deviceId: string
): Promise<ApiOk<{ deleted: number }>> {
    return apiFetch("/api/pair/revokeDevice", {
        method: "POST",
        pairToken,
        body: JSON.stringify({ deviceId }),
    });
}

export async function listConversations(
    pairToken: string,
    limit = 150,
    opts: { signal?: AbortSignal } = {}
): Promise<ListConversationsRes> {
    return apiFetch(`/api/sms/conversations?limit=${encodeURIComponent(String(limit))}`, {
        pairToken,
        signal: opts.signal,
    });
}

/**
 * The newest `limit` messages of a thread (older than `before`, a ts in ms,
 * when given), in ascending order.
 */
export async function listMessages(
    pairToken: string,
    peer: string,
    limit = 300,
    opts: { before?: number; signal?: AbortSignal } = {}
): Promise<ListMessagesRes> {
    const qs = new URLSearchParams({
        // Server accepts `peer` for backwards compatibility but prefers `threadId`.
        threadId: peer,
        limit: String(limit),
    });
    if (opts.before != null && Number.isFinite(opts.before)) {
        qs.set("before", String(Math.floor(opts.before)));
    }
    return apiFetch(`/api/sms/messages?${qs.toString()}`, {
        pairToken,
        signal: opts.signal,
    });
}

export async function searchMessages(
    pairToken: string,
    query: string,
    limit = 40
): Promise<ListMessagesRes> {
    const qs = new URLSearchParams({ q: query, limit: String(limit) });
    return apiFetch(`/api/sms/search?${qs.toString()}`, { pairToken });
}

export async function markThreadRead(
    pairToken: string,
    threadId: string
): Promise<ApiOk<{}>> {
    return apiFetch(`/api/sms/threads/${encodeURIComponent(threadId)}/read`, {
        method: "POST",
        pairToken,
    });
}

export async function markThreadUnread(
    pairToken: string,
    threadId: string
): Promise<ApiOk<{ marked: number }>> {
    return apiFetch(`/api/sms/threads/${encodeURIComponent(threadId)}/unread`, {
        method: "POST",
        pairToken,
    });
}

export async function listBlockedChats(pairToken: string): Promise<ListBlockedChatsRes> {
    return apiFetch("/api/sms/blocked-chats", { pairToken });
}

export async function blockThread(
    pairToken: string,
    params: { threadId: string; peer?: string | null; note?: string | null }
): Promise<ApiOk<{ blockedChat: BlockedChat }>> {
    return apiFetch(`/api/sms/threads/${encodeURIComponent(params.threadId)}/block`, {
        method: "POST",
        pairToken,
        body: JSON.stringify({ peer: params.peer, note: params.note }),
    });
}

export async function unblockThread(
    pairToken: string,
    threadId: string
): Promise<ApiOk<{ deleted: number }>> {
    return apiFetch(`/api/sms/threads/${encodeURIComponent(threadId)}/unblock`, {
        method: "POST",
        pairToken,
    });
}

export async function deleteThread(
    pairToken: string,
    threadId: string
): Promise<ApiOk<{ deletedMessages: number; deletedConversations: number }>> {
    return apiFetch(`/api/sms/threads/${encodeURIComponent(threadId)}/delete`, {
        method: "POST",
        pairToken,
        body: JSON.stringify({ confirm: true }),
    });
}

export async function sendSms(
    pairToken: string,
    params: {
        to: string;
        body: string;
        simSlotIndex?: 0 | 1;
        subscriptionId?: number;
        /** Client-generated UUID; resending the same id never sends a second SMS. */
        clientId?: string;
        /** A failed outbound row this send replaces (deleted server-side). */
        replacesMessageId?: string;
    }
): Promise<SendSmsRes> {
    return apiFetch("/api/sms/send", {
        method: "POST",
        pairToken,
        body: JSON.stringify(params),
        timeoutMs: 20_000,
    });
}

/** Deletes an outbound message the gateway reported as failed. */
export async function deleteFailedMessage(
    pairToken: string,
    id: string
): Promise<{ ok: true }> {
    return apiFetch(`/api/sms/messages/${encodeURIComponent(id)}/delete`, {
        method: "POST",
        pairToken,
    });
}

export async function listContacts(
    pairToken: string,
    query?: string,
    limit = 40
): Promise<ListContactsRes> {
    const qs = new URLSearchParams();
    if (query) qs.set("query", query);
    qs.set("limit", String(limit));
    return apiFetch(`/api/contacts?${qs.toString()}`, { pairToken });
}

export async function upsertContact(
    pairToken: string,
    params: { displayName: string; number: string }
): Promise<ApiOk<{ contact: Contact }>> {
    return apiFetch("/api/contacts/upsert", {
        method: "POST",
        pairToken,
        body: JSON.stringify(params),
    });
}

export async function pushSubscribe(
    pairToken: string,
    deviceId: string,
    subscription: any
): Promise<ApiOk<{}>> {
    return apiFetch("/api/push/subscribe", {
        method: "POST",
        pairToken,
        body: JSON.stringify({ deviceId, subscription }),
    });
}

export async function telegramStatus(pairToken: string): Promise<TelegramStatusRes> {
    return apiFetch("/api/telegram/status", { pairToken });
}

export async function telegramSetAlerts(
    pairToken: string,
    alertsEnabled: boolean
): Promise<ApiOk<{ alertsEnabled: boolean }>> {
    return apiFetch("/api/telegram/settings", {
        method: "POST",
        pairToken,
        body: JSON.stringify({ alertsEnabled }),
    });
}

export async function telegramCreateLinkCode(
    pairToken: string
): Promise<ApiOk<{ code: string; expiresAt: number; botDeepLink: string | null }>> {
    return apiFetch("/api/telegram/link-code", { method: "POST", pairToken });
}

export async function telegramSetupWebhook(
    pairToken: string
): Promise<ApiOk<{ webhookUrl: string; botUsername: string | null }>> {
    return apiFetch("/api/telegram/setup-webhook", { method: "POST", pairToken });
}

export async function telegramTest(
    pairToken: string
): Promise<ApiOk<{ results: Array<{ ok: boolean }> }>> {
    return apiFetch("/api/telegram/test", { method: "POST", pairToken });
}

export function getApiBaseUrl(): string {
    return API_BASE;
}
