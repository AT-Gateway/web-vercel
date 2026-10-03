"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Send, Smartphone } from "lucide-react";
import { type Device, listDevices, revokeDevice } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getOrCreateDeviceId } from "@/lib/storage";
import { SheetBody } from "@/components/ios/Sheet";
import { Button } from "@/components/ios/Button";
import { IconTile } from "@/components/ios/List";
import { Spinner } from "@/components/ios/Spinner";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useToast } from "@/components/ios/Toast";
import { useApp } from "@/features/app/AppProvider";
import { PageHeader } from "@/features/settings/SettingsNav";

function DeviceIcon({ type }: { type: string }) {
    if (type === "telegram")
        return (
            <IconTile className="bg-[#2aabee]">
                <Send fill="currentColor" />
            </IconTile>
        );
    if (type === "android")
        return (
            <IconTile className="bg-green">
                <Smartphone />
            </IconTile>
        );
    return (
        <IconTile className="bg-blue">
            <Globe />
        </IconTile>
    );
}

export function DevicesPage() {
    const { session } = useApp();
    const toast = useToast();
    const [confirmNode, confirm] = useConfirm();
    const [devices, setDevices] = useState<Device[] | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const thisDevice = getOrCreateDeviceId();

    const load = useCallback(async () => {
        if (!session) return;
        try {
            const r = await listDevices(session.pairToken);
            setDevices(r.devices ?? []);
        } catch {
            setDevices([]);
        }
    }, [session]);

    useEffect(() => {
        load();
    }, [load]);

    if (!session) return null;

    const sorted = (devices ?? []).slice().sort((a, b) => {
        if (a.deviceId === thisDevice) return -1;
        if (b.deviceId === thisDevice) return 1;
        return (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt);
    });

    const remove = async (d: Device) => {
        const ok = await confirm({
            title: `Remove ${d.deviceLabel || d.deviceType}?`,
            message:
                "It will be signed out immediately and need a new invite code to reconnect.",
            confirmLabel: "Remove Device",
        });
        if (!ok) return;
        setRemoving(d.deviceId);
        try {
            await revokeDevice(session.pairToken, d.deviceId);
            await load();
            toast({ title: "Device Removed", tone: "success" });
        } catch (e) {
            toast({
                title: "Couldn't Remove Device",
                body: e instanceof Error ? e.message : undefined,
                tone: "error",
            });
        } finally {
            setRemoving(null);
        }
    };

    return (
        <>
            <PageHeader title="Devices" />
            <SheetBody className="pt-2">
                {devices === null ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : (
                    <div className="px-4 pb-8">
                        <h3 className="text-footnote text-label-2 mb-[7px] px-4 uppercase">
                            Signed in with this gateway
                        </h3>
                        <ul className="bg-cell overflow-hidden rounded-[22px]">
                            {sorted.map((d) => {
                                const mine = d.deviceId === thisDevice;
                                return (
                                    <li
                                        key={d.deviceId}
                                        className="group/row flex items-center gap-3 pl-4"
                                    >
                                        <DeviceIcon type={d.deviceType} />
                                        <div className="border-separator flex min-w-0 flex-1 items-center gap-2 border-b-[0.5px] py-2.5 pr-3 group-last/row:border-b-0">
                                            <div className="flex min-w-0 flex-1 flex-col">
                                                <span className="text-body truncate">
                                                    {d.deviceLabel || d.deviceType}
                                                </span>
                                                <span
                                                    className="text-footnote text-label-2 truncate"
                                                    title={`Paired ${formatDateTime(d.createdAt)}`}
                                                >
                                                    {mine
                                                        ? "This browser"
                                                        : `Active ${formatRelative(d.lastSeenAt ?? d.createdAt).toLowerCase()}`}
                                                </span>
                                            </div>
                                            {mine ? null : (
                                                <Button
                                                    variant="plain"
                                                    tone="red"
                                                    size="sm"
                                                    loading={removing === d.deviceId}
                                                    onClick={() => remove(d)}
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="text-footnote text-label-2 mt-2 px-4">
                            Remove any browser or Telegram chat you no longer use or
                            trust.
                        </p>
                    </div>
                )}
            </SheetBody>
            {confirmNode}
        </>
    );
}
