// Provider logos as inline SVG (no network downloads — CSP + privacy).
// Each is a brand-colored tile with a white emblem. Used on the options page.

const BRANDS = {
  anthropic: {
    bg: "#C15F3C",
    emblem: `<g stroke="#fff" stroke-width="2.3" stroke-linecap="round">
      <line x1="12" y1="4.5" x2="12" y2="19.5"/>
      <line x1="5.5" y1="8.25" x2="18.5" y2="15.75"/>
      <line x1="18.5" y1="8.25" x2="5.5" y2="15.75"/></g>`,
  },
  openai: {
    bg: "#0D0D0D",
    emblem: `<g fill="none" stroke="#fff" stroke-width="1.7">
      <rect x="9.3" y="3.6" width="5.4" height="16.8" rx="2.7"/>
      <rect x="9.3" y="3.6" width="5.4" height="16.8" rx="2.7" transform="rotate(60 12 12)"/>
      <rect x="9.3" y="3.6" width="5.4" height="16.8" rx="2.7" transform="rotate(120 12 12)"/></g>`,
  },
  gemini: {
    bg: "#2E7CF6",
    emblem: `<path fill="#fff" d="M12 2.6c.6 5.4 3.4 8.2 8.8 8.8-5.4.6-8.2 3.4-8.8 8.8-.6-5.4-3.4-8.2-8.8-8.8 5.4-.6 8.2-3.4 8.8-8.8z"/>`,
  },
  deepseek: {
    bg: "#4D6BFE",
    emblem: `<g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round">
      <path d="M3.6 9.4q3.1-2.6 6.2 0t6.2 0"/>
      <path d="M3.6 14.6q3.1-2.6 6.2 0t6.2 0"/></g>`,
  },
  zai: {
    bg: "#2563EB",
    emblem: `<text x="12" y="17" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14" font-weight="800" fill="#fff">Z</text>`,
  },
  qwen: {
    bg: "#6D5AE6",
    emblem: `<text x="12" y="17" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13.5" font-weight="800" fill="#fff">Q</text>`,
  },
  kimi: {
    bg: "#111014",
    emblem: `<path fill="#fff" d="M16.4 5.1a7.5 7.5 0 1 0 0 13.8 6 6 0 1 1 0-13.8z"/>`,
  },
};

/** Returns an SVG string with a provider logo (brand tile), or a neutral badge. */
export function brandSvg(id, size = 22) {
  const b = BRANDS[id];
  const bg = b?.bg || "#5a5a66";
  const emblem = b?.emblem || `<circle cx="12" cy="12" r="4" fill="#fff"/>`;
  return `<svg class="brand-ico" width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="24" height="24" rx="6" fill="${bg}"/>${emblem}</svg>`;
}
