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

export type ListConversationsRes = ApiOk<{ conversations: Conversation[] }>;

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
};

export type ListMessagesRes = ApiOk<{ messages: Message[] }>;

export type SendSmsRes = ApiOk<{ id: string }>;

export type ListContactsRes = ApiOk<{
    contacts: Array<{
        displayName: string;
        rawNumber: string | null;
        norm: string;
        source?: "android" | "web";
        nameLocked?: boolean;
    }>;
}>;

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
    mode: 'webhook' | 'polling';
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

function url(path: string): string {
    if (!API_BASE) return path;
    return API_BASE.replace(/\/$/, "") + path;
}

async function apiFetch<T>(
    path: string,
    opts: RequestInit & { pairToken?: string } = {}
): Promise<T> {
    const headers: Record<string, string> = {
        ...(opts.headers as any),
    };

    if (opts.pairToken) {
        headers["X-Pair-Token"] = opts.pairToken;
        headers["ngrok-skip-browser-warning"] = "1";
    }

    if (opts.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url(path), {
        ...opts,
        headers,
    });

    const text = await res.text();
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!res.ok) {
        const errMsg = data?.error || data?.message || `${res.status} ${res.statusText}`;
        throw new Error(errMsg);
    }

    return data as T;
}

export async function health(): Promise<{
    ok: true;
    ts: number;
    vapidEnabled: boolean;
    telegramEnabled: boolean;
    databaseConfigured?: boolean;
    demoModeEnabled?: boolean;
    demoCode?: string | null;
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

export async function pairMe(pairToken: string): Promise<PairMeRes> {
    return apiFetch("/api/pair/me", { pairToken });
}

export async function createInvite(
    pairToken: string
): Promise<ApiOk<{ code: string; expiresAt: number }>> {
    return apiFetch("/api/pair/invite", { method: "POST", pairToken });
}

export async function listDevices(pairToken: string): Promise<ApiOk<{ devices: any[] }>> {
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
    limit = 150
): Promise<ListConversationsRes> {
    return apiFetch(`/api/sms/conversations?limit=${encodeURIComponent(String(limit))}`, {
        pairToken,
    });
}

export async function listMessages(
    pairToken: string,
    peer: string,
    limit = 300
): Promise<ListMessagesRes> {
    return apiFetch(
        // Server accepts `peer` for backwards compatibility but prefers `threadId`.
        `/api/sms/messages?threadId=${encodeURIComponent(peer)}&limit=${encodeURIComponent(String(limit))}`,
        { pairToken }
    );
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

export async function listBlockedChats(
    pairToken: string
): Promise<ListBlockedChatsRes> {
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
    params: { to: string; body: string; simSlotIndex?: 0 | 1; subscriptionId?: number }
): Promise<SendSmsRes> {
    return apiFetch("/api/sms/send", {
        method: "POST",
        pairToken,
        body: JSON.stringify(params),
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
): Promise<ApiOk<{ contact: ListContactsRes["contacts"][number] }>> {
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
    return apiFetch('/api/telegram/status', { pairToken });
}

export async function telegramSetAlerts(
    pairToken: string,
    alertsEnabled: boolean
): Promise<ApiOk<{ alertsEnabled: boolean }>> {
    return apiFetch('/api/telegram/settings', {
        method: 'POST',
        pairToken,
        body: JSON.stringify({ alertsEnabled }),
    });
}

export async function telegramCreateLinkCode(
    pairToken: string
): Promise<ApiOk<{ code: string; expiresAt: number; botDeepLink: string | null }>> {
    return apiFetch('/api/telegram/link-code', { method: 'POST', pairToken });
}

export async function telegramSetupWebhook(
    pairToken: string
): Promise<ApiOk<{ webhookUrl: string; botUsername: string | null }>> {
    return apiFetch('/api/telegram/setup-webhook', { method: 'POST', pairToken });
}

export async function telegramTest(pairToken: string): Promise<ApiOk<{ results: any[] }>> {
    return apiFetch('/api/telegram/test', { method: 'POST', pairToken });
}

export function getApiBaseUrl(): string {
    return API_BASE;
}
