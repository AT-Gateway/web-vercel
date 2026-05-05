import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "SMS Gateway",
        short_name: "SMS Gateway",
        description: "SMS gateway PWA",
        start_url: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
            { src: "/atg-logo.png", sizes: "192x192", type: "image/png" },
            { src: "/atg-logo.png", sizes: "512x512", type: "image/png" },
        ],
    };
}
