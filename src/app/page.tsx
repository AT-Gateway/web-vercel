import React, { Suspense } from "react";
import ClientView from "@/components/ClientView";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ClientView />
        </Suspense>
    );
}
