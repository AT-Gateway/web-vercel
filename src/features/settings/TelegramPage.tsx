"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Send, WifiOff } from "lucide-react";
import {
    telegramCreateLinkCode,
    telegramSetAlerts,
    telegramSetupWebhook,
    telegramStatus,
    type TelegramStatusRes,
    telegramTest,
} from "@/lib/api";
import { formatCountdown, formatRelative, pluralize } from "@/lib/format";
import { SheetBody } from "@/components/ios/Sheet";
import { Button } from "@/components/ios/Button";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { List, Row, Section } from "@/components/ios/List";
import { Switch } from "@/components/ios/Switch";
import { Spinner } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import { useApp } from "@/features/app/AppProvider";
import { PageHeader } from "@/features/settings/SettingsNav";

type LinkCode = { code: string; expiresAt: number; botDeepLink: string | null };

/** While a link code is live, how often to look for the newly linked chat. */
const LINK_POLL_MS = 4000;

export function TelegramPage() {
    const { session } = useApp();
    const toast = useToast();
    const [status, setStatus] = useState<TelegramStatusRes | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [link, setLink] = useState<LinkCode | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const statusRef = useRef(status);
    statusRef.current = status;

    /** `background`: a silent refresh (link polling) that never reports errors. */
    const load = useCallback(
        async (opts?: { background?: boolean }) => {
            if (!session) return null;
            try {
                const next = await telegramStatus(session.pairToken);
                setStatus(next);
                setError(false);
                return next;
            } catch (e) {
                if (opts?.background) return null;
                if (statusRef.current) {
                    toast({
                        title: "Couldn't Load Telegram",
                        body: e instanceof Error ? e.message : undefined,
                        tone: "error",
                    });
                } else {
                    setError(true);
                }
                return null;
            } finally {
                setLoading(false);
            }
        },
        [session, toast]
    );

    useEffect(() => {
        load();
    }, [load]);

    const retry = () => {
        setError(false);
        setLoading(true);
        void load();
    };

    useEffect(() => {
        if (!link) return;
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [link]);

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        try {
            await fn();
        } catch (e) {
            toast({
                title: "Something Went Wrong",
                body: e instanceof Error ? e.message : undefined,
                tone: "error",
            });
        } finally {
            setBusy(null);
        }
    };

    const configured = Boolean(status?.configured);
    const enabled = Boolean(status?.enabled);
    const alerts = Boolean(status?.alertsEnabled);
    const subs = status?.subscribers ?? [];
    const active = subs.filter((s) => s.enabled).length;
    const liveLink = link && link.expiresAt > now ? link : null;
    const linkCode = liveLink?.code ?? null;

    // While a link code is up, watch for the chat that sends it to the bot.
    useEffect(() => {
        if (!linkCode) return;
        const before = statusRef.current?.subscribers?.length ?? 0;
        let cancelled = false;
        const check = async () => {
            const next = await load({ background: true });
            if (cancelled || !next) return;
            if ((next.subscribers?.length ?? 0) > before) {
                cancelled = true;
                toast({ title: "Telegram Linked", tone: "success" });
                setLink(null);
            }
        };
        const timer = window.setInterval(check, LINK_POLL_MS);
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
    }, [linkCode, load, toast]);

    if (!session) return null;

    const copyLinkCommand = async (code: string) => {
        try {
            await navigator.clipboard.writeText(`/link ${code}`);
            toast({ title: "Command Copied", tone: "success" });
        } catch {
            toast({ title: "Couldn't Copy", tone: "error" });
        }
    };

    return (
        <>
            <PageHeader title="Telegram" />
            <SheetBody className="pt-2">
                <div className="flex flex-col items-center px-8 pt-2 pb-7 text-center">
                    <span className="flex size-[60px] items-center justify-center rounded-[14px] bg-[#2aabee] text-white shadow-[0_6px_16px_rgb(42_171_238/0.35)]">
                        <Send
                            className="size-8 -translate-x-0.5 translate-y-0.5"
                            fill="currentColor"
                        />
                    </span>
                    <h2 className="text-title-2 mt-3 font-bold">Telegram Alerts</h2>
                    <p className="text-subhead text-label-2 mt-1">
                        Get new texts in Telegram and reply from the bot — even when this
                        app is closed.
                    </p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : error && !status ? (
                    <ContentUnavailable
                        className="pt-4"
                        icon={<WifiOff />}
                        title="Can't Load Telegram"
                        description="Check your connection."
                        actions={
                            <Button variant="gray" onClick={retry}>
                                Try Again
                            </Button>
                        }
                    />
                ) : (
                    <List>
                        <Section
                            footer={
                                !configured
                                    ? "Add TELEGRAM_BOT_TOKEN to the server environment to use Telegram."
                                    : !enabled
                                      ? "The bot needs a webhook secret (or polling mode) on the server before alerts can be sent."
                                      : undefined
                            }
                        >
                            <Row
                                title="Forward New Messages"
                                accessory={
                                    busy === "toggle" ? (
                                        <Spinner size={18} />
                                    ) : (
                                        <Switch
                                            label="Forward New Messages"
                                            checked={alerts && configured}
                                            disabled={!configured || Boolean(busy)}
                                            onChange={(next) =>
                                                run("toggle", async () => {
                                                    await telegramSetAlerts(
                                                        session.pairToken,
                                                        next
                                                    );
                                                    await load();
                                                })
                                            }
                                        />
                                    )
                                }
                            />
                        </Section>

                        <Section header="Status">
                            <Row
                                title="Bot"
                                value={
                                    status?.botUsername
                                        ? `@${status.botUsername}`
                                        : configured
                                          ? "Unnamed"
                                          : "Not Set Up"
                                }
                            />
                            <Row
                                title="Mode"
                                value={status?.mode === "polling" ? "Polling" : "Webhook"}
                            />
                            {status?.mode !== "polling" ? (
                                <Row
                                    title="Webhook"
                                    value={
                                        status?.webhookConfigured ? "Ready" : "Not Set"
                                    }
                                />
                            ) : null}
                            <Row
                                title="Linked Chats"
                                value={
                                    subs.length
                                        ? `${active} of ${subs.length} active`
                                        : status?.legacyAllowedChatIds
                                          ? pluralize(
                                                status.legacyAllowedChatIds,
                                                "env chat"
                                            )
                                          : "None"
                                }
                            />
                        </Section>

                        {subs.length ? (
                            <Section header="Linked Chats">
                                {subs.map((s) => (
                                    <Row
                                        key={s.chatId}
                                        title={s.label}
                                        subtitle={
                                            s.username
                                                ? `@${s.username} · ${formatRelative(s.updatedAt)}`
                                                : formatRelative(s.updatedAt)
                                        }
                                        value={
                                            <span
                                                className={
                                                    s.enabled
                                                        ? "text-green"
                                                        : "text-label-2"
                                                }
                                            >
                                                {s.enabled ? "Active" : "Paused"}
                                            </span>
                                        }
                                    />
                                ))}
                            </Section>
                        ) : null}

                        {liveLink ? (
                            <Section
                                header="Link a Chat"
                                footer={
                                    liveLink.botDeepLink
                                        ? "Tap Start in the bot to link this chat."
                                        : undefined
                                }
                            >
                                <div className="flex flex-col items-center px-4 pt-4 pb-4 text-center">
                                    <span className="font-mono text-[2.25rem] leading-none font-semibold tracking-[0.18em] select-text [-webkit-touch-callout:default]">
                                        {liveLink.code}
                                    </span>
                                    <p className="text-subhead text-label-2 mt-3">
                                        Send{" "}
                                        <span className="text-label font-mono font-semibold select-text [-webkit-touch-callout:default]">
                                            /link {liveLink.code}
                                        </span>{" "}
                                        to the bot within{" "}
                                        {formatCountdown(liveLink.expiresAt - now)}.
                                    </p>
                                    <Button
                                        variant="tinted"
                                        size="sm"
                                        className="mt-3"
                                        icon={<Copy className="size-4" />}
                                        aria-label={`Copy /link ${liveLink.code}`}
                                        onClick={() => copyLinkCommand(liveLink.code)}
                                    >
                                        Copy
                                    </Button>
                                    {liveLink.botDeepLink ? (
                                        <a
                                            href={liveLink.botDeepLink}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="tap text-body mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2aabee] px-5 font-semibold text-white active:brightness-90"
                                        >
                                            <Send
                                                className="size-[18px]"
                                                fill="currentColor"
                                            />
                                            Open in Telegram
                                        </a>
                                    ) : null}
                                </div>
                            </Section>
                        ) : null}

                        <Section footer="Set up the webhook once after deploying. Send a test to check every linked chat receives alerts.">
                            <Row
                                title={
                                    liveLink ? "New Link Code" : "Link a Telegram Chat"
                                }
                                tone="tint"
                                disabled={!configured || Boolean(busy)}
                                accessory={
                                    busy === "link" ? <Spinner size={18} /> : undefined
                                }
                                onClick={() =>
                                    run("link", async () => {
                                        const r = await telegramCreateLinkCode(
                                            session.pairToken
                                        );
                                        setNow(Date.now());
                                        setLink({
                                            code: r.code,
                                            expiresAt: r.expiresAt,
                                            botDeepLink: r.botDeepLink,
                                        });
                                    })
                                }
                            />
                            <Row
                                title="Set Up Webhook"
                                tone="tint"
                                disabled={!configured || Boolean(busy)}
                                accessory={
                                    busy === "webhook" ? <Spinner size={18} /> : undefined
                                }
                                onClick={() =>
                                    run("webhook", async () => {
                                        const r = await telegramSetupWebhook(
                                            session.pairToken
                                        );
                                        await load();
                                        toast({
                                            title: "Webhook Ready",
                                            body: r.botUsername
                                                ? `@${r.botUsername}`
                                                : undefined,
                                            tone: "success",
                                        });
                                    })
                                }
                            />
                            <Row
                                title="Send Test Message"
                                tone="tint"
                                disabled={!enabled || !alerts || Boolean(busy)}
                                accessory={
                                    busy === "test" ? <Spinner size={18} /> : undefined
                                }
                                onClick={() =>
                                    run("test", async () => {
                                        const r = await telegramTest(session.pairToken);
                                        const reached =
                                            r.results?.filter((x) => x.ok).length ?? 0;
                                        toast({
                                            title: "Test Sent",
                                            body: `Reached ${pluralize(reached, "chat")}.`,
                                            tone: reached ? "success" : "error",
                                        });
                                    })
                                }
                            />
                        </Section>
                    </List>
                )}
            </SheetBody>
        </>
    );
}
