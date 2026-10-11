// The app's icons, drawn as inline SVG so the whole look works offline
// without an icon font. Generated once from the old index.html sprite.
// <IconSprite> renders these once; <Icon name> references one with <use>.

export const ICON_NAMES = ["camera", "explore", "grid", "library", "timer", "hourglass", "target", "footprint", "bolt", "flame", "film", "sun", "twilight", "lens", "shutter", "bulb", "contrast", "palette", "compare", "tune", "chat", "send", "share", "pin", "navigate", "pause", "play", "plus", "flag", "download", "bookmark", "repeat", "settings", "user"] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const SPRITE_DEFS = `
<g id="i-camera" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>
      <circle cx="12" cy="13" r="3.4"/>
    </g>
    <g id="i-explore" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>
    </g>
    <g id="i-grid" fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/>
      <rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>
    </g>
    <g id="i-library" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <rect x="3" y="6" width="15" height="13" rx="1.5"/><path d="M21 8v9a2 2 0 0 1-2 2"/>
      <path d="M3 16l4-4 3 3 3.5-4.5L18 16"/>
    </g>
    <g id="i-timer" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9.5 2.5h5"/>
    </g>
    <g id="i-hourglass" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M7 3h10v3.5L12 12l5 5.5V21H7v-3.5L12 12 7 6.5z"/>
    </g>
    <g id="i-target" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/>
      <circle cx="12" cy="12" r="2.6"/>
    </g>
    <g id="i-footprint" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M7 4c1.7 0 2.6 1.6 2.6 3.6S8.8 12 7 12s-2.6-1.6-2.6-4.4S5.3 4 7 4zM7 14.5h2.4v2.8A2.2 2.2 0 0 1 7.2 19.5 2.2 2.2 0 0 1 5 17.3v-2.8z"/>
      <path d="M17 8c1.4 0 2.2 1.3 2.2 3s-.7 3.6-2.2 3.6-2.2-1.3-2.2-3.6S15.6 8 17 8z"/>
    </g>
    <g id="i-bolt" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></g>
    <g id="i-flame" fill="currentColor">
      <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.4-2-1-3 1.5 1 2.5 3 2.5 5a6.5 6.5 0 0 1-13 0C6.5 7 9 4 12 2z"/>
    </g>
    <g id="i-film" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 4v16M16 4v16"/>
      <path d="M4 9h4M4 15h4M16 9h4M16 15h4"/>
    </g>
    <g id="i-sun" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>
    </g>
    <g id="i-twilight" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 4v2.5M4.9 7.4l1.7 1.7M19.1 7.4l-1.7 1.7"/>
    </g>
    <g id="i-lens" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/>
    </g>
    <g id="i-shutter" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <circle cx="12" cy="12" r="8.5"/><path d="M12 3.5L16.2 11M20.2 15.2H11.6M8.2 20.4l4.2-7.5M3.8 15.2L8 7.8M3.8 8.8h8.6M15.8 3.6l-4.2 7.4"/>
    </g>
    <g id="i-bulb" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M9 17h6M10 20h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3z"/>
    </g>
    <g id="i-contrast" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>
    </g>
    <g id="i-palette" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-1.8 0-1.6-1.5-1.7-1.5-3 0-.9.7-1.7 1.8-1.7h1.6a4.6 4.6 0 0 0 4.6-4.6c0-3.3-3.8-5.9-8.5-5.9z"/>
      <circle cx="8" cy="10" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="15.5" cy="8" r="1"/>
    </g>
    <g id="i-compare" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 7H3l3-3M3 7l3 3M17 17h4l-3-3M21 17l-3 3"/><path d="M7 7h6a4 4 0 0 1 4 4v6"/>
    </g>
    <g id="i-tune" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>
    </g>
    <g id="i-chat" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/>
    </g>
    <g id="i-send" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M4 12l16-8-6 16-2.5-6.5z"/>
    </g>
    <g id="i-share" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="2.6"/>
      <circle cx="6" cy="12" r="2.6"/>
      <circle cx="18" cy="19" r="2.6"/>
      <path d="M8.3 10.6l7.3-4.3M8.3 13.4l7.3 4.3"/>
    </g>
    <g id="i-pin" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21z"/><circle cx="12" cy="10" r="2.4"/>
    </g>
    <g id="i-navigate" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M3.5 11.5l17-7-7 17-2.5-7.5z"/>
    </g>
    <g id="i-pause" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M9 5v14M15 5v14"/>
    </g>
    <g id="i-play" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M8 5.5v13l10.5-6.5z"/>
    </g>
    <g id="i-plus" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M12 5v14M5 12h14"/>
    </g>
    <g id="i-flag" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M6 21V4h12l-2.5 4L18 12H6"/>
    </g>
    <g id="i-download" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v11M8 10.5l4 4 4-4M4 19h16"/>
    </g>
    <g id="i-bookmark" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M6 3h12v18l-6-4.5L6 21z"/>
    </g>
    <g id="i-repeat" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9V7a2 2 0 0 1 2-2h11l-2.5-2.5M20 15v2a2 2 0 0 1-2 2H7l2.5 2.5"/>
    </g>
    <g id="i-settings" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2.8l1.2 2.6 2.8-.6 1 2.7 2.7 1-.6 2.8 2.1 1.7-2.1 1.7.6 2.8-2.7 1-1 2.7-2.8-.6L12 21.2l-1.2-2.6-2.8.6-1-2.7-2.7-1 .6-2.8L2.8 12l2.1-1.7-.6-2.8 2.7-1 1-2.7 2.8.6z"/>
    </g>
    <g id="i-user" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5"/>
    </g>

    
`;
