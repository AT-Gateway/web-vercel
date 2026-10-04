"use client";

import { useEffect } from "react";
import { Hand, Trash2 } from "lucide-react";
import type { BlockedChat } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { SheetBody } from "@/components/ios/Sheet";
import { Avatar } from "@/components/ios/Avatar";
import { Button } from "@/components/ios/Button";
import { SwipeRow } from "@/components/ios/SwipeRow";
import { useContextMenu } from "@/components/ios/Menu";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { useApp } from "@/features/app/AppProvider";
import { PageHeader } from "@/features/settings/SettingsNav";

export function BlockedPage() {
    const { blockedChats, refreshBlocked, unblockThread, deleteThread, pendingBlock } =
        useApp();
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
                            {blockedChats.map((b) => (
                                <BlockedRow
                                    key={b.threadId}
                                    chat={b}
                                    pending={pendingBlock.has(b.threadId)}
                                    onUnblock={() => unblockThread(b.threadId)}
                                    onDelete={() =>
                                        askDelete(b.threadId, b.peerName || b.peer)
                                    }
                                />
                            ))}
                        </ul>
                        <p className="text-footnote text-label-2 mt-2 px-4">
                            Messages from blocked numbers are discarded before
                            they&apos;re saved, forwarded to Telegram, or pushed to your
                            devices. Tap a contact or swipe left to delete old messages.
                        </p>
                    </div>
                )}
            </SheetBody>
            {confirmNode}
        </>
    );
}

function BlockedRow({
    chat: b,
    pending,
    onUnblock,
    onDelete,
}: {
    chat: BlockedChat;
    pending: boolean;
    onUnblock: () => void;
    onDelete: () => void;
}) {
    const label = b.peerName || b.peer;
    const blockedWhen = `Blocked ${formatRelative(b.blockedAt).toLowerCase()}`;

    // Tap, long-press or right-click: the same actions as the swipe, reachable
    // without the gesture (keyboard, switch control, screen readers).
    const menu = useContextMenu({
        label: `Actions for ${label}`,
        title: (
            <bdi className="block truncate" dir="auto">
                {label}
            </bdi>
        ),
        sections: [
            [
                {
                    label: "Unblock",
                    icon: <Hand />,
                    onSelect: onUnblock,
                    disabled: pending,
                },
            ],
            [
                {
                    label: "Delete Messages",
                    icon: <Trash2 />,
                    keyAction: true,
                    destructive: true,
                    onSelect: onDelete,
                },
            ],
        ],
    });

    return (
        <li className="group/row">
            <SwipeRow
                className="bg-cell"
                trailing={[
                    {
                        label: "Delete",
                        icon: <Trash2 />,
                        tone: "red",
                        onAction: onDelete,
                    },
                ]}
            >
                <div
                    {...menu.triggerProps}
                    className="flex items-stretch pl-4 [-webkit-touch-callout:none]"
                >
                    <button
                        type="button"
                        onClick={() => menu.open()}
                        aria-haspopup="menu"
                        aria-label={`${label}, ${blockedWhen}`}
                        className="tap flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                        <Avatar name={b.peerName} size={36} className="my-2" />
                        <span className="border-separator flex min-w-0 flex-1 flex-col justify-center self-stretch border-b-[0.5px] py-2 group-last/row:border-b-0">
                            <span className="text-body truncate" dir="auto">
                                {label}
                            </span>
                            <span className="text-footnote text-label-2 truncate">
                                {b.peerName ? `${b.peer} · ` : ""}
                                {blockedWhen}
                            </span>
                        </span>
                    </button>
                    <span className="border-separator flex shrink-0 items-center border-b-[0.5px] pr-3 pl-2 group-last/row:border-b-0">
                        <Button
                            variant="gray"
                            size="sm"
                            loading={pending}
                            onClick={onUnblock}
                        >
                            Unblock
                        </Button>
                    </span>
                </div>
            </SwipeRow>
            {menu.node}
        </li>
    );
}
