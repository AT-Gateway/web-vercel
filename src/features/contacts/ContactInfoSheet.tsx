"use client";

import React, { useEffect, useState } from "react";
import { Copy, Hand, Pencil, UserPlus } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "@/components/ios/Sheet";
import { Avatar } from "@/components/ios/Avatar";
import { Button } from "@/components/ios/Button";
import { List, Row, Section } from "@/components/ios/List";
import { useConfirm } from "@/components/ios/ConfirmDialog";
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
    } = useApp();
    const toast = useToast();
    const [confirmNode, confirm] = useConfirm();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState("");
    const [number, setNumber] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setEditing(false);
        setName(activeName ?? "");
        setNumber(activePeer);
    }, [open, activeName, activePeer]);

    const title = activeName || activePeer;
    const valid = name.trim().length > 0 && number.trim().length > 0;

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
        >
            {editing ? (
                <>
                    <SheetHeader
                        title={activeName ? "Edit Contact" : "New Contact"}
                        leading={
                            <Button
                                variant="plain"
                                size="sm"
                                className="-ml-2"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </Button>
                        }
                        trailing={
                            <Button
                                variant="prominent"
                                size="sm"
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
                                size="sm"
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
                                className="text-title-1 mt-3 font-bold break-all"
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
                                onClick={() => setEditing(true)}
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
                                    onClick={() => setEditing(true)}
                                />
                            </Section>

                            <Section
                                footer={
                                    activeBlocked
                                        ? "Messages from this number are discarded before they reach the gateway database."
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
                                    onClick={async () => {
                                        if (!activeThreadId) return;
                                        if (activeBlocked) {
                                            await unblockThread(activeThreadId);
                                            return;
                                        }
                                        const ok = await confirm({
                                            title: `Block ${title}?`,
                                            message:
                                                "New messages from this number won't be saved or forwarded.",
                                            confirmLabel: "Block Contact",
                                        });
                                        if (ok)
                                            await blockThread(activeThreadId, activePeer);
                                    }}
                                />
                                <Row
                                    title="Delete Conversation"
                                    tone="red"
                                    onClick={async () => {
                                        if (!activeThreadId) return;
                                        const ok = await confirm({
                                            title: "Delete this conversation?",
                                            message:
                                                "All messages with this contact will be permanently deleted.",
                                            confirmLabel: "Delete",
                                        });
                                        if (!ok) return;
                                        onOpenChange(false);
                                        await deleteThread(activeThreadId);
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
