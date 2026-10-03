"use client";

import { useEffect, useState } from "react";
import { Plus, UsersRound } from "lucide-react";
import { type Contact, listContacts } from "@/lib/api";
import { SheetBody } from "@/components/ios/Sheet";
import { Avatar } from "@/components/ios/Avatar";
import { Button, IconButton } from "@/components/ios/Button";
import { SearchField } from "@/components/ios/SearchField";
import { Spinner } from "@/components/ios/Spinner";
import { ContentUnavailable } from "@/components/ios/ContentUnavailable";
import { useApp } from "@/features/app/AppProvider";
import { PageHeader, useSettingsNav } from "@/features/settings/SettingsNav";
import { ContactForm } from "@/features/contacts/ContactForm";

export function ContactsPage() {
    const { session } = useApp();
    const nav = useSettingsNav();
    const [query, setQuery] = useState("");
    const [contacts, setContacts] = useState<Contact[] | null>(null);

    useEffect(() => {
        if (!session) return;
        let stale = false;
        const t = window.setTimeout(
            () => {
                listContacts(session.pairToken, query.trim(), 200)
                    .then((r) => !stale && setContacts(r.contacts ?? []))
                    .catch(() => !stale && setContacts([]));
            },
            query ? 220 : 0
        );
        return () => {
            stale = true;
            window.clearTimeout(t);
        };
    }, [session, query]);

    const sorted = (contacts ?? [])
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return (
        <>
            <PageHeader
                title="Contacts"
                trailing={
                    <IconButton
                        label="Add Contact"
                        icon={<Plus strokeWidth={2.2} />}
                        onClick={() => nav.push({ name: "contact-edit", contact: null })}
                    />
                }
            />
            <SearchField
                className="shrink-0 px-4 pb-3"
                value={query}
                onChange={setQuery}
                placeholder="Search Contacts"
            />
            <SheetBody>
                {contacts === null ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : sorted.length === 0 ? (
                    <ContentUnavailable
                        className="pt-12"
                        icon={<UsersRound />}
                        title={query ? "No Results" : "No Contacts"}
                        description={
                            query
                                ? "Try a different name or number."
                                : "Contacts sync from your Android phone. You can also add names here."
                        }
                        actions={
                            query ? null : (
                                <Button
                                    variant="tinted"
                                    onClick={() =>
                                        nav.push({ name: "contact-edit", contact: null })
                                    }
                                >
                                    Add Contact
                                </Button>
                            )
                        }
                    />
                ) : (
                    <div className="px-4 pb-8">
                        <ul className="bg-cell overflow-hidden rounded-[22px]">
                            {sorted.map((c) => (
                                <li key={c.norm} className="group/row">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            nav.push({ name: "contact-edit", contact: c })
                                        }
                                        className="tap active:bg-cell-pressed flex w-full items-center gap-3 pl-4 text-left"
                                    >
                                        <Avatar
                                            name={c.displayName}
                                            size={36}
                                            className="my-2"
                                        />
                                        <span className="border-separator flex min-w-0 flex-1 items-center gap-2 border-b-[0.5px] py-2.5 pr-4 group-last/row:border-b-0">
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span
                                                    className="text-body truncate"
                                                    dir="auto"
                                                >
                                                    {c.displayName}
                                                </span>
                                                <span className="text-footnote text-label-2 truncate">
                                                    {c.rawNumber || c.norm}
                                                </span>
                                            </span>
                                            <span className="text-caption-1 text-label-3 shrink-0">
                                                {c.source === "web"
                                                    ? "Saved here"
                                                    : "From phone"}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </SheetBody>
        </>
    );
}

export function ContactEditPage({ contact }: { contact: Contact | null }) {
    const { saveContact } = useApp();
    const nav = useSettingsNav();
    const [name, setName] = useState(contact?.displayName ?? "");
    const [number, setNumber] = useState(contact?.rawNumber || contact?.norm || "");
    const [saving, setSaving] = useState(false);
    const valid = name.trim().length > 0 && number.trim().length > 0;

    const save = async () => {
        if (!valid || saving) return;
        setSaving(true);
        const saved = await saveContact(name.trim(), number.trim());
        setSaving(false);
        if (saved) nav.pop();
    };

    return (
        <>
            <PageHeader
                title={contact ? "Edit Contact" : "New Contact"}
                trailing={
                    <Button size="sm" disabled={!valid} loading={saving} onClick={save}>
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
                    lockNumber={Boolean(contact)}
                />
            </SheetBody>
        </>
    );
}
