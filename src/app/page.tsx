import { Suspense } from "react";
import { ToastProvider } from "@/components/ios/Toast";
import { AppProvider } from "@/features/app/AppProvider";
import { AppShell } from "@/features/app/AppShell";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ToastProvider>
                <AppProvider>
                    <AppShell />
                </AppProvider>
            </ToastProvider>
        </Suspense>
    );
}
