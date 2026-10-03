"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatCountdown } from "@/lib/format";
import { currentPushEnabled, disablePush, enablePush, pushSupport } from "@/lib/push";
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
        <Sheet open={open} onOpenChange={onOpenChange} description="App settings">
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
    const { session, signOut, blockedChats } = useApp();
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
    const now = useNow(Boolean(invite));
    const inviteLive = invite && invite.expiresAt > now ? invite : null;

    useEffect(() => {
        currentPushEnabled().then(setPushOn);
        if (!session) return;
        telegramStatus(session.pairToken)
            .then(setTelegram)
            .catch(() => {});
        listDevices(session.pairToken)
            .then((r) => setDevices(r.devices ?? []))
            .catch(() => {});
    }, [session]);

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
                title="Settings"
                trailing={
                    <Button variant="glass" tone="label" size="sm" onClick={nav.close}>
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
                                    Gateway “{session.gatewayDeviceId}”
                                </span>
                            </div>
                        </div>
                    </Section>

                    <Section
                        footer={
                            !support.supported
                                ? support.reason
                                : "Get notified on this device when a new SMS arrives."
                        }
                    >
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
                                    className="font-mono text-[2.5rem] leading-none font-semibold tracking-[0.18em] tabular-nums"
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

                    <Section header="This Device">
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
                            onClick={() => copy(session.pairToken, "Token")}
                            ariaLabel="Copy access token"
                        />
                    </Section>

                    <Section footer="Signing out removes this browser's access. You'll need a new invite code to pair again.">
                        <Row
                            title="Sign Out"
                            tone="red"
                            centered
                            onClick={async () => {
                                const ok = await confirm({
                                    title: "Sign out of this device?",
                                    confirmLabel: "Sign Out",
                                });
                                if (ok) signOut();
                            }}
                        />
                    </Section>
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
