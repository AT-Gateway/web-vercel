import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            boxShadow: {
                // OUTER (modern, layered, soft)
                "soft-sm": "0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04)",
                soft: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
                "soft-lg": "0 18px 48px rgba(0,0,0,0.16), 0 6px 18px rgba(0,0,0,0.08)",

                // INNER (modern inset depth + gentle highlight)
                "inner-sm":
                    "inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 2px rgba(0,0,0,0.12)",
                inner: "inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -2px 12px rgba(0,0,0,0.26)",
                "inner-lg":
                    "inset 0 2px 2px rgba(255,255,255,0.50), inset 0 -4px 12px rgba(0,0,0,0.20)",

                // OPTIONAL: “pressed” feel (great for buttons/inputs)
                pressed:
                    "inset 0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.45)",

                // OPTIONAL: subtle outline shadow (great for inputs on white)
                outline: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.08)",
            },

            fontSize: {
                xs: "10px",
                sm: "12px",
                base: "14px",
                lg: "16px",
                xl: "18px",
                "2xl": "22px",
                "3xl": "26px",
                "4xl": "30px",
                "5xl": "34px",
            },
        },
        container: {
            center: true,
            padding: {
                DEFAULT: "1rem",
                sm: "1rem",
                md: "1.5rem",
                lg: "1.5rem",
                xl: "1.5rem",
            },
        },
    },
    plugins: [],
};

export default config;
