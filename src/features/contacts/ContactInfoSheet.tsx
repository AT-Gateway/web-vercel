"use client";

import React, { useEffect, useRef, useState } from "react";
import { Copy, Hand, Pencil, UserPlus } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "@/components/ios/Sheet";
import { Avatar } from "@/components/ios/Avatar";
import { Button } from "@/components/ios/Button";
import { List, Row, Section } from "@/components/ios/List";
import { useConfirm } from "@/components/ios/ConfirmDialog";
import { Spinner } from "@/components/ios/Spinner";
import { useToast } from "@/components/ios/Toast";
import { useApp } from "@/features/app/AppProvider";
import { ContactForm } from "@/features/contacts/ContactForm";

function QuickAction({
    icon,
    label,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="tap bg-cell text-tint active:bg-cell-pressed flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-[16px] transition-colors"
        >
            <span aria-hidden className="[&_svg]:size-[20px]">
                {icon}
            </span>
            <span className="text-caption-1 font-medium">{label}</span>
        </button>
    );
}

export function ContactInfoSheet({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
}) {
    const {
        activeThreadId,
        activePeer,
        activeName,
        activeBlocked,
        blockThread,
        unblockThread,
        deleteThread,
        saveContact,
        pendingBlock,
    } = useApp();
    const toast = useToast();
    const [confirmNode, confirm, cancelConfirm] = useConfirm();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    const [number, setNumber] = useState("");
    const [saving, setSaving] = useState(false);

    // The thread the sheet is about right now, for checks after an await.
    const tidRef = useRef(activeThreadId);
    tidRef.current = activeThreadId;

    // A confirm must never outlive the sheet or the conversation it was asked about.
    useEffect(() => {
        if (!open) cancelConfirm();
    }, [open, cancelConfirm]);
    useEffect(() => cancelConfirm(), [activeThreadId, cancelConfirm]);

    // The draft survives closing and reopening the sheet (a swipe-down mid-edit
    // keeps the form); only a different conversation discards it.
    const lastTid = useRef(activeThreadId);
    useEffect(() => {
        if (lastTid.current === activeThreadId) return;
        lastTid.current = activeThreadId;
        setEditing(false);
    }, [activeThreadId]);

    const startEditing = () => {
        setName(activeName ?? "");
        setNumber(activePeer);
        setEditing(true);
    };

    const title = activeName || activePeer;
    const valid = name.trim().length > 0 && number.trim().length > 0;
    const dirty = editing && (name !== (activeName ?? "") || number !== activePeer);
    const blockPending = Boolean(activeThreadId && pendingBlock.has(activeThreadId));

    const discardOpen = useRef(false);
    const cancelEditing = async () => {
        if (dirty) {
            discardOpen.current = true;
            const ok = await confirm({
                title: "Discard Changes?",
                confirmLabel: "Discard Changes",
            });
            discardOpen.current = false;
            if (!ok) return;
        }
        setEditing(false);
    };

    // Android Back while editing. If "Discard Changes?" is already up, Back means
    // "keep editing": dismiss it instead of asking again. (CloseWatchers created
    // without a fresh gesture share a group, so one Back can reach both the
    // confirm's watcher and this sheet's.)
    const onEditBack = () => {
        if (discardOpen.current) cancelConfirm();
        else void cancelEditing();
    };

    const save = async () => {
        if (!valid || saving) return;
        setSaving(true);
        const saved = await saveContact(name.trim(), number.trim());
        setSaving(false);
        if (saved) setEditing(false);
    };

    const copyNumber = async () => {
        try {
            await navigator.clipboard.writeText(activePeer);
            toast({ title: "Number Copied", tone: "success" });
        } catch {
            toast({ title: "Couldn't Copy", tone: "error" });
        }
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            detent="large"
            description={`Contact details for ${title}`}
            // Android Back leaves the editor like Cancel does.
            onBack={editing ? onEditBack : undefined}
        >
            {editing ? (
                <>
                    <SheetHeader
                        title={activeName ? "Edit Contact" : "New Contact"}
                        leading={
                            <Button
                                variant="plain"
                                size="bar"
                                className="-ml-2"
                                onClick={() => void cancelEditing()}
                            >
                                Cancel
                            </Button>
                        }
                        trailing={
                            <Button
                                variant="prominent"
                                size="bar"
                                disabled={!valid}
                                loading={saving}
                                onClick={save}
                            >
                                Done
                            </Button>
                        }
                    />
                    <SheetBody className="pt-4">
                        <div className="mb-6 flex justify-center">
                            <Avatar name={name || null} size={88} />
                        </div>
                        <ContactForm
                            name={name}
                            number={number}
                            onName={setName}
                            onNumber={setNumber}
                            onSubmit={save}
                            lockNumber
                        />
                    </SheetBody>
                </>
            ) : (
                <>
                    <SheetHeader
                        title={<span className="sr-only">{title}</span>}
                        trailing={
                            <Button
                                variant="glass"
                                tone="label"
                                size="bar"
                                onClick={() => onOpenChange(false)}
                            >
                                Done
                            </Button>
                        }
                    />
                    <SheetBody>
                        <div className="flex flex-col items-center px-6 pb-6 text-center">
                            <Avatar name={activeName} size={96} />
                            <h2
                                className="text-title-1 mt-3 font-bold text-balance wrap-anywhere"
                                dir="auto"
                            >
                                {title}
                            </h2>
                            {activeName ? (
                                <p className="text-body text-label-2 mt-0.5">
                                    {activePeer}
                                </p>
                            ) : null}
                            {activeBlocked ? (
                                <span className="bg-red/12 text-footnote text-red mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold">
                                    <Hand className="size-3.5" strokeWidth={2.5} />{" "}
                                    Blocked
                                </span>
                            ) : null}
                        </div>

                        <div className="mb-[35px] flex gap-2 px-4">
                            <QuickAction
                                icon={<Copy />}
                                label="copy"
                                onClick={copyNumber}
                            />
                            <QuickAction
                                icon={activeName ? <Pencil /> : <UserPlus />}
                                label={activeName ? "edit" : "add"}
                                onClick={startEditing}
                            />
                        </div>

                        <List>
                            <Section>
                                <Row
                                    title={
                                        <span className="text-subhead text-label">
                                            mobile
                                        </span>
                                    }
                                    subtitle={
                                        <span className="text-body text-tint">
                                            {activePeer}
                                        </span>
                                    }
                                    onClick={copyNumber}
                                    ariaLabel={`Copy ${activePeer}`}
                                />
                            </Section>

                            <Section>
                                <Row
                                    title={
                                        activeName ? "Edit Contact" : "Add to Contacts"
                                    }
                                    tone="tint"
                                    onClick={startEditing}
                                />
                            </Section>

                            <Section
                                footer={
                                    activeBlocked
                                        ? "Messages from this number are discarded and never saved."
                                        : undefined
                                }
                            >
                                <Row
                                    title={
                                        activeBlocked
                                            ? "Unblock this Contact"
                                            : "Block this Contact"
                                    }
                                    tone={activeBlocked ? "tint" : "red"}
                                    disabled={blockPending}
                                    accessory={
                                        blockPending ? <Spinner size={18} /> : undefined
                                    }
                                    onClick={async () => {
                                        const tid = activeThreadId;
                                        const peer = activePeer;
                                        if (!tid) return;
                                        if (activeBlocked) {
                                            await unblockThread(tid);
                                            return;
                                        }
                                        const ok = await confirm({
                                            title: `Block ${title}?`,
                                            message:
                                                "New messages from this number won't be saved or forwarded.",
                                            confirmLabel: "Block Contact",
                                        });
                                        if (!ok || tidRef.current !== tid) return;
                                        await blockThread(tid, peer);
                                    }}
                                />
                                <Row
                                    title="Delete Conversation"
                                    tone="red"
                                    onClick={async () => {
                                        const tid = activeThreadId;
                                        if (!tid) return;
                                        const ok = await confirm({
                                            title: `Delete conversation with ${title}?`,
                                            message:
                                                "All messages with this contact will be permanently deleted.",
                                            confirmLabel: "Delete",
                                        });
                                        if (!ok || tidRef.current !== tid) return;
                                        onOpenChange(false);
                                        await deleteThread(tid);
                                    }}
                                />
                            </Section>
                        </List>
                    </SheetBody>
                </>
            )}
            {confirmNode}
        </Sheet>
    );
}
