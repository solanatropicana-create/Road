/**
 * The interface's own icon set: small line drawings on a 16-unit grid, in the
 * same hand as the field-station panels. Each is an inline SVG string that
 * takes the text colour.
 */
const svg = (body: string, cls = ''): string =>
  `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** A harvester-ant worker in profile: head, thorax, two waist nodes, gaster, legs. */
const ANT_BODY = `
  <ellipse cx="3.3" cy="7.2" rx="1.9" ry="1.6" fill="currentColor" stroke="none"/>
  <path d="M1.6 6.1 0.6 4.6M2.3 5.8 1.9 4.1" stroke-width="0.9"/>
  <ellipse cx="6.6" cy="7.6" rx="1.7" ry="1.05" fill="currentColor" stroke="none"/>
  <circle cx="8.7" cy="8" r="0.65" fill="currentColor" stroke="none"/>
  <circle cx="9.9" cy="7.9" r="0.7" fill="currentColor" stroke="none"/>
  <ellipse cx="12.6" cy="7.6" rx="2.6" ry="2" fill="currentColor" stroke="none"/>
  <path d="M5.6 8.4 4.2 11.2M6.6 8.6 6.8 11.6M7.5 8.4 9.2 11.2" stroke-width="0.8"/>`;

export const ICON = {
  ant: svg(ANT_BODY, 'ant'),
  major: svg(
    `<ellipse cx="3.6" cy="7.1" rx="2.6" ry="2.2" fill="currentColor" stroke="none"/>
     <path d="M1.4 5.6 0.4 3.8M2.4 5.1 2.1 3.2" stroke-width="0.9"/>
     <ellipse cx="7.3" cy="7.6" rx="1.6" ry="1" fill="currentColor" stroke="none"/>
     <circle cx="9.3" cy="8" r="0.6" fill="currentColor" stroke="none"/>
     <circle cx="10.4" cy="7.9" r="0.65" fill="currentColor" stroke="none"/>
     <ellipse cx="13" cy="7.6" rx="2.4" ry="1.9" fill="currentColor" stroke="none"/>
     <path d="M6.4 8.4 5 11.2M7.4 8.6 7.6 11.6M8.2 8.4 9.8 11.2" stroke-width="0.8"/>`,
  ),
  queen: svg(
    `<ellipse cx="2.6" cy="7" rx="1.6" ry="1.4" fill="currentColor" stroke="none"/>
     <ellipse cx="5.6" cy="7.3" rx="1.9" ry="1.3" fill="currentColor" stroke="none"/>
     <circle cx="7.9" cy="7.7" r="0.6" fill="currentColor" stroke="none"/>
     <circle cx="9" cy="7.6" r="0.65" fill="currentColor" stroke="none"/>
     <ellipse cx="12.4" cy="7.6" rx="3.3" ry="2.4" fill="currentColor" stroke="none"/>
     <path d="M4.8 8.2 3.6 11M5.6 8.4 5.8 11.6M6.4 8.2 8 11" stroke-width="0.8"/>`,
  ),
  egg: svg(`<ellipse cx="8" cy="8.4" rx="2.6" ry="3.6" transform="rotate(-20 8 8.4)"/>`),
  larva: svg(`<path d="M5 12.2c-2-1.2-2.4-4.4-.6-6.4C6.2 3.8 9.6 3.6 11.4 5.4c1.4 1.4 1.2 3.4-.2 4.2"/><path d="M7 10.6c1-.2 1.8-.9 2.2-1.8" stroke-width="1"/>`),
  pupa: svg(`<path d="M8 2.6c2.4 0 3.6 2.4 3.6 5.4S10.4 13.4 8 13.4 4.4 11 4.4 8 5.6 2.6 8 2.6Z"/><path d="M5.2 6.4h5.6M5 9.4h6" stroke-width="0.9"/>`),
  seed: svg(`<path d="M8 2.4c2.6 2 3.6 4.6 3 7.4-.5 2.2-1.6 3.6-3 3.8-1.4-.2-2.5-1.6-3-3.8-.6-2.8.4-5.4 3-7.4Z"/><path d="M8 4.6v7.2" stroke-width="0.9"/>`),
  pause: svg(`<path d="M5.4 3.6v8.8M10.6 3.6v8.8" stroke-width="2"/>`),
  zoomIn: svg(`<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.6 13.6M5 7h4M7 5v4"/>`),
  zoomOut: svg(`<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 13.6 13.6M5 7h4"/>`),
  fit: svg(`<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>`),
  /** Documentary camera. */
  camera: svg(`<rect x="1.8" y="4.6" width="8.6" height="6.8" rx="1.2"/><path d="M10.4 7 14 5v6l-3.6-2"/><circle cx="4.6" cy="3.2" r="1.2"/><circle cx="7.8" cy="3.2" r="1.2"/>`),
  plan: svg(`<path d="M8 1.8v4.4" stroke-dasharray="1.2 1.6"/><rect x="2.2" y="6.4" width="11.6" height="5.6" rx="2.8" stroke-dasharray="1.4 1.6"/>`),
  trails: svg(`<path d="M1.6 11c2.2 0 2.4-4.4 4.6-4.4S8.6 10 10.8 10s2.4-5 3.6-5" stroke-dasharray="0.2 2.2" stroke-width="1.8"/>`),
  hide: svg(`<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><path d="M5.5 8h5" stroke-width="1"/>`),
  help: svg(`<circle cx="8" cy="8" r="6"/><path d="M6.2 6.3c.2-1.2 1-1.8 1.9-1.8 1.1 0 1.9.7 1.9 1.7 0 1.4-1.9 1.5-1.9 3"/><circle cx="8.1" cy="11.4" r="0.35" fill="currentColor"/>`),
  sun: svg(`<circle cx="8" cy="8" r="2.8"/><path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"/>`),
  moon: svg(`<path d="M11.8 10.6A5 5 0 0 1 5.4 4.2a5 5 0 1 0 6.4 6.4Z"/>`),
  rain: svg(`<path d="M4.4 9.4a2.6 2.6 0 0 1 .4-5.2 3.4 3.4 0 0 1 6.4.8 2.2 2.2 0 0 1 .4 4.4Z"/><path d="M5.4 11.4l-.6 1.6M8.2 11.4l-.6 1.6M11 11.4l-.6 1.6"/>`),
  storm: svg(`<path d="M4.4 9.4a2.6 2.6 0 0 1 .4-5.2 3.4 3.4 0 0 1 6.4.8 2.2 2.2 0 0 1 .4 4.4Z"/><path d="M8.6 9.6 7 12.2h2l-1.4 2.4"/>`),
  dig: svg(`<path d="M3 13 9.4 6.6"/><path d="M8.4 4.2 11.8 7.6 13.6 4.4 11.6 2.4Z"/>`),
  forage: svg(`<path d="M8 2.4c2.6 2 3.6 4.6 3 7.4-.5 2.2-1.6 3.6-3 3.8-1.4-.2-2.5-1.6-3-3.8-.6-2.8.4-5.4 3-7.4Z"/><path d="M8 4.6v7.2" stroke-width="0.9"/>`),
  nurse: svg(`<path d="M5 12.2c-2-1.2-2.4-4.4-.6-6.4C6.2 3.8 9.6 3.6 11.4 5.4c1.4 1.4 1.2 3.4-.2 4.2"/><path d="M7 10.6c1-.2 1.8-.9 2.2-1.8" stroke-width="1"/>`),
  clean: svg(`<path d="M3.6 12.8c1.8-.6 3-1.8 3.8-3.6M6 13.4c1.6-1.4 2.6-3 3-5M9.4 13c.8-1.8 1-3.6.6-5.6"/><path d="M5.6 6.4 8.8 2.6l3.4 2.8-2.6 3"/>`),
  idle: svg(`<path d="M4 6.2h3.4L4 10.2h3.4M9.4 3.6H12L9.4 6.6H12"/>`),
  room: svg(`<rect x="2.2" y="5" width="11.6" height="6.4" rx="3.2"/>`),
  journal: svg(`<path d="M3.4 2.6h7.8a1.4 1.4 0 0 1 1.4 1.4v9.4H4.8a1.4 1.4 0 0 1-1.4-1.4Z"/><path d="M3.4 12a1.4 1.4 0 0 1 1.4-1.4h7.8M6 5.4h4M6 7.6h3"/>`),
  close: svg(`<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/>`),
  eye: svg(`<path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8s-2.4 4.4-6.4 4.4S1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="2"/>`),
  /** Antennae and a little brain: the colony brain. */
  brain: svg(`<path d="M5.4 13.4V11a3.6 3.6 0 0 1-2.4-3.4A3.6 3.6 0 0 1 6.6 4a3.6 3.6 0 0 1 5.2 1.4 3 3 0 0 1 1.2 5.4l-.4 2.6"/><path d="M6.6 4 5 1.6M9.4 4.2 11 1.6" stroke-width="1"/><path d="M8 6.6v3.6M8 8.4h2" stroke-width="1"/>`),
  dice: svg(`<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.4"/><circle cx="5.6" cy="5.6" r="0.8" fill="currentColor"/><circle cx="10.4" cy="10.4" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/>`),
  back: svg(`<path d="M9.8 3.6 5.4 8l4.4 4.4"/>`),
};

/** The wordmark's ant, larger and finer than the icons. */
export const LOGO_ANT = `<svg class="logo-ant" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round">${ANT_BODY}</svg>`;
