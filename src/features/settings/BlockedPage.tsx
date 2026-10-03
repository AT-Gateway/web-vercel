"use client";

import { useEffect } from "react";
import { Hand, Trash2 } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { SheetBody } from "@/components/ios/Sheet";
import { Avatar } from "@/components/ios/Avatar";
import { Button } from "@/components/ios/Button";
import { SwipeRow } from "@/components/ios/SwipeRow";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useApp } from "@/features/app/AppProvider";
import { PageHeader } from "@/features/settings/SettingsNav";

export function BlockedPage() {
    const { blockedChats, refreshBlocked, unblockThread, deleteThread } = useApp();
    const [confirmNode, confirm] = useConfirm();

    useEffect(() => {
        refreshBlocked();
    }, [refreshBlocked]);

    const askDelete = async (threadId: string, label: string) => {
        const ok = await confirm({
            title: `Delete messages with ${label}?`,
            message:
                "The conversation history is permanently deleted. The number stays blocked.",
            confirmLabel: "Delete Messages",
        });
        if (ok) await deleteThread(threadId);
    };

    return (
        <>
            <PageHeader title="Blocked Contacts" />
            <SheetBody className="pt-2">
                {blockedChats.length === 0 ? (
                    <ContentUnavailable
                        className="pt-16"
                        icon={<Hand />}
                        title="No Blocked Contacts"
                        description="Block a conversation from its contact details to stop saving its messages."
                    />
                ) : (
                    <div className="px-4 pb-8">
                        <ul className="bg-cell overflow-hidden rounded-[22px]">
                            {blockedChats.map((b) => {
                                const label = b.peerName || b.peer;
                                return (
                                    <li key={b.threadId} className="group/row">
                                        <SwipeRow
                                            className="bg-cell"
                                            trailing={[
                                                {
                                                    label: "Delete",
                                                    icon: <Trash2 />,
                                                    tone: "red",
                                                    onAction: () =>
                                                        askDelete(b.threadId, label),
                                                },
                                            ]}
                                        >
                                            <div className="flex items-center gap-3 pl-4">
                                                <Avatar
                                                    name={b.peerName}
                                                    size={36}
                                                    className="my-2"
                                                />
                                                <div className="border-separator flex min-w-0 flex-1 items-center gap-2 border-b-[0.5px] py-2 pr-3 group-last/row:border-b-0">
                                                    <div className="flex min-w-0 flex-1 flex-col">
                                                        <span
                                                            className="text-body truncate"
                                                            dir="auto"
                                                        >
                                                            {label}
                                                        </span>
                                                        <span className="text-footnote text-label-2 truncate">
                                                            {b.peerName
                                                                ? `${b.peer} · `
                                                                : ""}
                                                            Blocked{" "}
                                                            {formatRelative(
                                                                b.blockedAt
                                                            ).toLowerCase()}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="gray"
                                                        size="sm"
                                                        onClick={() =>
                                                            unblockThread(b.threadId)
                                                        }
                                                    >
                                                        Unblock
                                                    </Button>
                                                </div>
                                            </div>
                                        </SwipeRow>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="text-footnote text-label-2 mt-2 px-4">
                            Messages from blocked numbers are discarded before
                            they&apos;re saved, forwarded to Telegram, or pushed to your
                            devices. Swipe left to delete old messages.
                        </p>
                    </div>
                )}
            </SheetBody>
            {confirmNode}
        </>
    );
}
