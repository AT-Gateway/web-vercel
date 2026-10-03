"use client";

/** Inset-grouped text fields for a contact's name and number. */
export function ContactForm({
    name,
    number,
    onName,
    onNumber,
    onSubmit,
    lockNumber,
}: {
    name: string;
    number: string;
    onName: (v: string) => void;
    onNumber: (v: string) => void;
    onSubmit: () => void;
    lockNumber?: boolean;
}) {
    return (
        <form
            className="px-4"
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <div className="bg-cell overflow-hidden rounded-[22px]">
                <label className="flex min-h-11 items-center pl-4">
                    <span className="sr-only">Name</span>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => onName(e.target.value)}
                        placeholder="Name"
                        autoComplete="name"
                        enterKeyHint="next"
                        dir="auto"
                        className="hairline-b text-body h-11 w-full bg-transparent pr-4 outline-none"
                    />
                </label>
                <label className="flex min-h-11 items-center gap-3 pl-4">
                    <span className="text-subhead text-tint w-16 shrink-0">mobile</span>
                    <span className="sr-only">Phone number</span>
                    <input
                        value={number}
                        onChange={(e) => onNumber(e.target.value)}
                        placeholder="Phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        enterKeyHint="done"
                        readOnly={lockNumber}
                        className="text-body read-only:text-label-2 h-11 w-full bg-transparent pr-4 outline-none"
                    />
                </label>
            </div>
            <button type="submit" hidden />
            <p className="text-footnote text-label-2 mt-2 px-4">
                Names you save here are stored on the gateway and take priority over names
                synced from the phone.
            </p>
        </form>
    );
}
