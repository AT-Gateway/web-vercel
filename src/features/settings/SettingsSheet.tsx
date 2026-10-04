"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Bell,
    Copy,
    Hand,
    KeyRound,
    Moon,
    Send,
    Smartphone,
    Sun,
    SunMoon,
    UsersRound,
} from "lucide-react";
import {
    createInvite,
    type Device,
    listDevices,
    telegramStatus,
    type TelegramStatusRes,
} from "@/lib/api";
import { formatCountdown, pluralize } from "@/lib/format";
import {
    currentPushEnabled,
    disablePush,
    enablePush,
    prefetchVapidKey,
    pushSupport,
} from "@/lib/push";
import { isIOS, isStandalone } from "@/lib/device";
import { cn } from "@/lib/utils";
import { Sheet, SheetBody, SheetHeader } from "@/components/ios/Sheet";
import { Button } from "@/components/ios/Button";
import { IconTile, List, Row, Section } from "@/components/ios/List";
import { Switch } from "@/components/ios/Switch";
import { SegmentedControl } from "@/components/ios/SegmentedControl";
import { Spinner } from "@/components/ios/Spinner";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useToast } from "@/components/ios/Toast";
import { useAppearance, useGlassTint } from "@/hooks/useAppearance";
import { Slider } from "@/components/ios/Slider";
import { useApp } from "@/features/app/AppProvider";
import { AppIcon } from "@/components/ios/AppIcon";
import {
    PAGE_TITLES,
    PageTitle,
    type SettingsPage,
    SettingsNavContext,
    useSettingsNav,
} from "@/features/settings/SettingsNav";
import { TelegramPage } from "@/features/settings/TelegramPage";
import { ContactsPage, ContactEditPage } from "@/features/settings/ContactsPage";
import { BlockedPage } from "@/features/settings/BlockedPage";
import { DevicesPage } from "@/features/settings/DevicesPage";

function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [active]);
    return now;
}

/** "5 minutes", "3 hours", "2 days" for the gateway's last-seen line. */
function formatIdle(ms: number): string {
    const mins = Math.max(1, Math.round(ms / 60_000));
    if (mins < 60) return pluralize(mins, "minute");
    const hours = Math.round(mins / 60);
    if (hours < 48) return pluralize(hours, "hour");
    return pluralize(Math.round(hours / 24), "day");
}

/** While an invite code is live, how often to look for the device that uses it. */
const INVITE_POLL_MS = 4000;

export function SettingsSheet({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
}) {
    const [stack, setStack] = useState<SettingsPage[]>([{ name: "root" }]);
    const [direction, setDirection] = useState<"push" | "pop" | null>(null);

    useEffect(() => {
        if (open) {
            setStack([{ name: "root" }]);
            setDirection(null);
        }
    }, [open]);

    const push = useCallback((p: SettingsPage) => {
        setDirection("push");
        setStack((s) => [...s, p]);
    }, []);
    const pop = useCallback(() => {
        setDirection("pop");
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    }, []);

    // Android Back pops a pushed page first, then closes the sheet.
    const depth = useRef(stack.length);
    depth.current = stack.length;
    const onBack = useCallback(() => {
        if (depth.current > 1) pop();
        else onOpenChange(false);
    }, [pop, onOpenChange]);

    const page = stack[stack.length - 1];
    const previous = stack[stack.length - 2];
    const nav = useMemo(
        () => ({
            push,
            pop,
            close: () => onOpenChange(false),
            previousTitle: previous ? PAGE_TITLES[previous.name] : "Settings",
        }),
        [push, pop, onOpenChange, previous]
    );

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onBack={onBack}
            description="App settings"
        >
            <SettingsNavContext.Provider value={nav}>
                <div
                    key={stack.length}
                    onAnimationEnd={(e) => {
                        if (e.target === e.currentTarget) setDirection(null);
                    }}
                    className={cn(
                        "bg-grouped flex min-h-0 flex-1 flex-col",
                        direction === "push" && "animate-push-in",
                        direction === "pop" && "animate-pop-back"
                    )}
                >
                    {page.name === "root" ? <RootPage /> : null}
                    {page.name === "telegram" ? <TelegramPage /> : null}
                    {page.name === "contacts" ? <ContactsPage /> : null}
                    {page.name === "contact-edit" ? (
                        <ContactEditPage contact={page.contact} />
                    ) : null}
                    {page.name === "blocked" ? <BlockedPage /> : null}
                    {page.name === "devices" ? <DevicesPage /> : null}
                </div>
            </SettingsNavContext.Provider>
        </Sheet>
    );
}

function RootPage() {
    const { session, signOut, blockedChats, gatewayIdleMs } = useApp();
    const nav = useSettingsNav();
    const toast = useToast();
    const [confirmNode, confirm] = useConfirm();
    const [appearance, setAppearance] = useAppearance();
    const [glassTint, setGlassTint] = useGlassTint();

    const [pushOn, setPushOn] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const support = useMemo(() => pushSupport(), []);

    const [telegram, setTelegram] = useState<TelegramStatusRes | null>(null);
    const [devices, setDevices] = useState<Device[] | null>(null);

    const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(
        null
    );
    const [inviteBusy, setInviteBusy] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const now = useNow(Boolean(invite));
    const inviteLive = invite && invite.expiresAt > now ? invite : null;
    const inviteCode = inviteLive?.code ?? null;
    const devicesRef = useRef(devices);
    devicesRef.current = devices;

    useEffect(() => {
        currentPushEnabled().then(setPushOn);
        if (!session) return;
        // Fetched now so turning notifications on can ask for permission
        // straight away, while the tap still counts as a user gesture.
        if (support.supported) void prefetchVapidKey();
        telegramStatus(session.pairToken)
            .then(setTelegram)
            .catch(() => {});
        listDevices(session.pairToken)
            .then((r) => setDevices(r.devices ?? []))
            .catch(() => {});
    }, [session, support.supported]);

    // While an invite code is up, watch for the browser that redeems it.
    useEffect(() => {
        if (!session || !inviteCode) return;
        let cancelled = false;
        let known: Set<string> | null = devicesRef.current
            ? new Set(devicesRef.current.map((d) => d.deviceId))
            : null;
        const check = async () => {
            try {
                const r = await listDevices(session.pairToken);
                if (cancelled) return;
                const list = r.devices ?? [];
                setDevices(list);
                if (!known) {
                    known = new Set(list.map((d) => d.deviceId));
                    return;
                }
                const joined = list.find(
                    (d) => d.deviceType === "pwa" && !known?.has(d.deviceId)
                );
                if (joined) {
                    cancelled = true;
                    toast({
                        title: `${joined.deviceLabel || "New Device"} Connected`,
                        tone: "success",
                    });
                    setInvite(null);
                }
            } catch {
                // Try again on the next tick.
            }
        };
        const timer = window.setInterval(check, INVITE_POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") void check();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [session, inviteCode, toast]);

    if (!session) return null;

    const togglePush = async (next: boolean) => {
        setPushBusy(true);
        try {
            if (next) {
                await enablePush(session.pairToken);
                toast({ title: "Notifications On", tone: "success" });
            } else {
                await disablePush();
                toast({ title: "Notifications Off" });
            }
            setPushOn(next);
        } catch (e) {
            toast({
                title: "Couldn't Turn On Notifications",
                body: e instanceof Error ? e.message : undefined,
                tone: "error",
            });
        } finally {
            setPushBusy(false);
        }
    };

    const generateInvite = async () => {
        setInviteBusy(true);
        try {
            const r = await createInvite(session.pairToken);
            setInvite({ code: r.code, expiresAt: r.expiresAt });
        } catch (e) {
            toast({
                title: "Couldn't Create Invite",
                body: e instanceof Error ? e.message : undefined,
                tone: "error",
            });
        } finally {
            setInviteBusy(false);
        }
    };

    const copy = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: `${what} Copied`, tone: "success" });
        } catch {
            toast({ title: "Couldn't Copy", tone: "error" });
        }
    };

    const copyToken = async () => {
        const ok = await confirm({
            title: "Copy Access Token?",
            message: "Anyone with this token can read and send your messages.",
            confirmLabel: "Copy",
            destructive: false,
        });
        if (ok) await copy(session.pairToken, "Token");
    };

    const gatewayStatus =
        gatewayIdleMs == null
            ? "Android gateway"
            : gatewayIdleMs < 10 * 60_000
              ? "Android gateway · Online"
              : `Android gateway · Last seen ${formatIdle(gatewayIdleMs)} ago`;

    const pushFooter =
        isIOS() && !isStandalone()
            ? "Add this app to your Home Screen to get notifications, then use Invite Another Device below to get a code for the Home Screen app."
            : !support.supported
              ? support.reason
              : "Get notified on this device when a new SMS arrives.";

    const telegramValue = !telegram
        ? undefined
        : !telegram.configured
          ? "Not Set Up"
          : telegram.alertsEnabled && telegram.enabled
            ? "On"
            : "Off";

    return (
        <>
            <SheetHeader
                title={<PageTitle>Settings</PageTitle>}
                trailing={
                    <Button variant="glass" tone="label" size="bar" onClick={nav.close}>
                        Done
                    </Button>
                }
            />
            <SheetBody className="pt-2">
                <List>
                    <Section>
                        <div className="flex items-center gap-4 px-4 py-3.5">
                            <AppIcon size={60} />
                            <div className="flex min-w-0 flex-col">
                                <span className="text-title-3 flex items-center gap-2 font-semibold">
                                    SMS Gateway
                                    {session.demo ? (
                                        <span className="bg-green/15 text-caption-1 text-green rounded-full px-2 py-px font-semibold">
                                            Demo
                                        </span>
                                    ) : null}
                                </span>
                                <span className="text-subhead text-label-2 truncate">
                                    {gatewayStatus}
                                </span>
                            </div>
                        </div>
                    </Section>

                    <Section footer={pushFooter}>
                        <Row
                            icon={
                                <IconTile className="bg-red">
                                    <Bell fill="currentColor" />
                                </IconTile>
                            }
                            title="Notifications"
                            accessory={
                                pushBusy ? (
                                    <Spinner size={18} />
                                ) : (
                                    <Switch
                                        checked={pushOn}
                                        onChange={togglePush}
                                        disabled={!support.supported}
                                        label="Notifications"
                                    />
                                )
                            }
                        />
                    </Section>

                    <Section>
                        <Row
                            icon={
                                <IconTile className="bg-[#2aabee]">
                                    <Send
                                        fill="currentColor"
                                        className="-translate-x-px translate-y-px"
                                    />
                                </IconTile>
                            }
                            title="Telegram"
                            value={telegramValue}
                            accessory="chevron"
                            onClick={() => nav.push({ name: "telegram" })}
                        />
                        <Row
                            icon={
                                <IconTile className="bg-gray">
                                    <UsersRound strokeWidth={2.2} />
                                </IconTile>
                            }
                            title="Contacts"
                            accessory="chevron"
                            onClick={() => nav.push({ name: "contacts" })}
                        />
                        <Row
                            icon={
                                <IconTile className="bg-red">
                                    <Hand strokeWidth={2.2} />
                                </IconTile>
                            }
                            title="Blocked Contacts"
                            value={
                                blockedChats.length ? String(blockedChats.length) : "None"
                            }
                            accessory="chevron"
                            onClick={() => nav.push({ name: "blocked" })}
                        />
                        <Row
                            icon={
                                <IconTile className="bg-blue">
                                    <Smartphone />
                                </IconTile>
                            }
                            title="Devices"
                            value={devices ? String(devices.length) : undefined}
                            accessory="chevron"
                            onClick={() => nav.push({ name: "devices" })}
                        />
                    </Section>

                    <Section
                        header="Invite"
                        footer="Enter this code on another browser to give it access to your messages."
                    >
                        {inviteLive ? (
                            <div className="flex flex-col items-center px-4 pt-4 pb-3">
                                <span
                                    className="font-mono text-[2.5rem] leading-none font-semibold tracking-[0.18em] tabular-nums select-text [-webkit-touch-callout:default]"
                                    aria-label={`Invite code ${inviteLive.code.split("").join(" ")}`}
                                >
                                    {inviteLive.code}
                                </span>
                                <span className="text-footnote text-label-2 mt-2 tabular-nums">
                                    Expires in{" "}
                                    {formatCountdown(inviteLive.expiresAt - now)}
                                </span>
                                <div className="mt-3 flex gap-2">
                                    <Button
                                        variant="tinted"
                                        size="sm"
                                        icon={<Copy className="size-4" />}
                                        onClick={() => copy(inviteLive.code, "Code")}
                                    >
                                        Copy
                                    </Button>
                                    <Button
                                        variant="gray"
                                        size="sm"
                                        loading={inviteBusy}
                                        onClick={generateInvite}
                                    >
                                        New Code
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Row
                                icon={
                                    <IconTile className="bg-green">
                                        <KeyRound />
                                    </IconTile>
                                }
                                title="Invite Another Device"
                                tone="tint"
                                accessory={inviteBusy ? <Spinner size={18} /> : undefined}
                                onClick={generateInvite}
                                disabled={inviteBusy}
                            />
                        )}
                    </Section>

                    <Section header="Appearance">
                        <div className="p-3">
                            <SegmentedControl
                                label="Appearance"
                                value={appearance}
                                onChange={setAppearance}
                                segments={[
                                    {
                                        value: "system",
                                        label: "Automatic",
                                        icon: <SunMoon className="size-4" />,
                                    },
                                    {
                                        value: "light",
                                        label: "Light",
                                        icon: <Sun className="size-4" />,
                                    },
                                    {
                                        value: "dark",
                                        label: "Dark",
                                        icon: <Moon className="size-4" />,
                                    },
                                ]}
                            />
                        </div>
                    </Section>

                    <Section
                        header="Liquid Glass"
                        footer="Choose how clear or tinted glass buttons and bars look. A more tinted look is easier to read."
                    >
                        <GlassPreview />
                        <div className="flex items-center gap-3 px-4 pt-1 pb-3">
                            <span className="text-footnote text-label-2 shrink-0">
                                Clear
                            </span>
                            <Slider
                                label="Liquid Glass transparency"
                                value={glassTint}
                                onChange={setGlassTint}
                                valueText={
                                    glassTint < 0.2
                                        ? "Ultra clear"
                                        : glassTint > 0.85
                                          ? "Fully tinted"
                                          : `${Math.round(glassTint * 100)}% tinted`
                                }
                            />
                            <span className="text-footnote text-label-2 shrink-0">
                                Tinted
                            </span>
                        </div>
                    </Section>

                    <Section>
                        {showAdvanced ? (
                            <>
                                <Row
                                    title="Pairing ID"
                                    value={
                                        <span className="text-subhead font-mono">
                                            {session.pairingId.slice(0, 8)}…
                                        </span>
                                    }
                                    onClick={() => copy(session.pairingId, "Pairing ID")}
                                    ariaLabel="Copy pairing ID"
                                />
                                <Row
                                    title="Access Token"
                                    value={
                                        <span className="text-subhead font-mono">
                                            ••••{session.pairToken.slice(-4)}
                                        </span>
                                    }
                                    onClick={copyToken}
                                    ariaLabel="Copy access token"
                                />
                            </>
                        ) : null}
                        <Row
                            title={showAdvanced ? "Hide Advanced" : "Show Advanced"}
                            tone="tint"
                            onClick={() => setShowAdvanced((v) => !v)}
                        />
                    </Section>

                    {session.demo ? (
                        <Section footer="Go back to the pairing screen to connect your Android gateway.">
                            <Row
                                title="Exit Demo"
                                tone="tint"
                                centered
                                onClick={signOut}
                            />
                        </Section>
                    ) : (
                        <Section footer="Signing out removes this browser's access. You'll need a new invite code to pair again.">
                            <Row
                                title="Sign Out"
                                tone="red"
                                centered
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: "Sign out of this device?",
                                        message:
                                            "This browser will lose access. You'll need a new invite code to reconnect.",
                                        confirmLabel: "Sign Out",
                                    });
                                    if (ok) signOut();
                                }}
                            />
                        </Section>
                    )}
                </List>
            </SheetBody>
            {confirmNode}
        </>
    );
}

/** Live sample of the glass material over busy content, for the transparency slider. */
function GlassPreview() {
    return (
        <div
            aria-hidden
            className="bg-bg relative mx-3 mt-3 mb-1 h-[104px] overflow-hidden rounded-[18px]"
        >
            <div className="text-footnote absolute inset-0 flex flex-col gap-1.5 p-3">
                <span className="bg-bubble-in text-bubble-in-label w-fit rounded-[14px] px-2.5 py-1">
                    Your code is 482913. Don’t share it.
                </span>
                <span className="bg-bubble-out text-bubble-out-label w-fit self-end rounded-[14px] px-2.5 py-1">
                    Thanks — I’m on my way, see you soon!
                </span>
                <span className="bg-bubble-in text-bubble-in-label w-fit rounded-[14px] px-2.5 py-1">
                    See you at 6 🙌
                </span>
            </div>
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center gap-2">
                <span className="glass text-subhead flex h-10 items-center rounded-full px-4 font-semibold">
                    Liquid Glass
                </span>
                <span className="glass flex size-10 items-center justify-center rounded-full">
                    <Moon className="size-[18px]" />
                </span>
            </div>
        </div>
    );
}
