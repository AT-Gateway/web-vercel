/**
 * Generates every app icon asset from one geometry source.
 *
 * Mark: a message bubble with a two-way relay (send ⇄ receive) cut out of it —
 * an SMS gateway in one glyph.
 *
 * Follows the iOS 26 app icon rules:
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
const BUBBLE = `
  <ellipse cx="512" cy="480" rx="300" ry="232"/>
  <path d="M300 620C300 700 270 745 222 772C300 776 368 750 420 700Z"/>`;

const RELAY = `
  <path d="M372 420H636M566 350L636 420L566 490"/>
  <path d="M652 560H388M458 490L388 560L458 630"/>`;

const RELAY_STROKE = 46;

/** Mask: bubble in white, relay arrows punched out. */
const glyphMask = (id) => `
  <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">
    <rect width="${S}" height="${S}" fill="#000"/>
    <g fill="#fff">${BUBBLE}</g>
    <g fill="none" stroke="#000" stroke-width="${RELAY_STROKE}" stroke-linecap="round" stroke-linejoin="round">${RELAY}</g>
  </mask>`;

// ---- Appearances ----
const APPEARANCES = {
    light: {
        bg: ["#5FDD7E", "#14A44A"],
        glyph: ["#FFFFFF", "#FFFFFF"],
        shadow: 0.16,
    },
    dark: {
        bg: ["#2C2C2E", "#0E0E10"],
        glyph: ["#6BE58A", "#22B455"],
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
    <linearGradient id="fg" x1="0" y1="248" x2="0" y2="772" gradientUnits="userSpaceOnUse">
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
  <rect width="${S}" height="${S}" fill="#fff" mask="url(#glyph)" transform="translate(512 512) scale(1.4) translate(-512 -490)"/>`);

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
await out(path.join(PUBLIC_DIR, "favicon-32.png"), png(full(light, { rounded: true }), 32));
// iOS applies its own mask to touch icons, so this one stays square and opaque.
await out(path.join(PUBLIC_DIR, "apple-touch-icon.png"), png(full(light), 180));
await out(path.join(PUBLIC_DIR, "icon-192.png"), png(full(light, { rounded: true }), 192));
await out(path.join(PUBLIC_DIR, "icon-512.png"), png(full(light, { rounded: true }), 512));
await out(path.join(PUBLIC_DIR, "icon-maskable-512.png"), png(full(light), 512));
await out(path.join(PUBLIC_DIR, "badge-96.png"), png(badge(), 96));
