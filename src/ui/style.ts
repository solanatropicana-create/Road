/** UI styles, injected at boot so the build stays a single script. */
export const CSS = `
:root {
  --ink: #efe6d6;
  --ink-dim: rgba(239, 230, 214, 0.78);
  --ink-faint: rgba(239, 230, 214, 0.62);
  --panel: rgba(16, 12, 9, 0.88);
  --panel-solid: #15100c;
  --line: rgba(239, 230, 214, 0.14);
  --accent: #e2b45c;
  --accent-dim: rgba(226, 180, 92, 0.18);
  --danger: #e88a6e;
  --ok: #9cc27a;
  --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif;
  --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  /* Paper grain for the panels: a static noise tile (cheap, unlike a backdrop blur). */
  --grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 .94 0 0 0 0 .84 0 0 0 .07 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
#ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--sans); color: var(--ink); font-size: 13px; }
#ui * { box-sizing: border-box; }
#ui [hidden] { display: none !important; }
/* Solid-ish panels: a backdrop blur over a full-screen canvas costs frames. */
.panel {
  position: absolute; pointer-events: auto; background: var(--grain), linear-gradient(180deg, rgba(30,23,17,0.9), rgba(16,12,9,0.9));
  border: 1px solid var(--line); border-radius: 5px; padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 0 0 3px rgba(16,12,9,0.6), inset 0 0 0 4px rgba(239,230,214,0.05);
}
/* Instrument corner ticks. */
.panel::after {
  content: ''; position: absolute; inset: -1px; pointer-events: none; border-radius: 5px; opacity: 0.55;
  background:
    linear-gradient(var(--accent), var(--accent)) left top / 9px 1px no-repeat,
    linear-gradient(var(--accent), var(--accent)) left top / 1px 9px no-repeat,
    linear-gradient(var(--accent), var(--accent)) right top / 9px 1px no-repeat,
    linear-gradient(var(--accent), var(--accent)) right top / 1px 9px no-repeat,
    linear-gradient(var(--accent), var(--accent)) left bottom / 9px 1px no-repeat,
    linear-gradient(var(--accent), var(--accent)) left bottom / 1px 9px no-repeat,
    linear-gradient(var(--accent), var(--accent)) right bottom / 9px 1px no-repeat,
    linear-gradient(var(--accent), var(--accent)) right bottom / 1px 9px no-repeat;
}
.ico { width: 14px; height: 14px; flex: none; vertical-align: -2px; }
.eyebrow .ico { width: 12px; height: 12px; margin-right: 5px; vertical-align: -2px; opacity: 0.85; }
.row label .ico { width: 13px; height: 13px; margin-right: 6px; vertical-align: -2px; color: var(--ink-faint); }
.logo-ant { width: 20px; height: 20px; color: var(--accent); flex: none; }
.eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); }
.title { font-family: var(--mono); font-weight: 600; letter-spacing: 0.22em; font-size: 11px; color: var(--accent); }
.species { font-family: var(--serif); font-style: italic; color: var(--ink-dim); font-size: 13px; margin-top: 2px; }
.brand { display: flex; align-items: center; gap: 7px; }
.wordmark-s { font-family: var(--serif); font-weight: 600; font-size: 19px; letter-spacing: 0.01em; color: var(--ink); }
.specimen { display: inline-block; margin-top: 6px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--ink-faint); border: 1px solid var(--line); border-radius: 2px; padding: 1px 6px; }

/* --- field card */
#card { top: 14px; left: 14px; width: 252px; max-height: calc(100vh - 28px); overflow: auto; }
#card .pop { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 2px; }
#card .pop b { font-family: var(--mono); font-weight: 500; font-size: 34px; line-height: 1; letter-spacing: -0.02em; }
#card .pop span { color: var(--ink-dim); }
#card .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 6px; margin-top: 10px; }
#card .grid div { display: flex; flex-direction: column; gap: 1px; }
#card .grid b { font-family: var(--mono); font-weight: 500; font-size: 15px; }
#card .grid b.warn { color: var(--danger); }
#fooddays { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); white-space: nowrap; }
#fooddays.warn { color: var(--danger); }
#card canvas { display: block; width: 100%; height: 38px; margin-top: 10px; }
.sparkkey { display: flex; gap: 12px; margin-top: 3px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.sparkkey span { display: inline-flex; align-items: center; gap: 5px; }
.sparkkey i { display: inline-block; width: 12px; height: 3px; border-radius: 2px; }
.sparkkey i.k-pop { background: rgba(239,230,214,0.9); }
.sparkkey i.k-food { background: rgba(226,180,92,0.8); }
#card .legend { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 11px; color: var(--ink-faint); }
#card .legend span { display: inline-flex; align-items: center; gap: 4px; }
#card .legend i { width: 9px; height: 9px; border-radius: 2px; filter: brightness(1.4) saturate(1.2); }
#card .notes { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
#card .notes-head { display: flex; justify-content: space-between; align-items: baseline; }
#card .notes ol { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
#card .notes.open ol { max-height: 260px; overflow: auto; }
#card .notes li { display: grid; grid-template-columns: 64px 1fr; gap: 6px; font-size: 12px; color: var(--ink-dim); line-height: 1.35; }
#card .notes li time { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); font-variant-numeric: tabular-nums; padding-top: 1px; }
#card .notes li:first-child span { color: var(--ink); }
#card .notes li b { color: var(--accent); font-weight: 500; }
.go { all: unset; cursor: pointer; font-family: var(--mono); font-size: 12px; color: var(--accent); white-space: nowrap; border-bottom: 1px dotted rgba(226,180,92,0.6); }
.go:hover { color: var(--ink); }
#card .clock { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; font-family: var(--mono); font-size: 12px; color: var(--ink-dim); }
#card .clock #skyico { display: inline-flex; color: var(--accent); }
#card .clock #skyico .ico { width: 16px; height: 16px; }
#card .clock #time { margin-left: auto; }
#card .clock.sub { margin-top: 3px; font-size: 11px; color: var(--ink-faint); justify-content: space-between; }

/* --- one-line strip (phones, where the card is hidden) */
#strip { display: none; position: absolute; top: 8px; left: 8px; right: 8px; pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; gap: 10px; align-items: baseline; font-family: var(--mono); font-size: 12px; color: var(--ink-dim); white-space: nowrap; overflow: hidden; }
#strip b { font-size: 16px; font-weight: 500; color: var(--ink); }
#strip .ico { color: var(--accent); width: 18px; height: 18px; align-self: center; }
#strip #s-day { margin-left: auto; }

/* --- colony brain */
#brain { top: 14px; right: 14px; width: 284px; max-height: calc(100vh - 92px); overflow: auto; }
#brain h3 { margin: 14px 0 8px; }
#brain h3:first-of-type { margin-top: 10px; }
#brain.collapsed .body, #brain.collapsed #dormant { display: none; }
#dormant { display: none; margin-top: 8px; font-size: 12px; color: var(--ink-dim); line-height: 1.45; }
#brain.dormant #dormant { display: block; }
#brain.dormant .body { opacity: 0.4; pointer-events: none; filter: saturate(0.4); }
.row { display: grid; grid-template-columns: 66px 1fr; align-items: center; gap: 8px; margin: 6px 0; border-radius: 6px; }
.row label { font-size: 12px; color: var(--ink-dim); }
.row.slider { grid-template-columns: 66px 1fr auto; }
.row.slider span { font-family: var(--mono); font-size: 12px; color: var(--ink-dim); text-align: right; white-space: nowrap; }
.subline { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin: -2px 0 6px 74px; min-height: 13px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg button { all: unset; cursor: pointer; text-align: center; font-family: var(--mono); font-size: 11px; padding: 5px 2px; color: var(--ink-faint); letter-spacing: 0.02em; white-space: nowrap; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { color: var(--ink); background: rgba(255,255,255,0.05); }
.seg button.on { color: #1a120b; background: var(--accent); font-weight: 600; }
.share { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin: -2px 0 6px 74px; }
.share .track { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
.share .track i { display: block; height: 100%; background: var(--accent); opacity: 0.75; transition: width 0.4s; }
.share span { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); min-width: 92px; text-align: right; white-space: nowrap; }
.btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.btn { all: unset; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 7px 8px; font-size: 12px; text-align: center; color: var(--ink); }
.btn:hover { border-color: rgba(226,180,92,0.5); background: var(--accent-dim); }
.btn.on { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
.btn.disabled { opacity: 0.45; cursor: not-allowed; }
.btn.disabled:hover { border-color: var(--line); background: none; }
.btn:focus-visible, .seg button:focus-visible, .collapse:focus-visible, .chip:focus-visible, .go:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.danger { border-color: var(--danger); color: var(--danger); background: rgba(224,122,95,0.12); }
.queue { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 14px; }
.qlabel { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin-right: 2px; }
.chip { all: unset; cursor: pointer; font-family: var(--mono); font-size: 12px; color: var(--ink); border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; }
.chip:hover { border-color: var(--danger); color: var(--danger); }
.hint { font-size: 12px; color: var(--ink-faint); line-height: 1.45; margin-top: 8px; }
input[type=range] { width: 100%; accent-color: var(--accent); }
.collapse { all: unset; cursor: pointer; float: right; font-family: var(--mono); font-size: 11px; color: var(--ink-faint); }
.collapse:hover { color: var(--ink); }

/* A setting that is causing trouble flashes; Watch glows once, when there is something to watch. */
.row.pulse { animation: pulse-row 1.3s ease-out 4; }
@keyframes pulse-row { 0% { background: rgba(232,138,110,0.5); } 100% { background: transparent; } }
.seg button.pulse { animation: glow 1.4s ease-in-out infinite; }
@keyframes glow { 0%, 100% { background: transparent; } 50% { background: rgba(226,180,92,0.45); color: var(--ink); } }

/* --- time bar */
#bar { left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 10px; width: max-content; max-width: calc(100vw - 24px); }
#bar .seg button { padding: 6px 10px; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
#bar .seg button .ico { width: 15px; height: 15px; }
#bar .seg { grid-auto-columns: auto; }
#bar .perf { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); min-width: 64px; text-align: right; white-space: nowrap; }

/* --- documentary caption (stays in cinema mode) */
#caption { position: absolute; left: 22px; bottom: 84px; display: none; pointer-events: none; max-width: min(560px, calc(100vw - 44px)); }
#caption .line { font-family: var(--mono); font-size: 14px; color: var(--ink); margin-top: 4px; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9); }
#caption .eyebrow { color: var(--accent); text-shadow: 0 1px 6px rgba(0,0,0,0.85); }

#keys { left: 50%; bottom: 74px; transform: translateX(-50%); width: 320px; z-index: 2; background: var(--panel-solid); }
#keys dl { display: grid; grid-template-columns: 104px 1fr; gap: 5px 10px; margin: 8px 0 12px; font-size: 12px; }
#keys dt { font-family: var(--mono); font-size: 12px; color: var(--accent); }
#keys dd { margin: 0; color: var(--ink-dim); }
#keys .langrow { grid-template-columns: 80px 1fr; margin: 0 0 10px; }
#keys .btn { display: block; width: 100%; text-align: center; }

#inspect { left: 14px; bottom: 14px; width: 252px; display: none; }
#inspect .name { font-family: var(--mono); font-size: 15px; margin: 4px 0 8px; }
#inspect dl { display: grid; grid-template-columns: 74px 1fr; gap: 4px 8px; margin: 0; }
#inspect dt { color: var(--ink-faint); font-size: 12px; }
#inspect dd { margin: 0; font-size: 12px; }
/* Where the time bar reaches the left edge, the inspector sits above it. */
@media (max-width: 1400px) { #inspect { bottom: 74px; } }
#inspect.lifecard { border-color: rgba(232,138,110,0.55); }
#inspect.lifecard p { margin: 0; color: var(--ink-dim); line-height: 1.45; font-size: 12px; }

#prompt { left: 50%; top: 44%; transform: translateX(-50%); text-align: center; padding: 16px 22px; width: max-content; max-width: min(460px, calc(100vw - 24px)); }
#prompt h2 { margin: 6px 0 6px; font-weight: 500; font-size: 20px; }
#prompt p { margin: 0; color: var(--ink-dim); line-height: 1.5; }
#prompt .prompt-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
#prompt .prompt-btns .btn { padding: 8px 14px; }

#toasts { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; width: min(540px, calc(100vw - 600px)); min-width: min(360px, calc(100vw - 24px)); }
.toast { background: var(--grain), rgba(20,15,11,0.92); border: 1px solid var(--line); border-left: 2px solid var(--accent); border-radius: 3px; padding: 7px 14px; font-size: 13px; line-height: 1.4; text-align: center; animation: toast 5s forwards; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
.toast b { color: var(--accent); font-weight: 500; }
@keyframes toast { 0% { opacity: 0; transform: translateY(-6px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }

#tip { position: absolute; pointer-events: none; background: var(--panel-solid); border: 1px solid var(--line); border-radius: 6px; padding: 6px 9px; font-size: 12px; display: none; white-space: nowrap; }
#tip b { font-family: var(--mono); color: var(--accent); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; }
#tip .fact { margin-top: 4px; max-width: 240px; white-space: normal; color: var(--ink-faint); font-style: italic; line-height: 1.35; }

#over { left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; padding: 22px 28px; display: none; width: max-content; max-width: min(440px, calc(100vw - 24px)); }
#over h2 { margin: 6px 0 8px; font-weight: 500; }
#over p { color: var(--ink-dim); margin: 0 0 14px; line-height: 1.5; }

/* --- the colony, read-only (watch mode) */
#colony { top: 14px; right: 14px; width: 284px; max-height: calc(100vh - 92px); overflow: auto; }
#colony h3 { margin: 14px 0 8px; }
#colony.collapsed .body, #colony.collapsed #cdormant { display: none; }
#cdormant { display: none; margin-top: 8px; font-size: 12px; color: var(--ink-dim); line-height: 1.45; }
#colony.dormant #cdormant { display: block; }
#colony.dormant .body { display: none; }
.trow { display: grid; grid-template-columns: 96px 1fr 34px; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; color: var(--ink-dim); }
.trow .tl { display: inline-flex; align-items: center; gap: 6px; }
.trow .ico { color: var(--ink-faint); }
.trow .track { height: 4px; background: var(--line); border-radius: 2px; overflow: hidden; }
.trow .track i { display: block; height: 100%; width: 0; background: var(--accent); opacity: 0.8; transition: width 0.5s; }
.trow b { font-family: var(--mono); font-weight: 500; text-align: right; color: var(--ink); }
.broodrow { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--ink-faint); }
.broodrow span { display: inline-flex; align-items: center; gap: 4px; }
.broodrow b { font-family: var(--mono); font-weight: 500; color: var(--ink); }
.roomrow { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 10px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; width: 100%; padding: 5px 6px; border-radius: 4px; font-size: 12px; }
.roomrow:hover { background: rgba(255,255,255,0.05); }
.roomrow i { grid-row: 1 / 3; width: 9px; height: 9px; border-radius: 2px; margin-top: 3px; filter: brightness(1.4) saturate(1.2); }
.roomrow span { color: var(--ink); }
.roomrow em { font-style: normal; font-family: var(--mono); color: var(--ink-faint); }
.roomrow small { grid-column: 2 / 4; font-family: var(--mono); font-size: 11px; color: var(--ink-faint); }
.roomrow.dig small { color: var(--accent); }
#ui.m-watch #brain, #ui.m-guide #colony { display: none !important; }

/* --- winter rest band */
#winter { left: 50%; bottom: 74px; transform: translateX(-50%); display: none; align-items: center; gap: 10px; padding: 7px 14px; font-size: 13px; width: max-content; max-width: calc(100vw - 24px); }
#winter .wico { color: #cfe2f2; }
#winter .linkbtn { color: var(--accent); font-size: 12px; }
#ui.cinema #winter { display: none !important; }

/* --- scale bar: true scale, the slice's signature */
#scale { position: absolute; right: 22px; bottom: 22px; pointer-events: none; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-family: var(--mono); font-size: 11px; color: var(--ink); text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
#scale i { display: block; height: 4px; border: 1px solid rgba(239,230,214,0.85); border-top: none; box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
#ui.titled #scale { display: none; }

.btn.ghost { border-color: transparent; color: var(--ink-faint); display: inline-flex; align-items: center; gap: 4px; }
.btn.ghost:hover { color: var(--ink); background: none; }
.linkbtn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--ink-dim); }
.linkbtn:hover { color: var(--accent); }

/* --- title */
#title { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; overflow: auto;
  background: radial-gradient(ellipse at 50% 46%, rgba(11,8,6,0.25) 0%, rgba(11,8,6,0.72) 62%, rgba(11,8,6,0.92) 100%); }
#title .inner { width: min(760px, calc(100vw - 32px)); text-align: center; padding: 24px 0; }
#title .logo .logo-ant { width: 72px; height: 72px; }
#title .wordmark { margin: 2px 0 6px; font-family: var(--serif); font-weight: 600; font-size: clamp(46px, 8vw, 84px); line-height: 1; letter-spacing: -0.01em; color: var(--ink); text-shadow: 0 2px 24px rgba(0,0,0,0.6); }
#title .tagline { font-family: var(--serif); font-style: italic; font-size: 19px; color: var(--ink-dim); }
#title .latin { margin-top: 8px; display: inline-flex; gap: 8px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em; color: var(--ink-faint); }
#title .latin i { font-family: var(--serif); font-size: 13px; letter-spacing: 0; color: var(--ink-dim); }
#title .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 30px 0 16px; }
.mode { all: unset; box-sizing: border-box; cursor: pointer; position: relative; text-align: left; padding: 18px 20px 16px; border: 1px solid var(--line); border-radius: 5px;
  background: var(--grain), linear-gradient(180deg, rgba(30,23,17,0.92), rgba(16,12,9,0.92)); transition: border-color 0.15s, transform 0.15s; }
.mode:hover, .mode:focus-visible { border-color: var(--accent); transform: translateY(-2px); }
.mode .ico { width: 24px; height: 24px; color: var(--accent); }
.mode h3 { margin: 10px 0 6px; font-family: var(--serif); font-weight: 600; font-size: 24px; color: var(--ink); }
.mode p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-dim); }
.mode.last::before { content: ''; position: absolute; top: 12px; right: 12px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
#title #resume { display: block; width: 100%; padding: 11px; font-size: 13px; margin-bottom: 14px; }
.sitecard { display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; gap: 8px; margin: 4px 0 16px; padding: 14px 10px; text-align: left; border: 1px solid var(--line); border-radius: 5px; pointer-events: auto;
  background: var(--grain), rgba(16,12,9,0.78); }
.sitenav { all: unset; cursor: pointer; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--ink-dim); }
.sitenav:hover { color: var(--accent); background: rgba(255,255,255,0.05); }
.sitenav .ico { width: 18px; height: 18px; }
.sitenav.next .ico { transform: scaleX(-1); }
.sitename { font-family: var(--serif); font-weight: 600; font-size: 20px; color: var(--ink); }
.sitedesc { margin-top: 4px; font-size: 13px; line-height: 1.45; color: var(--ink-dim); }
.sitesp { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.sitesp i { font-family: var(--serif); font-size: 13px; color: var(--ink-dim); }
.traits { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.traits li { font-size: 12px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-dim); }
.traits li b { margin-right: 5px; font-family: var(--mono); }
.traits li.pro { border-color: rgba(156,194,122,0.5); }
.traits li.pro b { color: var(--ok); }
.traits li.con { border-color: rgba(232,138,110,0.5); }
.traits li.con b { color: var(--danger); }
.title-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 18px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.title-foot .seg button { padding: 4px 10px; }
#ui.titled #bar, #ui.titled #keys, #ui.titled #toasts, #ui.titled #caption { display: none !important; }

/* --- phases: before landing there is only the meadow and the question */
#ui.ph-choose #brain, #ui.ph-choose #colony, #ui.ph-choose #card, #ui.ph-choose #strip { display: none !important; }

/* --- cinema mode (H): a clean frame; only the caption and a way back stay */
#cinema-exit { position: absolute; top: 12px; right: 12px; display: none; pointer-events: auto; background: var(--panel); font-size: 11px; opacity: 0.55; }
#cinema-exit:hover { opacity: 1; }
#ui.cinema #cinema-exit { display: block; }
#ui.cinema .panel:not(#prompt):not(#over), #ui.cinema #toasts, #ui.cinema #tip, #ui.cinema #strip { display: none !important; }
#ui.cinema #caption { bottom: 26px; }

/* --- large monitors: the panels grow with the screen */
@media (min-width: 2200px) and (min-height: 1200px) {
  .panel, #toasts, #caption, #cinema-exit { zoom: 1.3; }
}

/* --- touch: finger-sized targets */
@media (pointer: coarse) {
  .seg button { padding: 11px 4px; min-height: 40px; }
  #bar .seg button { padding: 11px 8px; }
  .btn { padding: 11px 8px; min-height: 42px; }
  .chip { padding: 7px 11px; }
  .collapse { padding: 8px 10px; margin: -8px -10px 0 0; }
  .go { padding: 4px 0; }
  input[type=range] { height: 32px; }
}

/* --- phones (portrait): strip on top, brain as a bottom sheet over a two-row bar */
@media (max-width: 760px) {
  #card { display: none !important; }
  #strip { display: flex; }
  #bar { left: 8px; right: 8px; bottom: 8px; transform: none; width: auto; max-width: none; display: grid; grid-template-columns: auto 1fr; gap: 6px; padding: 6px; }
  #bar #speeds { grid-column: 1 / -1; }
  #bar .seg button { padding: 8px 4px; }
  #bar .perf { display: none; }
  #brain { top: auto; bottom: 112px; left: 8px; right: 8px; width: auto; max-height: 46vh; }
  #keys { bottom: 112px; left: 8px; right: 8px; width: auto; transform: none; max-height: calc(100vh - 170px); overflow: auto; }
  #toasts { top: 50px; width: calc(100vw - 24px); min-width: 0; }
  .toast { font-size: 12px; }
  #inspect { top: 50px; bottom: auto; left: 8px; right: 8px; width: auto; padding: 8px 12px; }
  #inspect dl { grid-template-columns: 74px 1fr 74px 1fr; }
  #caption { left: 12px; right: 12px; bottom: 166px; }
  #caption .line { font-size: 13px; }
  #ui.cinema #caption { bottom: 20px; }
  #prompt { top: 30%; }
  #winter { bottom: 112px; }
  #colony { top: auto; bottom: 112px; left: 8px; right: 8px; width: auto; max-height: 46vh; }
  #bar .lbl { display: none; }
  #scale { top: 54px; bottom: auto; right: 12px; }
  #title .modes { grid-template-columns: 1fr; margin-top: 20px; }
  .sitecard { grid-template-columns: 28px 1fr 28px; padding: 10px 6px; }
  .sitedesc { display: none; }
  #title .tagline { font-size: 16px; }
  .mode { padding: 14px 16px; }
  .mode h3 { font-size: 20px; margin-top: 6px; }
}

/* --- phones (landscape) and short windows: strip on top, brain down the right side */
@media (max-height: 500px) and (min-width: 761px) {
  #card { display: none !important; }
  #strip { display: flex; right: auto; max-width: calc(100vw - 320px); }
  #brain { top: 8px; right: 8px; width: 270px; max-height: calc(100vh - 72px); }
  #bar { bottom: 6px; padding: 5px 8px; }
  #bar .perf { display: none; }
  #inspect { top: 50px; bottom: auto; left: 8px; }
  #toasts { top: 50px; left: 8px; transform: none; width: calc(100vw - 300px); min-width: 0; align-items: flex-start; }
  #keys { bottom: 64px; max-height: calc(100vh - 80px); overflow: auto; }
  #caption { bottom: 66px; }
  #prompt { top: 24%; }
  #colony { top: 8px; right: 8px; width: 270px; max-height: calc(100vh - 72px); }
  #bar .lbl { display: none; }
  #scale { bottom: 64px; }
  #title .modes { margin: 14px 0 10px; }
  #title .logo { display: none; }
}
`;
