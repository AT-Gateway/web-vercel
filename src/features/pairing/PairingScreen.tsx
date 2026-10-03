"use client";

import { useEffect, useRef, useState } from "react";
import { OTPInput, type SlotProps } from "input-otp";
import { health, pairComplete } from "@/lib/api";
import { getOrCreateDeviceId } from "@/lib/storage";
import { describeThisDevice } from "@/lib/device";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/ios/AppIcon";
import { Button } from "@/components/ios/Button";
import { useApp } from "@/features/app/AppProvider";
import { useToast } from "@/components/ios/Toast";

const CODE_LENGTH = 6;

function normalizeDemoCode(raw: string | undefined | null): string {
    return (raw || "000000")
        .replace(/\D+/g, "")
        .slice(0, CODE_LENGTH)
        .padEnd(CODE_LENGTH, "0");
}

function Slot({
    char,
    hasFakeCaret,
    isActive,
    invalid,
}: SlotProps & { invalid: boolean }) {
    return (
        <div
            className={cn(
                "bg-fill-3 text-title-1 relative flex h-[58px] max-w-[48px] min-w-0 flex-1 items-center justify-center rounded-[14px] font-semibold tabular-nums",
                "transition-[box-shadow,background-color] duration-200",
                isActive && "bg-cell shadow-[0_0_0_2px_var(--sys-blue)]",
                invalid && "shadow-[0_0_0_2px_var(--sys-red)]"
            )}
        >
            {char}
            {hasFakeCaret ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="animate-caret-blink bg-tint h-7 w-[2px] rounded-full" />
                </span>
            ) : null}
        </div>
    );
}

export function PairingScreen() {
    const { signIn } = useApp();
    const toast = useToast();
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState<"code" | "demo" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [shake, setShake] = useState(0);
    const [demo, setDemo] = useState<{ enabled: boolean; code: string }>({
        enabled: true,
        code: normalizeDemoCode(process.env.NEXT_PUBLIC_DEMO_MODE_CODE),
    });
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        health()
            .then((h) =>
                setDemo({
                    enabled: h.demoModeEnabled !== false,
                    code: normalizeDemoCode(
                        h.demoCode ?? process.env.NEXT_PUBLIC_DEMO_MODE_CODE
                    ),
                })
            )
            .catch(() => {});
    }, []);

    const pair = async (value: string, kind: "code" | "demo") => {
        const c = value.trim();
        if (c.length !== CODE_LENGTH || loading) return;
        setLoading(kind);
        setError(null);
        try {
            const res = await pairComplete({
                code: c,
                pwaDeviceId: getOrCreateDeviceId(),
                pwaPubSpkiB64: "AA==",
                deviceLabel: describeThisDevice(),
            });
            signIn({
                pairToken: res.pairToken,
                pairingId: res.pairingId,
                gatewayDeviceId: res.gatewayDeviceId,
                gatewayPubSpkiB64: res.gatewayPubSpkiB64,
                demo: Boolean(res.demo),
            });
            if (res.demo) {
                toast({
                    title: "Demo Mode",
                    body: "Exploring with sample conversations.",
                });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Something went wrong.";
            setError(
                /invalid|expired|not found/i.test(msg)
                    ? "That code is invalid or has expired."
                    : msg
            );
            setShake((n) => n + 1);
            setCode("");
            inputRef.current?.focus();
        } finally {
            setLoading(null);
        }
    };

    return (
        <main className="bg-grouped pt-safe pb-safe flex h-dvh flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pt-[max(48px,8vh)] pb-6">
                <div className="flex flex-col items-center text-center">
                    <AppIcon size={88} />
                    <h1 className="text-title-1 mt-6 font-bold">Connect Your Gateway</h1>
                    <p className="text-body text-label-2 mt-2">
                        Enter the 6-digit invite code from the SMS Gateway app on your
                        Android phone.
                    </p>
                </div>

                <form
                    className="mt-9 flex flex-col items-center"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void pair(code, "code");
                    }}
                >
                    <div
                        key={shake}
                        className={cn("w-full", shake > 0 && "animate-shake")}
                    >
                        <OTPInput
                            ref={inputRef}
                            autoFocus
                            maxLength={CODE_LENGTH}
                            value={code}
                            onChange={(v) => {
                                setCode(v.replace(/\D+/g, ""));
                                if (error) setError(null);
                            }}
                            onComplete={(v: string) => void pair(v, "code")}
                            inputMode="numeric"
                            pattern="^[0-9]*$"
                            autoComplete="one-time-code"
                            aria-label="Invite code"
                            aria-invalid={Boolean(error)}
                            aria-describedby="pair-status"
                            disabled={Boolean(loading)}
                            containerClassName="flex w-full items-center justify-center gap-[clamp(4px,1.6vw,8px)] has-[:disabled]:opacity-60"
                            render={({ slots }) => (
                                <>
                                    {slots.slice(0, 3).map((s, i) => (
                                        <Slot key={i} {...s} invalid={Boolean(error)} />
                                    ))}
                                    <span
                                        aria-hidden
                                        className="bg-label-3 mx-0.5 h-[3px] w-2.5 shrink-0 rounded-full"
                                    />
                                    {slots.slice(3).map((s, i) => (
                                        <Slot
                                            key={i + 3}
                                            {...s}
                                            invalid={Boolean(error)}
                                        />
                                    ))}
                                </>
                            )}
                        />
                    </div>

                    <p
                        id="pair-status"
                        role={error ? "alert" : undefined}
                        className={cn(
                            "text-footnote mt-3 min-h-[18px]",
                            error ? "text-red" : "text-label-2"
                        )}
                    >
                        {error ?? (loading === "code" ? "Connecting…" : "")}
                    </p>

                    <div className="mt-4 w-full">
                        <Button
                            type="submit"
                            size="lg"
                            loading={loading === "code"}
                            disabled={code.length !== CODE_LENGTH || loading === "demo"}
                        >
                            Continue
                        </Button>
                    </div>
                </form>

                <section
                    aria-label="How to get a code"
                    className="bg-cell mt-9 overflow-hidden rounded-[22px]"
                >
                    {[
                        "Open SMS Gateway on your Android phone.",
                        "Tap Invite to generate a 6-digit code.",
                        "Enter it here. Codes expire after 10 minutes.",
                    ].map((text, i) => (
                        <div key={i} className="flex items-start gap-3 pl-4">
                            <span className="bg-tint text-caption-1 mt-[11px] flex size-[22px] shrink-0 items-center justify-center rounded-full font-bold text-white">
                                {i + 1}
                            </span>
                            <span
                                className={cn(
                                    "text-subhead text-label flex-1 py-[11px] pr-4",
                                    i < 2 && "hairline-b"
                                )}
                            >
                                {text}
                            </span>
                        </div>
                    ))}
                </section>

                <div className="flex-1" />

                {demo.enabled ? (
                    <div className="mt-8 flex flex-col items-center gap-1 text-center">
                        <span className="text-footnote text-label-2">
                            Just looking around?
                        </span>
                        <Button
                            variant="plain"
                            size="md"
                            loading={loading === "demo"}
                            disabled={loading === "code"}
                            onClick={() => {
                                setCode(demo.code);
                                void pair(demo.code, "demo");
                            }}
                        >
                            Try the Demo
                        </Button>
                    </div>
                ) : null}
            </div>
        </main>
    );
}
