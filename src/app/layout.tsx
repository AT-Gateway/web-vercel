import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
    title: "SMS Gateway",
    description: "SMS gateway PWA",
    applicationName: "SMS Gateway",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "SMS Gateway",
    },
};

export const viewport: Viewport = {
    themeColor: "#0b0f14",
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="manifest" href="/manifest.webmanifest" />
                <link rel="icon" href="/atg-icon.ico" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta
                    key="viewport"
                    name="viewport"
                    content="width=device-width, initial-scale=1, minimum-scale=1.0, maximum-scale=5.0, viewport-fit=cover, user-scalable=0, shrink-to-fit=no"
                />
                <title> SMS Gateway </title>
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="apple-mobile-web-app-title" content="GoToSafar" />
            </head>
            <body>
                <ServiceWorkerRegister />
                {children}
            </body>
        </html>
    );
}
