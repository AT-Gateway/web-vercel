"use client";

import React, { useState } from "react";
import MobileNumberInput from "@/components/MobileNumberInput";
import { cn } from "@/lib/utils";
import { CgClose } from "react-icons/cg";
import { DrawerClose } from "@/components/ui/drawer";
import { LuSquarePen } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { threadIdForPeer } from "@/lib/phone";

export default function StartChat() {
    const router = useRouter();
    const [phone, setPhone] = useState<string>("");

    const handelStartChat = () => {
        const sendTo = phone.trim();
        if (!sendTo) return;

        const tid = threadIdForPeer(sendTo);
        router.replace(`/?tid=${tid}&peer=${encodeURIComponent(sendTo)}`);
    };

    return (
        <div className="mb-8 flex w-full flex-col items-start gap-4">
            <div className="flex w-full items-center justify-between">
                <span className="text-xl font-bold"> New Chat </span>

                <DrawerClose>
                    <span
                        className={cn(
                            "flex h-8 w-8 min-w-8 cursor-pointer items-center justify-center",
                            "rounded-full border border-gray-400/40 bg-[#1e1e1e]/60 font-bold text-white",
                            "backdrop-blur-3xl transition-all duration-150 hover:scale-[1.05] hover:bg-black/40"
                        )}
                    >
                        <CgClose className="text-xl" />
                    </span>
                </DrawerClose>
            </div>
            <span className="text-base text-white/75">
                {" "}
                Insert the Number to Start Conversation{" "}
            </span>

            <MobileNumberInput
                value={phone}
                onChange={setPhone}
                defaultCountryIso2="IR"
                onValue={(v) => console.log(v)}
            />

            <span className="text-base text-white/75">
                You can insert any number to start conversation with any number that does
                not exist in your contacts list
            </span>

            <DrawerClose asChild>
                <button
                    type="button"
                    id="startChat"
                    disabled={!phone}
                    onClick={handelStartChat}
                    className="mx-auto flex cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 bg-[#0b0f14] px-8 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
                >
                    Start Conversation
                    <LuSquarePen />
                </button>
            </DrawerClose>
        </div>
    );
}
