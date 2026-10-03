/**
 * Generates every app icon asset from one geometry source.
 *
 * Mark: a large message bubble with a send/receive pair of arrows (⇄) cut
 * out of its top-left corner — an SMS gateway in one glyph.
 *
 * Follows the iOS 26/27 app icon rules:
 * - 1024×1024, square, full-bleed and opaque; the system applies the rounded mask.
 * - Glyph kept inside the central safe area (it also fits the 80% maskable circle).
 * - Separate background / foreground layers for Icon Composer (Liquid Glass).
 * - Default (light), Dark and Tinted (grayscale) appearances.
 *
 * Run: yarn icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC_DIR = path.join(ROOT, "assets/icon");
const PUBLIC_DIR = path.join(ROOT, "public");

const S = 1024;
// iOS app icon corner radius ≈ 22.37% of the edge (used only for previews/favicons).
const R = Math.round(S * 0.2237);

// ---- Geometry (1024 grid) ----
// Bubble spans y 210–806; the tail tip stays inside the 80% maskable circle.
const BUBBLE = `
  <ellipse cx="512" cy="492" rx="360" ry="282"/>
  <path d="M290 690C290 760 264 790 232 806C310 812 384 794 432 766Z"/>`;

/*
 * Relay arrows (local grid), in the SF Symbols "arrow.left.arrow.right" style:
 * two short, offset shafts with open, round-capped chevron heads — send → and
 * receive ←.
 */
const ARROWS = `
  <g fill="none" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M80 40H200M170 10L202 40L170 70"/>
    <path d="M160 112H40M70 82L38 112L70 142"/>
  </g>`;
// Tucked into the bubble's top-left corner.
const ARROWS_TRANSFORM = "translate(250 326) scale(0.92)";

/** Mask: bubble in white, relay arrows punched out. */
const glyphMask = (id) => `
  <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">
    <rect width="${S}" height="${S}" fill="#000"/>
    <g fill="#fff">${BUBBLE}</g>
    <g fill="#000" stroke="#000" transform="${ARROWS_TRANSFORM}">${ARROWS}</g>
  </mask>`;

// ---- Appearances ----
const APPEARANCES = {
    light: {
        bg: ["#47A9FF", "#0A5FDB"],
        glyph: ["#FFFFFF", "#FFFFFF"],
        shadow: 0.16,
    },
    dark: {
        bg: ["#2C2C2E", "#0E0E10"],
        glyph: ["#62B4FF", "#0A6CF0"],
        shadow: 0.4,
    },
    // Tinted icons are grayscale; iOS colors them with the user's tint.
    tinted: {
        bg: ["#000000", "#000000"],
        glyph: ["#FFFFFF", "#C8C8C8"],
        shadow: 0,
    },
};

function background(a) {
    return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${a.bg[0]}"/>
      <stop offset="1" stop-color="${a.bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>`;
}

function foreground(a) {
    // The shadow is cast only outside the bubble, so the cut-out arrows show the
    // clean background instead of a darkened shadow.
    const shadow = a.shadow
        ? `
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <mask id="outside" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">
      <rect width="${S}" height="${S}" fill="#fff"/>
      <g fill="#000">${BUBBLE}</g>
    </mask>
  </defs>
  <g mask="url(#outside)">
    <g fill="#000" fill-opacity="${a.shadow}" filter="url(#blur)" transform="translate(0 14)">${BUBBLE}</g>
  </g>`
        : "";
    return `${shadow}
  <defs>
    ${glyphMask("glyph")}
    <linearGradient id="fg" x1="0" y1="210" x2="0" y2="806" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${a.glyph[0]}"/>
      <stop offset="1" stop-color="${a.glyph[1]}"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#fg)" mask="url(#glyph)"/>`;
}

const svg = (body, { rounded = false } = {}) => {
    const clip = rounded
        ? `<defs><clipPath id="sq"><rect width="${S}" height="${S}" rx="${R}"/></clipPath></defs>`
        : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
${clip}<g${rounded ? ' clip-path="url(#sq)"' : ""}>${body}
</g></svg>
`;
};

const full = (a, opts) => svg(background(a) + foreground(a), opts);

/** Monochrome white glyph on transparent — Android notification badge. */
const badge = () =>
    svg(`
  <defs>${glyphMask("glyph")}</defs>
  <rect width="${S}" height="${S}" fill="#fff" mask="url(#glyph)" transform="translate(512 512) scale(1.3) translate(-512 -508)"/>`);

function png(svgText, size) {
    return new Resvg(svgText, { fitTo: { mode: "width", value: size } }).render().asPng();
}

async function out(file, data) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    console.log("  ✓", path.relative(ROOT, file));
}

const { light, dark, tinted } = APPEARANCES;

// Icon Composer / Xcode sources
await out(path.join(SRC_DIR, "background.svg"), svg(background(light)));
await out(path.join(SRC_DIR, "foreground.svg"), svg(foreground({ ...light, shadow: 0 })));
await out(path.join(SRC_DIR, "AppIcon.svg"), full(light));
await out(path.join(SRC_DIR, "AppIcon-1024.png"), png(full(light), 1024));
await out(path.join(SRC_DIR, "AppIcon-1024-dark.png"), png(full(dark), 1024));
await out(path.join(SRC_DIR, "AppIcon-1024-tinted.png"), png(full(tinted), 1024));

// Web / PWA
await out(path.join(PUBLIC_DIR, "icon.svg"), full(light));
await out(path.join(PUBLIC_DIR, "favicon.svg"), full(light, { rounded: true }));
await out(
    path.join(PUBLIC_DIR, "favicon-32.png"),
    png(full(light, { rounded: true }), 32)
);
// iOS applies its own mask to touch icons, so this one stays square and opaque.
await out(path.join(PUBLIC_DIR, "apple-touch-icon.png"), png(full(light), 180));
await out(
    path.join(PUBLIC_DIR, "icon-192.png"),
    png(full(light, { rounded: true }), 192)
);
await out(
    path.join(PUBLIC_DIR, "icon-512.png"),
    png(full(light, { rounded: true }), 512)
);
await out(path.join(PUBLIC_DIR, "icon-maskable-512.png"), png(full(light), 512));
await out(path.join(PUBLIC_DIR, "badge-96.png"), png(badge(), 96));

// ---- iOS launch screens (apple-touch-startup-image) ----
// iOS shows these while a Home Screen web app starts. One per portrait screen
// size, in light and dark, matching the in-page splash (src/app/layout.tsx).
const SPLASH_DEVICES = [
    // [css width, css height, pixel ratio]
    [440, 956, 3], // iPhone 16/17 Pro Max
    [402, 874, 3], // iPhone 16/17 Pro
    [430, 932, 3], // iPhone 14 Pro Max, 15/16 Plus, 15 Pro Max
    [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16
    [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
    [390, 844, 3], // iPhone 12, 13, 14, 12/13 Pro
    [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
    [414, 896, 3], // iPhone XS Max, 11 Pro Max
    [414, 896, 2], // iPhone XR, 11
    [375, 667, 2], // iPhone SE (2nd/3rd gen), 8
    [1024, 1366, 2], // iPad Pro 12.9"
    [834, 1194, 2], // iPad Pro 11"
    [820, 1180, 2], // iPad Air
    [810, 1080, 2], // iPad 10.2"
    [744, 1133, 2], // iPad mini
];

const SPLASH_THEMES = {
    light: { bg: "#FFFFFF", title: "#000000", subtitle: "rgba(60,60,67,0.6)" },
    dark: { bg: "#000000", title: "#FFFFFF", subtitle: "rgba(235,235,245,0.6)" },
};
// Keep in sync with src/app/splash.ts and the .app-splash styles in globals.css.
const SPLASH_TITLE = "SMS Gateway";
const SPLASH_SUBTITLE = "Your texts, on every device";
const SPLASH_FONT =
    "SF Pro Display, SF Pro Text, Helvetica Neue, Helvetica, Arial, sans-serif";
const iconPngB64 = Buffer.from(png(full(light), 512)).toString("base64");

/** Mirrors the in-page splash, in CSS px scaled by the device pixel ratio. */
function splash(cw, ch, dpr, theme) {
    const w = cw * dpr;
    const h = ch * dpr;
    const icon = Math.min(112, Math.max(64, Math.min(cw, ch) * 0.2)); // clamp(64px, 20vmin, 112px)
    // Group: icon, 18 gap, 28 title line, 4 gap, 20 subtitle line — vertically centered.
    const groupH = icon + 18 + 28 + 4 + 20;
    const top = (ch - groupH) / 2;
    const iconX = (cw - icon) / 2;
    const titleBaseline = top + icon + 18 + 21;
    const subtitleBaseline = top + icon + 18 + 28 + 4 + 15;
    const r = icon * 0.2237;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${cw} ${ch}">
  <rect width="${cw}" height="${ch}" fill="${theme.bg}"/>
  <defs>
    <clipPath id="i"><rect x="${iconX}" y="${top}" width="${icon}" height="${icon}" rx="${r}"/></clipPath>
    <filter id="s" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect x="${iconX}" y="${top}" width="${icon}" height="${icon}" rx="${r}" fill="${theme.bg}" filter="url(#s)"/>
  <image href="data:image/png;base64,${iconPngB64}" x="${iconX}" y="${top}" width="${icon}" height="${icon}" clip-path="url(#i)"/>
  <text x="${cw / 2}" y="${titleBaseline}" text-anchor="middle" font-family="${SPLASH_FONT}" font-size="22" font-weight="600" letter-spacing="-0.44" fill="${theme.title}">${SPLASH_TITLE}</text>
  <text x="${cw / 2}" y="${subtitleBaseline}" text-anchor="middle" font-family="${SPLASH_FONT}" font-size="15" fill="${theme.subtitle}">${SPLASH_SUBTITLE}</text>
</svg>`;
}

const splashLinks = [];
for (const [cw, ch, dpr] of SPLASH_DEVICES) {
    const w = cw * dpr;
    const h = ch * dpr;
    for (const [theme, colors] of Object.entries(SPLASH_THEMES)) {
        const file = `splash/launch-${w}x${h}-${theme}.png`;
        const svgText = splash(cw, ch, dpr, colors);
        const rendered = new Resvg(svgText, {
            fitTo: { mode: "width", value: w },
            font: { loadSystemFonts: true, defaultFontFamily: "Helvetica Neue" },
        }).render();
        await out(path.join(PUBLIC_DIR, file), rendered.asPng());
        splashLinks.push({
            url: `/${file}`,
            media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
        });
    }
}
// Consumed by src/app/layout.tsx (appleWebApp.startupImage).
await out(
    path.join(ROOT, "src/generated/splash-screens.json"),
    JSON.stringify(splashLinks, null, 4) + "\n"
);
