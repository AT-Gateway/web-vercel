"use client";

import React, {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type Conversation,
    createInvite,
    health,
    listContacts,
    listConversations,
    listDevices,
    listMessages,
    type Message,
    pairComplete,
    pairMe,
    pushSubscribe,
    revokeDevice,
    sendSms,
    vapidPublicKey,
} from "@/lib/api";
import { threadIdForPeer } from "@/lib/phone";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { FiArrowLeft, FiSettings } from "react-icons/fi";
import AutocompleteSearch from "@/components/AutocompleteSearch";
import { LuBadgeInfo, LuSquarePen } from "react-icons/lu";
import { Skeleton } from "@/components/ui/skeleton";
import UserIconContactList from "@/components/icon/userIconContactList";
import { BiLoaderCircle, BiSolidSend } from "react-icons/bi";
import MessageBoxComponent from "@/components/MessageBoxComponent";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { DrawerContainer } from "@/components/Drawer";
import { CgClose } from "react-icons/cg";
import {
    IoCopyOutline,
    IoNotifications,
    IoNotificationsOff,
    IoOptions,
} from "react-icons/io5";
import { IoIosLogOut } from "react-icons/io";
import { RiIndeterminateCircleLine } from "react-icons/ri";
import { DrawerClose } from "@/components/ui/drawer";
import StartChat from "@/components/StartChat";
import GlassSelect, { SelectOption } from "@/components/GlassSelect";
import { Label } from "@/components/ui/label";
import GlassSwitch from "@/components/GlassSwitch";

type ToastState = { title: string; body?: string } | null;

type PairState = {
    pairToken: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    demo?: boolean;
};

type ContactLike = {
    norm: string;
    rawNumber: string | null;
    displayName: string;
};

type DeviceRow = {
    deviceId: string;
    deviceType: string;
    deviceLabel: string | null;
    createdAt: number;
    lastSeenAt: number | null;
};

const SIM_OPTIONS: SelectOption[] = [
    { value: "0", label: "SIM 1", subLabel: "Primary" },
    { value: "1", label: "SIM 2", subLabel: "Secondary" },
];

function hasPersianSpecificChars(str = ""): boolean {
    return /[اآبپتثجچحخدذرzژسشصضطظعغفقکگلمنوهی]/.test(str);
}

function statusLabel(m: Message): string {
    if (m.direction !== "out") return "";
    if (m.status === "queued") return "Queued";
    if (m.status === "sent") return m.deliveredAt ? "Delivered" : "Sent";
    if (m.status === "failed") return "Failed";
    return m.status;
}

function formatClock(ts: number): string {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function formatSmartDate(ts: number): string {
    try {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return "";

        const now = new Date();
        const startOfDay = (x: Date) =>
            new Date(x.getFullYear(), x.getMonth(), x.getDate());

        const today = startOfDay(now);
        const thatDay = startOfDay(d);
        const diffDays = Math.round(
            (today.getTime() - thatDay.getTime()) / (24 * 60 * 60 * 1000)
        );

        if (diffDays === 0) {
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        if (diffDays === 1) {
            return "Yesterday";
        }

        const day = now.getDay();
        const mondayBasedIndex = (day + 6) % 7;
        const startOfThisWeek = new Date(today);
        startOfThisWeek.setDate(today.getDate() - mondayBasedIndex);

        if (thatDay.getTime() >= startOfThisWeek.getTime()) {
            return d.toLocaleDateString([], { weekday: "short" });
        }

        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString([], { month: "short", day: "numeric" });
        }

        return d.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return "";
    }
}

function formatDay(ts: number): string {
    try {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return "";

        const now = new Date();
        const startOfDay = (x: Date) =>
            new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const today = startOfDay(now);
        const thatDay = startOfDay(d);

        const diffDays = Math.round(
            (today.getTime() - thatDay.getTime()) / (24 * 60 * 60 * 1000)
        );

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";

        if (diffDays > 1 && diffDays < 7) {
            return d.toLocaleDateString([], { weekday: "long" });
        }

        return d.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    } catch {
        return "";
    }
}

function getStoredPairToken(): string {
    if (typeof window === "undefined") return "";
    const keys = ["pairToken", "PAIR_TOKEN", "pair_token", "pair_token_v1"];
    for (const k of keys) {
        const v = window.localStorage.getItem(k);
        if (v && v.trim()) return v.trim();
    }
    return "";
}

function persistPairToken(pairToken: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pairToken", pairToken);
    window.localStorage.setItem("PAIR_TOKEN", pairToken);
    window.localStorage.setItem("pair_token", pairToken);
}

function useIsMobile(breakpointPx = 860) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, [breakpointPx]);
    return isMobile;
}

function groupByDay(
    msgs: Message[]
): Array<{ day: string; ts: number; items: Message[] }> {
    const groups: Array<{ day: string; ts: number; items: Message[] }> = [];
    let curKey = "";
    let cur: { day: string; ts: number; items: Message[] } | null = null;

    for (const m of msgs) {
        const key = new Date(m.ts).toDateString();
        if (!cur || key !== curKey) {
            curKey = key;
            cur = { day: formatDay(m.ts), ts: m.ts, items: [m] };
            groups.push(cur);
        } else {
            cur.items.push(m);
        }
    }

    return groups;
}

export default function ClientView() {
    const router = useRouter();
    const sp = useSearchParams();
    const isMobile = useIsMobile();

    const [, setToast] = useState<ToastState>(null);
    const showToast = useCallback(
        (title: string, body?: string) => {
            setToast({ title, body });
            window.setTimeout(() => setToast(null), 2800);
        },
        [setToast]
    );

    const [pairState, setPairState] = useState<PairState | null>(null);
    const [pairLoading, setPairLoading] = useState(true);

    const [, setDrawerOpen] = useState(false);
    const [notifEnabled, setNotifEnabled] = useState(false);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(false);

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [conversationsLoading, setConversationsLoading] = useState<boolean>(false);

    const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
    const [inviteCode, setInviteCode] = useState<string | null>(null);

    const threadId = sp.get("tid");
    const peerParam = sp.get("peer");

    const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId ?? null);
    const [activeSendTo, setActiveSendTo] = useState<string | null | undefined>(
        peerParam ?? null
    );

    const [activeContact, setActiveContact] = useState<ContactLike>({
        norm: "",
        rawNumber: "",
        displayName: "",
    });

    const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>(
        {}
    );
    const [loadingThread, setLoadingThread] = useState<string | null>(null);

    const [composer, setComposer] = useState("");
    const [simSlotIndex, setSimSlotIndex] = useState<0 | 1 | null>(0);

    const [, setSearch] = useState("");

    const [drawerTransitionsEnabled, setDrawerTransitionsEnabled] =
        useState<boolean>(false);

    useEffect(() => {
        // Enable transitions only after first paint
        setDrawerTransitionsEnabled(true);
    }, []);

    const listAbortRef = useRef<AbortController | null>(null);
    const sseRef = useRef<EventSource | null>(null);
    const activeThreadRef = useRef<string | null>(null);
    activeThreadRef.current = activeThreadId;

    // ✅ sync with URL changes
    useEffect(() => {
        setActiveThreadId(threadId ?? null);
    }, [threadId]);

    useEffect(() => {
        setActiveSendTo(peerParam ?? null);
    }, [peerParam]);

    // ✅ keep messages scroll pinned to bottom (your messages container is flex-col-reverse)
    const messagesScrollRef = useRef<HTMLDivElement | null>(null);
    const stickToBottomRef = useRef(true);

    const scrollToBottom = useCallback(() => {
        const el = messagesScrollRef.current;
        if (!el) return;
        el.scrollTop = 0;
    }, []);

    const onMessagesScroll = useCallback(() => {
        const el = messagesScrollRef.current;
        if (!el) return;
        stickToBottomRef.current = el.scrollTop <= 24;
    }, []);

    useEffect(() => {
        stickToBottomRef.current = true;
        requestAnimationFrame(() => scrollToBottom());
    }, [activeThreadId, scrollToBottom]);

    const activeMessagesLength = useMemo(() => {
        if (!activeThreadId) return 0;
        return (messagesByThread[activeThreadId] || []).length;
    }, [activeThreadId, messagesByThread]);

    const loadDevices = useCallback(async () => {
        if (!pairState) return;

        setDevicesLoading(true);
        try {
            const r = await listDevices(pairState.pairToken);
            setDevices((r.devices || []) as DeviceRow[]);
        } catch (e: any) {
            showToast("Failed to load devices", e?.message);
        } finally {
            setDevicesLoading(false);
        }
    }, [pairState, showToast]);

    const doRevoke = useCallback(
        async (deviceId: string) => {
            if (!pairState) return;

            try {
                await revokeDevice(pairState.pairToken, deviceId);
                await loadDevices();
            } catch (e: any) {
                showToast("Failed to revoke", e?.message);
            }
        },
        [pairState, loadDevices, showToast]
    );

    const copyPairToken = useCallback(() => {
        if (!pairState?.pairToken) return;
        navigator.clipboard?.writeText(pairState.pairToken);
        showToast("Copied");
    }, [pairState?.pairToken, showToast]);

    const signOut = useCallback(() => {
        window.localStorage.removeItem("pairToken");
        window.localStorage.removeItem("PAIR_TOKEN");
        window.localStorage.removeItem("pair_token");

        setPairState(null);
        setSettingsOpen(false);
    }, []);

    const closeSettings = useCallback(() => {
        setSettingsOpen(false);
        // optional: some drawers close on Escape
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }, []);

    useEffect(() => {
        if (!stickToBottomRef.current) return;
        requestAnimationFrame(() => scrollToBottom());
    }, [activeThreadId, activeMessagesLength, scrollToBottom]);

    // -------- pairing bootstrap --------
    useEffect(() => {
        (async () => {
            try {
                await health();
            } catch {
                // ignore
            }

            const tok = getStoredPairToken();
            if (!tok) {
                setPairState(null);
                setPairLoading(false);
                return;
            }

            try {
                const me = await pairMe(tok);
                setPairState({
                    pairToken: tok,
                    pairingId: me.pairingId,
                    gatewayDeviceId: me.gatewayDeviceId,
                    gatewayPubSpkiB64: me.gatewayPubSpkiB64,
                    demo: Boolean(me.demo),
                });
            } catch {
                setPairState(null);
            } finally {
                setPairLoading(false);
            }
        })();
    }, []);

    // -------- data loading helpers --------
    const refreshConversations = useCallback(async () => {
        if (!pairState) return;
        setConversationsLoading(true);
        try {
            const res = await listConversations(pairState.pairToken, 200);
            setConversations(res.conversations ?? []);
        } catch (e: any) {
            showToast("Failed to load chats", e?.message);
        } finally {
            setConversationsLoading(false);
        }
    }, [pairState, showToast]);

    const refreshThreadMessages = useCallback(
        async (tid: string) => {
            if (!pairState) return;

            listAbortRef.current?.abort();
            const ac = new AbortController();
            listAbortRef.current = ac;

            setLoadingThread(tid);
            try {
                const res = await listMessages(pairState.pairToken, tid, 800);
                if (ac.signal.aborted) return;
                setMessagesByThread((prev) => ({ ...prev, [tid]: res.messages ?? [] }));
            } catch (e: any) {
                if (ac.signal.aborted) return;
                showToast("Failed to load messages", e?.message);
            } finally {
                if (!ac.signal.aborted) setLoadingThread(null);
            }
        },
        [pairState, showToast]
    );

    useEffect(() => {
        if (!pairState) return;
        refreshConversations();
    }, [pairState, refreshConversations]);

    useEffect(() => {
        if (!pairState) return;
        if (!activeThreadId) return;
        refreshThreadMessages(activeThreadId);
    }, [pairState, activeThreadId, refreshThreadMessages]);

    useEffect(() => {
        if (!pairState) return;

        const openSse = () => {
            try {
                sseRef.current?.close();
            } catch {
                // ignore
            }

            const pt = encodeURIComponent(pairState.pairToken);
            const es = new EventSource(`/api/sms/stream?pt=${pt}`);
            sseRef.current = es;

            es.addEventListener("hello", () => {});

            es.addEventListener("message", async (ev) => {
                try {
                    const data = JSON.parse((ev as MessageEvent).data || "{}");
                    const tid = String(
                        data.threadId || threadIdForPeer(String(data.peer || ""))
                    );

                    await Promise.all([
                        refreshConversations(),
                        activeThreadRef.current && activeThreadRef.current === tid
                            ? refreshThreadMessages(tid)
                            : Promise.resolve(),
                    ]);
                } catch {
                    // ignore
                }
            });

            es.addEventListener("status", async (ev) => {
                try {
                    const data = JSON.parse((ev as MessageEvent).data || "{}");
                    const tid = String(
                        data.threadId || threadIdForPeer(String(data.peer || ""))
                    );
                    if (tid) {
                        await refreshThreadMessages(tid);
                    }
                } catch {
                    // ignore
                }
            });

            es.addEventListener("contacts", async () => {
                await refreshConversations();
                if (activeThreadRef.current) {
                    await refreshThreadMessages(activeThreadRef.current);
                }
            });

            es.onerror = () => {};
        };

        openSse();

        const t = window.setInterval(async () => {
            await Promise.all([
                refreshConversations(),
                activeThreadRef.current
                    ? refreshThreadMessages(activeThreadRef.current)
                    : Promise.resolve(),
            ]);
        }, 12_000);

        return () => {
            window.clearInterval(t);
            try {
                sseRef.current?.close();
            } catch {
                // ignore
            }
        };
    }, [pairState, refreshConversations, refreshThreadMessages]);

    const activeConversation = useMemo(() => {
        if (!activeThreadId) return null;
        return conversations.find((c) => c.threadId === activeThreadId) || null;
    }, [activeThreadId, conversations]);

    const activeMessages = useMemo(() => {
        if (!activeThreadId) return [];
        return messagesByThread[activeThreadId] || [];
    }, [activeThreadId, messagesByThread]);

    const clearSelectedConversation = useCallback(() => {
        setActiveThreadId(null);
        setActiveSendTo(null);
        setActiveContact({ displayName: "", norm: "", rawNumber: "" });
        setComposer("");
        router.replace("/"); // ✅ remove params
    }, [router]);

    const startChatFromContact = useCallback(
        (c: ContactLike) => {
            const sendTo = c.rawNumber || c.norm;
            const tid = threadIdForPeer(sendTo);

            setActiveThreadId(tid);
            setActiveSendTo(sendTo);
            setDrawerOpen(false);
            setSearch("");
            setActiveContact(c);

            router.replace(`/?tid=${tid}&peer=${encodeURIComponent(sendTo)}`);
            refreshThreadMessages(tid);
        },
        [refreshThreadMessages, router, setDrawerOpen, setSearch]
    );

    const selectConversation = useCallback(
        (c: Conversation) => {
            setActiveContact({ displayName: "", norm: "", rawNumber: "" });
            setActiveThreadId(c.threadId);
            setActiveSendTo(c.peer);
            setDrawerOpen(false);

            router.replace(`/?tid=${c.threadId}&peer=${encodeURIComponent(c.peer)}`);
            refreshThreadMessages(c.threadId);
        },
        [refreshThreadMessages, router, setDrawerOpen]
    );

    const enableNotifications = useCallback(async () => {
        if (!pairState) return;
        if (typeof window === "undefined") return;

        if (!("Notification" in window)) {
            showToast("Not supported", "This browser does not support notifications");
            return;
        }

        try {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
                showToast("Permission denied");
                return;
            }

            // Subscribe to push if service worker is ready
            const reg = await navigator.serviceWorker.ready;
            const keyRes = await vapidPublicKey();
            const keyBytes = urlBase64ToUint8Array(keyRes.key);

            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyBytes,
            });

            const deviceId = ensureClientDeviceId();
            await pushSubscribe(pairState.pairToken, deviceId, sub);

            setNotifEnabled(true);
            showToast("Notifications enabled");
        } catch (e: any) {
            showToast("Notifications failed", e?.message);
        }
    }, [pairState, showToast]);

    const doSend = useCallback(async () => {
        if (!pairState) return;
        const text = composer.trim();
        if (!text) return;

        const sendTo = (activeSendTo || activeConversation?.peer || "").trim();
        if (!sendTo) {
            showToast("No recipient", "Pick a chat or select a contact");
            return;
        }

        const tid = activeThreadId || threadIdForPeer(sendTo);

        const tempId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const optimistic: Message = {
            id: tempId,
            threadId: tid,
            peer: sendTo,
            peerName: activeConversation?.peerName || null,
            direction: "out",
            body: text,
            bodyIsEncrypted: 0,
            ts: Date.now(),
            status: "queued",
            deliveredAt: null,
            simSlotIndex,
            subscriptionId: null,
            createdBy: "pwa",
        };

        setMessagesByThread((prev) => ({
            ...prev,
            [tid]: [...(prev[tid] || []), optimistic],
        }));

        setComposer("");

        try {
            const r = await sendSms(pairState.pairToken, {
                to: sendTo,
                body: text,
                simSlotIndex: simSlotIndex ?? undefined,
            });

            showToast("Queued", `Message id: ${r.id.slice(0, 8)}…`);
            await Promise.all([refreshConversations(), refreshThreadMessages(tid)]);
            stickToBottomRef.current = true;
            requestAnimationFrame(() => scrollToBottom());
        } catch (e: any) {
            showToast("Send failed", e?.message);
            setMessagesByThread((prev) => ({
                ...prev,
                [tid]: (prev[tid] || []).map((m) =>
                    m.id === tempId ? { ...m, status: "failed" } : m
                ),
            }));
        }
    }, [
        pairState,
        composer,
        activeSendTo,
        activeConversation,
        activeThreadId,
        showToast,
        refreshConversations,
        refreshThreadMessages,
        simSlotIndex,
        scrollToBottom,
    ]);

    const openInvite = useCallback(async () => {
        if (!pairState) return;
        setInviteCode(null);
        setInviteExpiresAt(null);

        try {
            const r = await createInvite(pairState.pairToken);
            setInviteCode(r.code);
            setInviteExpiresAt(r.expiresAt);
        } catch (e: any) {
            showToast("Failed to create invite", e?.message);
        }
    }, [pairState, showToast]);

    const fetchContacts = useCallback(
        async (q: string) => {
            if (!pairState) return [];
            const query = q.trim();
            const res = await listContacts(pairState.pairToken, query, 1000);

            return (res?.contacts || []).map((x: any) => ({
                value: String(x.norm),
                label: x.displayName,
                subLabel: x.rawNumber,
            }));
        },
        [pairState?.pairToken]
    );

    const isDemoMode = Boolean(pairState?.demo || pairState?.pairToken?.startsWith('demo:'));

    const showConversationSkeletons =
        conversations.length === 0 && (pairLoading || conversationsLoading);

    const showMessagesSkeletons =
        pairLoading ||
        (!!activeThreadId &&
            loadingThread === activeThreadId &&
            (activeMessages?.length ?? 0) === 0);

    // ✅✅ TEXTAREA RESIZE FIX (two refs because you have TWO textareas)
    const desktopComposerRef = useRef<HTMLTextAreaElement | null>(null);
    const mobileComposerRef = useRef<HTMLTextAreaElement | null>(null);

    const resizeOne = useCallback((el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = "0px";
        const next = Math.min(el.scrollHeight, 400);
        el.style.height = `${next}px`;
    }, []);

    const resizeAll = useCallback(() => {
        resizeOne(desktopComposerRef.current);
        resizeOne(mobileComposerRef.current);
    }, [resizeOne]);

    useLayoutEffect(() => {
        requestAnimationFrame(resizeAll);
    }, [composer, resizeAll]);
    // ✅✅ END FIX

    if (!showMessagesSkeletons && !showConversationSkeletons && !pairState) {
        return <PairingScreen onPaired={(p) => setPairState(p)} onToast={showToast} />;
    }

    // ✅ mobile drawer visibility
    const showMobileMessagesDrawer = isMobile && !!activeThreadId;

    return (
        <div className="container mx-auto flex h-screen w-full items-start gap-4 py-4 md:gap-6 md:py-6">
            {/* LEFT: Conversations */}
            <div className="shadow-soft-lg h-full w-full rounded-3xl md:w-[40%] md:max-w-96 lg:min-w-96">
                <div className="relative flex h-full w-full justify-center overflow-hidden bg-black/40 p-0.5 backdrop-blur-[6px] md:rounded-4xl md:shadow-inner">
                    {/* Header */}
                    <div
                        className={cn(
                            "absolute top-0 left-0 z-99 flex w-[calc(100%-2px)] items-center justify-between",
                            "gap-2 p-2 pt-0 md:top-px md:left-px md:rounded-t-4xl md:p-4 md:pt-4",
                            "bg-linear-to-b from-black via-black/70 to-black/0"
                        )}
                    >
                        <DrawerContainer
                            extraClasses="bg-black rounded-t-4xl max-w-[600px] mx-auto outline-0 z-9999"
                            triggerButton={
                                <span
                                    onClick={() => {
                                        setSettingsOpen(true);
                                        loadDevices();
                                    }}
                                    className={cn(
                                        "flex h-10 w-10 min-w-10 cursor-pointer items-center justify-center",
                                        "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                        "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                    )}
                                >
                                    <IoOptions className="text-2xl" />
                                </span>
                            }
                            headerContent={
                                <div className="flex w-full items-center justify-between">
                                    <div className="flex items-center gap-2 text-2xl font-bold">
                                        <IoOptions className="text-2xl" />
                                        Options
                                    </div>
                                    <DrawerClose>
                                        <span
                                            className={cn(
                                                "flex h-8 w-8 min-w-8 cursor-pointer items-center justify-center",
                                                "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                                "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                            )}
                                        >
                                            <CgClose className="text-xl" />
                                        </span>
                                    </DrawerClose>
                                </div>
                            }
                        >
                            <div className="scroll-style-none container flex flex-col items-center justify-start overflow-auto bg-black py-4 md:py-6">
                                <div className="flex w-full flex-col items-center gap-4">
                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full items-center justify-between gap-2">
                                        <div className="text-lg font-semibold">
                                            Invite Code:
                                        </div>
                                        {inviteCode &&
                                        inviteExpiresAt &&
                                        inviteExpiresAt > Date.now() ? (
                                            <div
                                                className={cn(
                                                    "flex cursor-pointer items-center justify-center px-4 py-1.5 text-base",
                                                    "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 text-white",
                                                    "backdrop-blur-3xl transition-all duration-150 hover:bg-black/40"
                                                )}
                                            >
                                                {inviteCode}
                                            </div>
                                        ) : (
                                            <div
                                                className={cn(
                                                    "flex cursor-pointer items-center justify-center px-4 py-1.5 text-base",
                                                    "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 text-white",
                                                    "backdrop-blur-3xl transition-all duration-150 hover:bg-black/40"
                                                )}
                                                onClick={openInvite}
                                            >
                                                Generate
                                            </div>
                                        )}
                                    </div>

                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full items-center justify-between gap-2">
                                        <div className="text-lg font-semibold">
                                            Push Notification:
                                        </div>
                                        {notifEnabled ? (
                                            <span
                                                className={cn(
                                                    "flex h-10 w-10 min-w-10 cursor-not-allowed items-center justify-center",
                                                    "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                                    "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-[#1e1e1e]/80"
                                                )}
                                            >
                                                <IoNotifications />
                                            </span>
                                        ) : (
                                            <span
                                                onClick={enableNotifications}
                                                className={cn(
                                                    "flex h-10 w-10 min-w-10 cursor-pointer items-center justify-center",
                                                    "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                                    "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                                )}
                                            >
                                                <IoNotificationsOff />
                                            </span>
                                        )}
                                    </div>

                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full items-center justify-between gap-2">
                                        <div className="text-lg font-semibold">
                                            Telegram Bot:
                                        </div>

                                        <div className="relative flex items-center space-x-2">
                                            <span className="absolute top-0 left-0 z-99 h-full w-full cursor-not-allowed" />
                                            <Label htmlFor="airplane-mode">
                                                Inactive
                                            </Label>
                                            <GlassSwitch
                                                checked={true}
                                                onCheckedChange={() => {}}
                                            />
                                            <Label htmlFor="airplane-mode">Active</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DrawerContainer>

                        <span
                            onClick={() => router.replace("/")}
                            className="flex items-center justify-center gap-2 rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 px-4 py-2 font-bold text-white backdrop-blur-3xl"
                        >
                            Messages
                            {isDemoMode ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-100">
                                    Demo
                                </span>
                            ) : null}
                        </span>

                        <DrawerContainer
                            extraClasses="bg-black rounded-t-4xl max-w-[600px] mx-auto outline-0 z-9999"
                            triggerButton={
                                <span
                                    onClick={() => {
                                        setSettingsOpen(true);
                                        loadDevices();
                                    }}
                                    className={cn(
                                        "flex h-10 w-10 min-w-10 cursor-pointer items-center justify-center",
                                        "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                        "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                    )}
                                >
                                    <FiSettings className="text-xl" />
                                </span>
                            }
                            headerContent={
                                <div className="flex w-full items-center justify-between">
                                    <div className="flex items-center gap-2 text-2xl font-bold">
                                        <FiSettings className="text-xl" />
                                        Setting
                                    </div>
                                    <DrawerClose>
                                        <span
                                            className={cn(
                                                "flex h-8 w-8 min-w-8 cursor-pointer items-center justify-center",
                                                "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                                                "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                            )}
                                        >
                                            <CgClose className="text-xl" />
                                        </span>
                                    </DrawerClose>
                                </div>
                            }
                        >
                            <div className="scroll-style-none container flex flex-col items-center justify-start overflow-auto bg-black py-4 md:py-6">
                                <div className="flex w-full flex-col items-center gap-4">
                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full flex-col gap-2">
                                        <div className="text-lg font-semibold">
                                            Gateway:
                                        </div>
                                        <div className="ms-4 flex flex-col items-start gap-1 text-base text-white/75">
                                            <div className="flex items-center gap-1">
                                                Gateway Device ID:{" "}
                                                <b>{pairState?.gatewayDeviceId}</b>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                Pairing ID:
                                                <span className="text-sm font-semibold">
                                                    {pairState?.pairingId}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full flex-col justify-between gap-2">
                                        <div className="text-lg font-semibold">
                                            Pair token
                                        </div>

                                        <div className="flex w-full items-center justify-between gap-2">
                                            <div className="ms-4 flex flex-col items-start gap-1 text-base text-white/75">
                                                <div style={{ wordBreak: "break-all" }}>
                                                    {pairState?.pairToken}
                                                </div>
                                            </div>

                                            <div className="flex min-w-18 items-center gap-2">
                                                <button
                                                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 text-base"
                                                    onClick={copyPairToken}
                                                >
                                                    <IoCopyOutline />
                                                </button>

                                                <button
                                                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-red-800 bg-red-600/20"
                                                    onClick={signOut}
                                                >
                                                    <IoIosLogOut />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <span className="h-0 w-full bg-linear-to-r from-transparent via-white/50 to-transparent py-px" />

                                    <div className="flex w-full flex-col justify-between gap-2">
                                        <div className="text-lg font-semibold">
                                            Paired devices
                                        </div>
                                        <div className="ms-4 flex flex-col items-start gap-1 text-base text-white/75">
                                            Revoke tokens for any client (PWA / bot) that
                                            you no longer trust.
                                        </div>

                                        <div className="scroll-style-none mt-2 flex max-h-60 w-full flex-col items-center gap-2 overflow-auto md:max-h-80">
                                            {devicesLoading
                                                ? Array.from({ length: 4 })?.map(
                                                      (d, i) => (
                                                          <div
                                                              key={i}
                                                              className="flex w-full items-center justify-between gap-2 rounded-3xl border border-white/20 bg-white/5 p-4"
                                                          >
                                                              <div className="flex flex-col gap-1">
                                                                  <div className="mb-2 text-base font-semibold">
                                                                      <Skeleton className="h-5 w-10 bg-gray-400/30" />
                                                                  </div>
                                                                  <div className="ms-2 flex flex-col gap-0.5 text-sm text-white/60">
                                                                      <div className="flex items-center gap-1">
                                                                          <Skeleton className="h-4 w-36 bg-gray-400/30" />
                                                                      </div>
                                                                      <div>
                                                                          <Skeleton className="h-4 w-44 bg-gray-400/30" />
                                                                      </div>
                                                                      <div>
                                                                          <Skeleton className="h-4 w-30 bg-gray-400/30" />
                                                                      </div>
                                                                  </div>
                                                              </div>

                                                              <button className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-red-800 bg-red-600/20">
                                                                  <RiIndeterminateCircleLine />
                                                              </button>
                                                          </div>
                                                      )
                                                  )
                                                : devices.map((d) => (
                                                      <div
                                                          key={d.deviceId}
                                                          className="flex w-full items-center justify-between gap-2 rounded-3xl border border-white/20 bg-white/5 p-4"
                                                      >
                                                          <div className="flex flex-col gap-1">
                                                              <div className="mb-2 text-base font-semibold">
                                                                  {d.deviceLabel ||
                                                                      d.deviceType}
                                                              </div>
                                                              <div className="ms-2 flex flex-col gap-0.5 text-sm text-white/60">
                                                                  <div className="flex items-center gap-1">
                                                                      ID:{" "}
                                                                      <span className="text-xs">
                                                                          {d.deviceId}
                                                                      </span>
                                                                  </div>
                                                                  <div>
                                                                      Created at:{" "}
                                                                      {new Date(
                                                                          d.createdAt
                                                                      ).toLocaleString(
                                                                          "en-US"
                                                                      )}
                                                                  </div>
                                                                  <div>
                                                                      Last Seen:{" "}
                                                                      {d.lastSeenAt
                                                                          ? new Date(
                                                                                d.lastSeenAt
                                                                            ).toLocaleString()
                                                                          : "—"}
                                                                  </div>
                                                              </div>
                                                          </div>

                                                          <button
                                                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-red-800 bg-red-600/20"
                                                              onClick={() =>
                                                                  doRevoke(d.deviceId)
                                                              }
                                                          >
                                                              <RiIndeterminateCircleLine />
                                                          </button>
                                                      </div>
                                                  ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DrawerContainer>
                    </div>

                    {/* Footer and Search Bar */}
                    <div
                        className={cn(
                            "absolute bottom-0 left-0 z-99 flex w-[calc(100%-2px)] items-center gap-2 p-2 md:bottom-px md:left-px md:rounded-b-4xl md:p-4",
                            "bg-linear-to-t from-black via-black/70 to-black/0"
                        )}
                    >
                        <AutocompleteSearch
                            options={[]}
                            placeholder="Search"
                            fetchOptions={fetchContacts}
                            disabled={pairLoading || !pairState}
                            onSelectOption={(e) => {
                                startChatFromContact({
                                    displayName: e.label,
                                    rawNumber: e.subLabel,
                                    norm: e.value,
                                });
                            }}
                        />
                        <DrawerContainer
                            extraClasses="bg-black rounded-t-4xl max-w-[600px] mx-auto outline-0 z-9999"
                            triggerButton={
                                <span className="flex h-11 w-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40">
                                    <LuSquarePen className="text-xl" />
                                </span>
                            }
                        >
                            <div className="container mt-4 w-full">
                                <StartChat />
                            </div>
                        </DrawerContainer>
                    </div>

                    {/* Conversations List */}
                    <div className="scroll-style-none flex max-h-full w-full flex-col items-center gap-1 overflow-auto overflow-x-hidden py-2 md:p-4">
                        <div className="py-6" />

                        {showConversationSkeletons &&
                            Array.from({ length: 20 }).map((_, i) => (
                                <Fragment key={i}>
                                    <div className="flex w-full items-center gap-4 rounded-full py-2 md:px-3">
                                        <Skeleton className="h-12 w-12 max-w-12 min-w-12 rounded-full bg-gray-600/30" />

                                        <div className="me-1 flex w-[calc(100%-40px)] flex-col items-start gap-1.5 overflow-x-hidden">
                                            <div className="flex w-full items-center justify-between">
                                                <Skeleton className="h-4.75 w-32 rounded-full bg-gray-600/30" />
                                                <Skeleton className="h-[15.14px] w-14 rounded-full bg-gray-600/30" />
                                            </div>

                                            <div className="flex w-full items-center gap-2">
                                                <span className="line-clamp-2 w-full text-sm text-white/75">
                                                    <Skeleton className="mb-0.5 h-[15.14px] w-full rounded-full bg-gray-600/30" />
                                                    <Skeleton className="h-[15.14px] w-12 rounded-full bg-gray-600/30" />
                                                </span>

                                                <Skeleton className="h-5 w-5 max-w-5 min-w-5 rounded-full bg-gray-600/30" />
                                            </div>
                                        </div>
                                    </div>

                                    {i + 1 !== 20 && (
                                        <span className="w-full bg-linear-to-r from-white/5 via-white/60 to-white/5 pt-px" />
                                    )}
                                </Fragment>
                            ))}

                        {!showConversationSkeletons &&
                            conversations.map((c, i) => (
                                <Fragment key={c.threadId}>
                                    <div
                                        className={cn(
                                            "flex w-full cursor-pointer items-center gap-4 rounded-full md:px-3",
                                            "py-2 transition-all duration-300",
                                            "border border-white/0",
                                            c.threadId === activeThreadId
                                                ? "scale-[1.03] border border-white/20 bg-white/5 md:scale-105"
                                                : "hover:scale-[1.01] hover:bg-white/5"
                                        )}
                                        onClick={() => selectConversation(c)}
                                    >
                                        <span className="flex aspect-square h-12 w-12 items-center justify-center rounded-full bg-gray-400/40">
                                            {c.peerName ? (
                                                <span className="text-4xl font-bold">
                                                    {c.peerName.slice(0, 1)}
                                                </span>
                                            ) : (
                                                <UserIconContactList
                                                    size={34}
                                                    className="text-white"
                                                />
                                            )}
                                        </span>

                                        <div className="me-1 flex w-[calc(100%-40px)] flex-col items-start gap-0.5 overflow-x-hidden">
                                            <div className="flex w-full items-center justify-between">
                                                <span className="truncate text-lg font-semibold">
                                                    {c.peerName || c.peer}
                                                </span>
                                                <span className="text-base text-white/60">
                                                    {formatSmartDate(c.lastTs)}
                                                </span>
                                            </div>

                                            <div className="flex w-full items-center gap-2">
                                                <span
                                                    dir={
                                                        hasPersianSpecificChars(
                                                            c.lastPreview
                                                        )
                                                            ? "rtl"
                                                            : "ltr"
                                                    }
                                                    className={cn(
                                                        "line-clamp-2 w-full text-base text-white/75",
                                                        hasPersianSpecificChars(
                                                            c.lastPreview
                                                        )
                                                            ? "text-right"
                                                            : "text-left"
                                                    )}
                                                >
                                                    {c.lastPreview}
                                                    <br />
                                                    <span className="">...</span>
                                                </span>

                                                {c.unreadCount > 0 && (
                                                    <span className="flex h-5 w-5 max-w-5 min-w-5 items-center justify-center rounded-full bg-[#5aaaff]/50 text-sm">
                                                        {c.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {i + 1 !== conversations.length && (
                                        <span className="w-full bg-linear-to-r from-white/0 via-white/60 to-white/0 pt-px" />
                                    )}
                                </Fragment>
                            ))}

                        <div className="py-6" />
                    </div>

                    {!!conversations.length && conversationsLoading && !pairLoading && (
                        <span className="absolute bottom-16 animate-spin duration-1000 ease-in-out">
                            <BiLoaderCircle className="text-4xl" />
                        </span>
                    )}
                </div>
            </div>

            {/* DESKTOP RIGHT PANEL (unchanged) */}
            <div className="shadow-soft-lg hidden h-full rounded-3xl md:flex md:w-[60%] lg:w-full">
                <div className="relative flex h-full w-full flex-col items-center justify-start gap-2">
                    {!!activeThreadId ? (
                        <>
                            <div
                                className={cn(
                                    "absolute top-0 flex w-full flex-col items-center justify-center gap-1",
                                    "z-99 bg-linear-to-b from-black via-black/80 to-black/0 pb-10"
                                )}
                            >
                                <span className="flex aspect-square h-12 w-12 items-center justify-center rounded-full bg-gray-400/40">
                                    {activeConversation?.peerName ||
                                    activeContact?.displayName ? (
                                        <span className="text-4xl font-bold">
                                            {(
                                                activeConversation?.peerName ||
                                                activeContact?.displayName
                                            ).slice(0, 1)}
                                        </span>
                                    ) : (
                                        <UserIconContactList
                                            size={34}
                                            className="text-white"
                                        />
                                    )}
                                </span>

                                <span className="flex items-center justify-center rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 px-3 py-1 text-sm font-semibold text-white backdrop-blur-3xl">
                                    {activeConversation?.peerName ||
                                        activeContact?.displayName ||
                                        activeConversation?.peer ||
                                        activeContact?.rawNumber ||
                                        activeContact?.norm ||
                                        activeSendTo}
                                </span>
                            </div>

                            <div
                                ref={messagesScrollRef}
                                onScroll={onMessagesScroll}
                                className="scroll-style-none flex h-full max-h-full w-full flex-col-reverse items-center justify-start gap-4 overflow-auto"
                            >
                                <span className="py-8" />
                                {showMessagesSkeletons ? (
                                    <div className="flex h-full w-full flex-col items-center justify-start gap-2">
                                        {Array.from({ length: 16 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "flex w-fit max-w-5/6 flex-col rounded-4xl border border-white/20 bg-white/5 px-4 py-2 md:max-w-1/2",
                                                    i % 7 === 0
                                                        ? "self-end rounded-br-xl bg-white/90!"
                                                        : "self-start rounded-bl-xl"
                                                )}
                                            >
                                                <Skeleton
                                                    className="h-5 rounded-full bg-gray-600/30"
                                                    style={{
                                                        width: `${(i % 5 || 5) * 2}rem`,
                                                    }}
                                                />
                                                {i % 5 === 0 && (
                                                    <Skeleton className="mt-2 h-5 w-20 rounded-full bg-gray-600/30" />
                                                )}
                                                {i % 10 === 0 && (
                                                    <Skeleton className="mt-2 h-5 rounded-full bg-gray-600/30 md:w-70" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {groupByDay(activeMessages)
                                            .reverse()
                                            .map((d, i) => (
                                                <div
                                                    key={d.ts}
                                                    className="flex w-full flex-col items-center justify-start gap-2 justify-self-start"
                                                >
                                                    {formatDay(d.ts)}
                                                    {d.items.map((m, index) => (
                                                        <MessageBoxComponent
                                                            key={m.id}
                                                            m={m}
                                                            formatClock={formatClock}
                                                            statusLabel={statusLabel}
                                                            hasPersianSpecificChars={
                                                                hasPersianSpecificChars
                                                            }
                                                            isLastChild={
                                                                i === 0 &&
                                                                index ===
                                                                    d.items.length - 1
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                    </>
                                )}
                                <span className="py-10" />
                            </div>

                            <div className="absolute bottom-0 z-99 flex w-full items-end gap-2 bg-linear-to-t from-black via-black/80 to-black/0 p-2 md:p-4">
                                <div className="w-full max-w-18 lg:max-w-24">
                                    <GlassSelect
                                        value={
                                            simSlotIndex === null
                                                ? ""
                                                : String(simSlotIndex)
                                        }
                                        onValueChange={(v) =>
                                            setSimSlotIndex(
                                                v === "" ? null : (Number(v) as 0 | 1)
                                            )
                                        }
                                        options={SIM_OPTIONS}
                                        placeholder="Choose SIM"
                                        dropdownSide="top"
                                        searchable={false}
                                    />
                                </div>

                                {/* ✅ DESKTOP textarea: add ref */}
                                <textarea
                                    ref={desktopComposerRef}
                                    value={composer}
                                    rows={1}
                                    onChange={(e) => {
                                        const el = e.currentTarget;
                                        setComposer(el.value);

                                        el.style.height = "0px";
                                        const next = Math.min(el.scrollHeight, 400);
                                        el.style.height = `${next}px`;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            doSend();
                                        }
                                    }}
                                    placeholder="Type a message…"
                                    className="w-full resize-none rounded-3xl border border-gray-400/40 bg-[#1e1e1e]/60 px-4 py-2 text-sm outline-0 backdrop-blur-3xl transition-colors focus:border-gray-400/80 md:text-base"
                                    style={{ maxHeight: 400 }}
                                    disabled={pairLoading || !pairState}
                                />

                                <button
                                    type="button"
                                    onClick={() => doSend()}
                                    disabled={
                                        pairLoading ||
                                        !pairState ||
                                        !composer.trim() ||
                                        !(activeSendTo || activeConversation?.peer)
                                    }
                                    className="flex h-10 w-10 min-w-10 cursor-pointer items-center justify-center rounded-full border border-gray-400/40 bg-white text-black backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                                    title="Send"
                                >
                                    <BiSolidSend className="text-2xl" />
                                </button>
                            </div>
                        </>
                    ) : showConversationSkeletons ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                            <Skeleton className="h-7.5 w-52 rounded-full bg-gray-600/30" />
                            <Skeleton className="h-5 w-full max-w-150 rounded-full bg-gray-600/30" />
                        </div>
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                            <span className="text-2xl font-semibold text-white">
                                Select Conversation
                            </span>
                            <span className="text-center text-base text-white/75">
                                There is no Conversation Selected, Select a Conversation
                                from Conversations List or Contact List to Continue!
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* ✅ MOBILE DRAWER (slides over conversations) */}
            <div
                className={cn(
                    "fixed inset-0 z-9999 container bg-black py-4 md:hidden",
                    drawerTransitionsEnabled
                        ? "transition-transform duration-300 ease-in-out"
                        : "transition-none",
                    showMobileMessagesDrawer ? "translate-x-0" : "translate-x-full",
                    showMobileMessagesDrawer
                        ? "pointer-events-auto"
                        : "pointer-events-none"
                )}
            >
                <div className="shadow-soft-lg h-full w-full rounded-3xl">
                    <div className="relative flex h-full w-full flex-col items-center justify-start gap-2">
                        {!!activeThreadId && (
                            <>
                                {/* Header */}
                                <div
                                    className={cn(
                                        "absolute top-0 flex w-full flex-col items-center justify-center gap-1",
                                        "z-99 -mt-2 bg-linear-to-b from-black via-black/80 to-black/0 pb-10"
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={clearSelectedConversation}
                                        className="absolute top-2 left-2 flex h-10 w-10 min-w-10 cursor-pointer items-center justify-center rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                                        title="Back"
                                    >
                                        <FiArrowLeft className="text-xl" />
                                    </button>

                                    <span className="flex aspect-square h-12 w-12 items-center justify-center rounded-full bg-gray-400/40">
                                        {activeConversation?.peerName ||
                                        activeContact?.displayName ? (
                                            <span className="text-4xl font-bold">
                                                {(
                                                    activeConversation?.peerName ||
                                                    activeContact?.displayName
                                                ).slice(0, 1)}
                                            </span>
                                        ) : (
                                            <UserIconContactList
                                                size={34}
                                                className="text-white"
                                            />
                                        )}
                                    </span>

                                    <span className="flex items-center justify-center rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 px-3 py-1 text-sm font-semibold text-white backdrop-blur-3xl">
                                        {activeConversation?.peerName ||
                                            activeContact?.displayName ||
                                            activeConversation?.peer ||
                                            activeContact?.rawNumber ||
                                            activeContact?.norm ||
                                            activeSendTo}
                                    </span>
                                </div>

                                <div
                                    ref={messagesScrollRef}
                                    onScroll={onMessagesScroll}
                                    className="scroll-style-none flex h-full max-h-full w-full flex-col-reverse items-center justify-start gap-4 overflow-auto"
                                >
                                    <span className="py-8" />
                                    {showMessagesSkeletons ? (
                                        <>
                                            {Array.from({ length: 16 }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "flex w-fit max-w-5/6 flex-col rounded-4xl border border-white/20 bg-white/5 px-4 py-2 md:max-w-1/2",
                                                        i % 7 === 0
                                                            ? "self-end rounded-br-xl bg-white/90!"
                                                            : "self-start rounded-bl-xl"
                                                    )}
                                                >
                                                    <Skeleton
                                                        className="h-5 rounded-full bg-gray-600/30"
                                                        style={{
                                                            width: `${(i % 5 || 5) * 2}rem`,
                                                        }}
                                                    />
                                                    {i % 5 === 0 && (
                                                        <Skeleton className="mt-2 h-5 w-20 rounded-full bg-gray-600/30" />
                                                    )}
                                                    {i % 10 === 0 && (
                                                        <Skeleton className="mt-2 h-5 rounded-full bg-gray-600/30 md:w-70" />
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            {groupByDay(activeMessages)
                                                .reverse()
                                                .map((d, i) => (
                                                    <div
                                                        key={d.ts}
                                                        className="flex w-full flex-col items-center justify-start gap-2 justify-self-start"
                                                    >
                                                        {formatDay(d.ts)}
                                                        {d.items.map((m, index) => (
                                                            <MessageBoxComponent
                                                                key={m.id}
                                                                m={m}
                                                                formatClock={formatClock}
                                                                statusLabel={statusLabel}
                                                                hasPersianSpecificChars={
                                                                    hasPersianSpecificChars
                                                                }
                                                                isLastChild={
                                                                    i === 0 &&
                                                                    index ===
                                                                        d.items.length - 1
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                        </>
                                    )}
                                    <span className="py-8" />
                                </div>

                                <div className="absolute bottom-0 z-99 flex w-full items-center gap-2 bg-linear-to-t from-black via-black/70 to-black/0 p-2 md:p-4">
                                    <GlassSelect
                                        value={
                                            simSlotIndex === null
                                                ? ""
                                                : String(simSlotIndex)
                                        }
                                        onValueChange={(v) =>
                                            setSimSlotIndex(
                                                v === "" ? null : (Number(v) as 0 | 1)
                                            )
                                        }
                                        options={SIM_OPTIONS}
                                        placeholder="Choose SIM"
                                        dropdownSide="top"
                                        searchable={false}
                                    />

                                    {/* ✅ MOBILE textarea: add ref */}
                                    <textarea
                                        ref={mobileComposerRef}
                                        value={composer}
                                        rows={1}
                                        onChange={(e) => {
                                            const el = e.currentTarget;
                                            setComposer(el.value);

                                            el.style.height = "0px";
                                            const next = Math.min(el.scrollHeight, 400);
                                            el.style.height = `${next}px`;
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                doSend();
                                            }
                                        }}
                                        placeholder="Type a message…"
                                        className="scroll-style-none w-full resize-none rounded-3xl border border-gray-400/40 bg-[#1e1e1e]/60 px-4 py-2 text-lg outline-0 backdrop-blur-3xl transition-colors focus:border-gray-400/80"
                                        style={{ maxHeight: 400 }}
                                        disabled={pairLoading || !pairState}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => doSend()}
                                        disabled={
                                            pairLoading ||
                                            !pairState ||
                                            !composer.trim() ||
                                            !(activeSendTo || activeConversation?.peer)
                                        }
                                        className="flex h-11 w-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-gray-400/40 bg-white text-black backdrop-blur-2xl transition-all duration-150 hover:scale-[1.05] hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                                        title="Send"
                                    >
                                        <BiSolidSend className="text-2xl" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PairingScreen(props: {
    onPaired: (p: PairState) => void;
    onToast: (title: string, body?: string) => void;
}) {
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const demoCode = (process.env.NEXT_PUBLIC_DEMO_MODE_CODE || "000000")
        .replace(/\D+/g, "")
        .slice(0, 6)
        .padEnd(6, "0");

    const doPair = useCallback(
        async (overrideCode?: string) => {
            const c = (overrideCode ?? code).trim();
            if (!c) return;
            setLoading(true);
            try {
                const pwaDeviceId = ensureClientDeviceId();
                const res = await pairComplete({
                    code: c,
                    pwaDeviceId,
                    pwaPubSpkiB64: "AA==",
                    deviceLabel: "PWA",
                });
                persistPairToken(res.pairToken);
                props.onPaired({
                    pairToken: res.pairToken,
                    pairingId: res.pairingId,
                    gatewayDeviceId: res.gatewayDeviceId,
                    gatewayPubSpkiB64: res.gatewayPubSpkiB64,
                    demo: Boolean(res.demo),
                });
                if (res.demo) {
                    props.onToast("Demo mode", "Seeded contacts and fake SMS data loaded.");
                }
            } catch (e: any) {
                props.onToast("Pairing failed", e?.message);
            } finally {
                setLoading(false);
            }
        },
        [code, props]
    );

    return (
        <div className="container flex h-full w-full items-center justify-center">
            <div className="flex max-w-md flex-col items-center justify-center gap-2 text-center">
                <div className="mb-1 text-3xl font-semibold">Pair this device</div>
                <div className="text-base text-white/80">
                    On your Android gateway, generate an invite code, then enter it here.
                </div>
                <div className="flex items-center gap-1 text-sm text-white/70">
                    <LuBadgeInfo className="text-2xl" />
                    Tip: enter {demoCode} to open demo mode with fake seeded data.
                </div>

                <div className="mt-4 flex w-full items-center justify-center py-2">
                    <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(v) => setCode(v)}
                        className="w-full"
                    >
                        <InputOTPGroup className="w-full">
                            <InputOTPSlot
                                index={0}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                            <InputOTPSlot
                                index={1}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                            <InputOTPSlot
                                index={2}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                            <InputOTPSlot
                                index={3}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                            <InputOTPSlot
                                index={4}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                            <InputOTPSlot
                                index={5}
                                className="h-14 w-12 border-white/30 text-2xl"
                            />
                        </InputOTPGroup>
                    </InputOTP>
                </div>

                <button
                    className="mx-auto mt-4 rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 px-8 py-3 disabled:cursor-not-allowed disabled:bg-white/10"
                    onClick={() => doPair()}
                    disabled={loading || !code.trim()}
                >
                    {loading ? "Pairing…" : "Pair"}
                </button>

                <button
                    type="button"
                    className="mt-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-6 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                        setCode(demoCode);
                        void doPair(demoCode);
                    }}
                    disabled={loading}
                >
                    Enter demo mode ({demoCode})
                </button>
            </div>
        </div>
    );
}

function ensureClientDeviceId(): string {
    if (typeof window === "undefined") return "pwa";
    const key = "pwaDeviceId";
    let v = window.localStorage.getItem(key);
    if (!v) {
        v = `pwa-${Math.random().toString(16).slice(2)}-${Date.now()}`;
        window.localStorage.setItem(key, v);
    }
    return v;
}

function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
