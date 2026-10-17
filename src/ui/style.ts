/** UI styles, injected at boot so the build stays a single script. */
export const CSS = `
:root {
  /* Field-journal kit: warm ink on dark loam, one amber accent, soft rounded cards. */
  --ink: #f3ead9;
  --ink-dim: rgba(243, 234, 217, 0.8);
  --ink-faint: rgba(243, 234, 217, 0.6);
  --panel: rgba(26, 20, 15, 0.9);
  --panel-solid: #1a140f;
  --line: rgba(255, 236, 210, 0.1);
  --accent: #e7b75f;
  --accent-dim: rgba(231, 183, 95, 0.16);
  --danger: #e8866a;
  --ok: #a9c48a;
  --track: rgba(255, 244, 228, 0.05);
  --radius: 14px;
  --r-btn: 9px;
  --shadow: 0 14px 34px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 240, 220, 0.06);
  /* Numbers and readouts: the sans with even-width figures (a mono read as a terminal). */
  --mono: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif;
  --sans: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif;
  --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  /* Paper grain for the panels: a static noise tile (cheap, unlike a backdrop blur). */
  --grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 .94 0 0 0 0 .84 0 0 0 .07 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
#ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--sans); color: var(--ink); font-size: 13px; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
#ui * { box-sizing: border-box; }
#ui [hidden] { display: none !important; }
/* Solid-ish panels: a backdrop blur over a full-screen canvas costs frames. */
.panel {
  position: absolute; pointer-events: auto; background: linear-gradient(180deg, rgba(40,31,24,0.9), rgba(22,17,13,0.9));
  border: 1px solid var(--line); border-radius: var(--radius); padding: 13px 15px;
  box-shadow: var(--shadow);
}
.ico { width: 14px; height: 14px; flex: none; vertical-align: -2px; }
.eyebrow .ico { width: 12px; height: 12px; margin-right: 5px; vertical-align: -2px; opacity: 0.85; }
.row label .ico { width: 13px; height: 13px; margin-right: 6px; vertical-align: -2px; color: var(--ink-faint); }
.logo-ant { width: 20px; height: 20px; color: var(--accent); flex: none; }
.eyebrow { font-family: var(--sans); font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: var(--ink-faint); }
.title { font-family: var(--sans); font-weight: 600; letter-spacing: 0.04em; font-size: 12px; color: var(--accent); }
.species { font-family: var(--serif); font-style: italic; color: var(--ink-dim); font-size: 13px; margin-top: 2px; }
.cname { font-family: var(--serif); color: var(--ink-faint); font-size: 12px; margin-top: 1px; }
.cname:empty { display: none; }
.brand { display: flex; align-items: center; gap: 7px; }
.wordmark-s { font-family: var(--serif); font-weight: 600; font-size: 19px; letter-spacing: 0.01em; color: var(--ink); }
.specimen { display: inline-block; margin-top: 6px; font-family: var(--sans); font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: var(--ink-dim); background: var(--track); border-radius: 999px; padding: 2px 8px; }

/* --- header: name, numbers, date */
#card { top: 14px; left: 14px; width: 320px; padding: 10px 14px 9px; }
#card .hrow { display: flex; align-items: center; gap: 8px; min-width: 0; }
#card .hrow .logo-ant { width: 18px; height: 18px; }
#card .cname { flex: 1; min-width: 0; margin: 0; font-family: var(--serif); font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#card .specimen { margin: 0; flex: none; }
#card .stats { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 6px; margin: 9px 0 7px; align-items: end; }
#card .stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#card .stat b { font-family: var(--sans); font-weight: 600; font-size: 19px; line-height: 1.05; font-variant-numeric: tabular-nums; }
#card .stat.big b { font-size: 30px; letter-spacing: -0.02em; }
#card .stat span { font-family: var(--sans); font-size: 11.5px; color: var(--ink-faint); white-space: nowrap; }
#card .stat b.warn { color: var(--danger); }
.roomrow b.warn { color: var(--danger); font-weight: 600; }
#tip .warnline { color: var(--danger); margin-top: 3px; font-size: 12px; }
#fooddays { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); white-space: nowrap; }
#fooddays.warn { color: var(--danger); }
#card .clock { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 12px; color: var(--ink-dim); white-space: nowrap; }
#card .clock #skyico { display: inline-flex; color: var(--accent); }
#card .clock #skyico .ico { width: 16px; height: 16px; }
#card .clock #sky { margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
#card .clock.sub { border: 0; padding-top: 3px; color: var(--ink-faint); }
#card .clock.sub #fooddays { margin-left: auto; }
#card .clock.sub .specimen { font-size: 10px; padding: 0 5px; }
.sparkkey { display: flex; gap: 12px; margin-top: 3px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.sparkkey span { display: inline-flex; align-items: center; gap: 5px; }
.sparkkey i { display: inline-block; width: 12px; height: 3px; border-radius: 2px; }
.sparkkey i.k-pop { background: rgba(239,230,214,0.9); }
.sparkkey i.k-food { background: rgba(226,180,92,0.8); }
#sparkbox canvas { display: block; width: 100%; height: 48px; }
.go { all: unset; cursor: pointer; font-family: var(--sans); font-size: 12px; font-weight: 500; color: var(--accent); white-space: nowrap; border-bottom: 1px solid rgba(231,183,95,0.45); }
.go:hover { color: var(--ink); }

/* --- the drawer: Guide, Colony and Notes as tabs */
#drawer { top: 14px; right: 14px; width: 300px; max-height: calc(100vh - 92px); display: flex; flex-direction: column; padding: 7px 8px 9px; }
#drawer .dhead { display: flex; align-items: center; gap: 4px; flex: none; }
#drawer .tabs { flex: 1; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; }
#drawer .tabs { background: var(--track); border-radius: 11px; padding: 3px; }
#drawer .tabs button { all: unset; box-sizing: border-box; cursor: pointer; position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 6px; border-radius: 8px; font-family: var(--sans); font-size: 12.5px; font-weight: 500; color: var(--ink-faint); }
#drawer .tabs button:hover { color: var(--ink); background: rgba(255,255,255,0.05); }
#drawer .tabs button.on { color: #20160c; background: var(--accent); font-weight: 600; }
#drawer .tabs button.on .dot { background: #20160c; }
#drawer .tabs .ico { width: 15px; height: 15px; }
#drawer .tabs .dot { position: absolute; top: 5px; right: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); display: none; }
#drawer .tabs .dot.on { display: block; }
#ui.m-watch #drawer .tabs [data-tab=guide] { display: none; }
#drawer .collapse { float: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; }
#drawer .collapse:hover { background: rgba(255,255,255,0.06); }
#drawer .collapse .ico { width: 15px; height: 15px; }
#drawer .pane { display: none; min-height: 0; overflow: auto; margin-top: 8px; padding: 2px 6px 0; }
#drawer[data-tab=guide] #brain, #drawer[data-tab=colony] #colony, #drawer[data-tab=notes] #journal { display: block; }
#drawer.collapsed .pane { display: none !important; }
.pane h3 { margin: 14px 0 8px; }
.pane > .body > .hint:first-child { margin-top: 10px; }
#journal ol { list-style: none; margin: 10px 0 4px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
#journal li { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--ink-dim); line-height: 1.42; }
#journal li { padding-left: 10px; border-left: 2px solid var(--line); }
#journal li:first-child { border-left-color: var(--accent); }
#journal li time { font-family: var(--sans); font-size: 11.5px; font-weight: 500; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
#journal li:first-child span { color: var(--ink); }
#journal li b { color: var(--accent); font-weight: 500; }
.btns.one { grid-template-columns: 1fr; margin-top: 6px; }

/* --- one-line strip (phones, where the card is hidden) */
#strip { display: none; position: absolute; top: 8px; left: 8px; right: 8px; pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 7px 12px; box-shadow: var(--shadow); gap: 10px; align-items: baseline; font-family: var(--mono); font-size: 12px; color: var(--ink-dim); white-space: nowrap; overflow: hidden; }
#strip b { font-size: 16px; font-weight: 600; color: var(--ink); }
#strip .ico { color: var(--accent); width: 18px; height: 18px; align-self: center; }
#strip #s-day { margin-left: auto; }

/* --- colony brain */
#dormant { display: none; margin-top: 8px; font-size: 12px; color: var(--ink-dim); line-height: 1.45; }
#brain.dormant #dormant { display: block; }
#brain.dormant .body { opacity: 0.4; pointer-events: none; filter: saturate(0.4); }
.row { display: grid; grid-template-columns: 66px 1fr; align-items: center; gap: 8px; margin: 6px 0; border-radius: 6px; }
.row label { font-size: 12px; color: var(--ink-dim); }
.row.slider { grid-template-columns: 66px 1fr auto; }
.row.slider span { font-family: var(--mono); font-size: 12px; color: var(--ink-dim); text-align: right; white-space: nowrap; }
.subline { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin: -2px 0 6px 74px; min-height: 13px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 3px; background: var(--track); border-radius: 11px; }
.seg button { all: unset; cursor: pointer; text-align: center; font-family: var(--sans); font-size: 12px; font-weight: 500; padding: 5px 4px; border-radius: 8px; color: var(--ink-faint); white-space: nowrap; transition: background 0.12s, color 0.12s; }
.seg button:hover { color: var(--ink); background: rgba(255,255,255,0.06); }
.seg button.on { color: #20160c; background: var(--accent); font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 3px rgba(0,0,0,0.3); }
.share { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin: -2px 0 6px 74px; }
.share .track { height: 4px; background: var(--track); border-radius: 3px; overflow: hidden; }
.share .track i { display: block; height: 100%; background: var(--accent); opacity: 0.75; transition: width 0.4s; }
.share span { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); min-width: 92px; text-align: right; white-space: nowrap; }
.btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.btn { all: unset; cursor: pointer; border: 1px solid rgba(255,236,210,0.12); border-radius: var(--r-btn); padding: 8px 10px; font-size: 12.5px; font-weight: 500; text-align: center; color: var(--ink); background: rgba(255,244,228,0.04); transition: background 0.12s, border-color 0.12s; }
.btn:hover { border-color: rgba(231,183,95,0.5); background: var(--accent-dim); }
.btn.on { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
.btn.disabled { opacity: 0.45; cursor: not-allowed; }
.btn.disabled:hover { border-color: var(--line); background: none; }
.btn:focus-visible, .seg button:focus-visible, .collapse:focus-visible, .chip:focus-visible, .go:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn.danger { border-color: var(--danger); color: var(--danger); background: rgba(224,122,95,0.12); }
.queue { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 14px; }
.qlabel { font-family: var(--mono); font-size: 12px; color: var(--ink-faint); margin-right: 2px; }
.chip { all: unset; cursor: pointer; font-family: var(--sans); font-size: 12px; color: var(--ink); background: var(--track); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; }
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
#bar { left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; padding: 6px; border-radius: 16px; width: max-content; max-width: calc(100vw - 24px); }
#bar .seg button { padding: 7px 11px; font-size: 12.5px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 32px; box-sizing: border-box; }
#bar .seg button .ico { width: 15px; height: 15px; }
#bar .seg { grid-auto-columns: auto; }
#keys .perf { margin-top: 8px; font-family: var(--mono); font-size: 11px; color: var(--ink-faint); text-align: right; }

/* --- documentary caption (stays in cinema mode) */
#caption { position: absolute; left: 22px; bottom: 84px; display: none; pointer-events: none; max-width: min(560px, calc(100vw - 44px)); }
#caption .line { font-family: var(--serif); font-style: italic; font-size: 17px; line-height: 1.4; color: var(--ink); margin-top: 4px; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9); }
#caption .eyebrow { color: var(--accent); text-shadow: 0 1px 6px rgba(0,0,0,0.85); }
#caption .line.fresh { animation: capin .7s ease; }
@keyframes capin { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

#keys { left: 50%; bottom: 74px; transform: translateX(-50%); width: 320px; z-index: 2; background: var(--panel-solid); }
#keys dl { display: grid; grid-template-columns: 104px 1fr; gap: 5px 10px; margin: 8px 0 12px; font-size: 12px; }
#keys dt { font-family: var(--mono); font-size: 12px; color: var(--accent); }
#keys dd { margin: 0; color: var(--ink-dim); }
#keys .langrow { grid-template-columns: 80px 1fr; margin: 0 0 10px; }
#keys .vol input { width: 100%; height: 28px; accent-color: var(--accent); margin: 0; cursor: pointer; }
#keys #report { display: block; margin: 8px auto 0; font-size: 12px; color: var(--ink-faint); }
#keys .version { margin-top: 4px; text-align: center; font-size: 10.5px; color: var(--ink-faint); opacity: 0.7; }
#keys #fullscreen { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
#keys { max-height: calc((100vh - 160px) / var(--uizoom, 1)); overflow-y: auto; }
#keys .btn { display: block; width: 100%; text-align: center; }

#inspect { left: 14px; top: 160px; width: 320px; display: none; }
#inspect .name { font-family: var(--serif); font-size: 17px; font-weight: 600; margin: 4px 0 8px; }
#inspect dl { display: grid; grid-template-columns: 74px 1fr; gap: 4px 8px; margin: 0; }
#inspect dt { color: var(--ink-faint); font-size: 12px; }
#inspect dd { margin: 0; font-size: 12px; }
/* The corner readout: what is under the pointer (the inspector sits above it). */
#here { position: absolute; left: 14px; bottom: 14px; min-width: 200px; max-width: 340px; display: none; pointer-events: none; padding: 8px 12px 9px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); font-size: 12px; line-height: 1.45; color: var(--ink-dim); }
#here b { display: block; font-family: var(--sans); font-weight: 600; font-size: 12.5px; color: var(--ink); }
#here span { display: block; }
@media (max-width: 1400px) { #here { bottom: 74px; } }
@media (hover: none), (max-width: 760px), (max-height: 500px) { #here { display: none !important; } }
#ui.cine #here, #ui.montage #here, #ui.cinema #here, #ui.doc #here { display: none !important; }
#inspect.lifecard { border-color: rgba(232,138,110,0.55); }
#inspect.lifecard p { margin: 0; color: var(--ink-dim); line-height: 1.45; font-size: 12px; }

#prompt { left: 50%; top: 44%; transform: translateX(-50%); text-align: center; padding: 16px 22px; width: max-content; max-width: min(460px, calc(100vw - 24px)); }
#prompt h2 { margin: 6px 0 6px; font-weight: 500; font-size: 20px; }
#prompt p { margin: 0; color: var(--ink-dim); line-height: 1.5; }
#prompt .prompt-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
#prompt .prompt-btns .btn { padding: 8px 14px; }

#toasts { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; justify-content: center; width: min(560px, calc(100vw - 700px)); min-width: min(380px, calc(100vw - 24px)); pointer-events: none; }
.toast { background: linear-gradient(180deg, rgba(42,33,25,0.96), rgba(26,20,15,0.96)); border: 1px solid var(--line); border-radius: 12px; padding: 9px 16px 9px 30px; position: relative; font-size: 13.5px; line-height: 1.4; text-align: center; animation: toast 5s forwards; box-shadow: var(--shadow); }
.toast::before { content: ''; position: absolute; left: 13px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.toast b { color: var(--accent); font-weight: 500; }
.toast.toastgo { pointer-events: auto; cursor: pointer; }
.toast.toastgo:hover { border-color: var(--accent); }
.toast.toastgo::after { content: '›'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--accent); opacity: .7; font-size: 15px; }
@keyframes toast { 0% { opacity: 0; transform: translateY(-6px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }

#tip { position: absolute; pointer-events: none; background: var(--panel-solid); border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; font-size: 12px; display: none; white-space: nowrap; box-shadow: var(--shadow); }
#tip b { font-family: var(--sans); color: var(--accent); font-weight: 600; font-size: 12.5px; }
#tip .dim { color: var(--ink-faint); }
#tip .fact { margin-top: 4px; max-width: 240px; white-space: normal; color: var(--ink-faint); font-style: italic; line-height: 1.35; }

#over { left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; padding: 22px 28px; display: none; width: max-content; max-width: min(440px, calc(100vw - 24px)); }
#over h2 { margin: 6px 0 8px; font-weight: 500; }
#season { position: fixed; left: 50%; top: 17%; transform: translateX(-50%); text-align: center; pointer-events: none; opacity: 0; z-index: 30; }
#season.on { animation: seasonCard 4.2s ease forwards; }
#season .s1 { font-family: var(--serif); font-size: clamp(34px, 6vw, 58px); letter-spacing: 0.14em; text-transform: uppercase; color: #f4ead7; text-shadow: 0 2px 18px rgba(0,0,0,0.55); }
#season .s2 { font-family: var(--serif); font-style: italic; font-size: 15px; color: #e3d6bc; margin-top: 4px; text-shadow: 0 1px 10px rgba(0,0,0,0.6); }
@keyframes seasonCard { 0% { opacity: 0; transform: translateX(-50%) translateY(6px); } 18% { opacity: 1; transform: translateX(-50%); } 78% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { #season.on { animation-duration: 3s; } }
/* The landing sequence and the founding montage: panels out of the way, letterbox for the time-lapse. */
#ui.cine .panel, #ui.cine #bar, #ui.cine #toasts, #ui.cine #tip, #ui.cine #caption, #ui.cine #strip, #ui.cine #scale { display: none !important; }
/* Just after the landing, while its title card fades: the panels come back after it. */
#ui.settling .panel:not(#prompt):not(#over), #ui.settling #bar, #ui.settling #toasts, #ui.settling #strip, #ui.settling #scale, #ui.settling #here { display: none !important; }
#ui.montage::before, #ui.montage::after { content: ''; position: fixed; left: 0; right: 0; height: 9vh; background: #050302; z-index: 20; pointer-events: none; }
#ui.montage::before { top: 0; }
#ui.montage::after { bottom: 0; }
#ui.montage .panel, #ui.montage #toasts, #ui.montage #tip, #ui.montage #caption, #ui.montage #strip { display: none !important; }
#ui.montage #bar { display: none !important; }
#cineline { position: fixed; left: 50%; bottom: 12vh; transform: translateX(-50%); max-width: min(620px, calc(100vw - 40px)); text-align: center; font-family: var(--serif); font-style: italic; font-size: 17px; line-height: 1.45; color: #efe4cc; text-shadow: 0 1px 10px rgba(0,0,0,0.8); opacity: 0; transition: opacity 0.8s ease; pointer-events: none; z-index: 22; }
#cineline.on { opacity: 1; }
#ui:not(.cine):not(.montage) #cineline { display: none; }
#cinedate { position: fixed; left: 50%; top: calc(9vh + 18px); transform: translateX(-50%); font-family: var(--sans); font-weight: 500; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #d9c9a8; text-shadow: 0 1px 8px rgba(0,0,0,0.8); display: none; z-index: 22; pointer-events: none; }
#ui.montage #cinedate { display: block; }
#cineskip { position: fixed; right: 22px; bottom: 11vh; display: none; z-index: 23; }
/* The UI layer lets clicks through to the slice; its controls must still take them. */
#ui button, #ui a, #ui input, #ui select, #ui label { pointer-events: auto; }
#ui.montage #scale { display: none !important; }
#ui.cine #cineskip, #ui.montage #cineskip { display: inline-flex; }
#review { left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 20px 26px; display: none; width: max-content; max-width: min(460px, calc(100vw - 24px)); z-index: 25; box-shadow: 0 0 0 100vmax rgba(8,6,4,0.45), 0 10px 30px rgba(0,0,0,0.3); }
#review h2 { margin: 4px 0 10px; font-weight: 500; font-family: var(--serif); }
#review dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 0 0 12px; font-size: 13px; }
#review dt { color: var(--ink-faint); }
#review dd { margin: 0; color: var(--ink); }
#review p { color: var(--ink-dim); margin: 0 0 12px; line-height: 1.5; font-size: 13px; }
#over p { color: var(--ink-dim); margin: 0 0 14px; line-height: 1.5; }
#over .btns { grid-auto-flow: column; grid-template-columns: none; justify-content: center; }
.btn .ico { width: 14px; height: 14px; vertical-align: -2px; margin-right: 6px; }

/* --- the nest's time-lapse */
#replay { left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30; padding: 16px 18px 14px; width: min(1000px, calc(100vw - 24px)); box-sizing: border-box;
  box-shadow: 0 0 0 100vmax rgba(8,6,4,0.62), 0 14px 40px rgba(0,0,0,0.45); }
#replay .rp-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
#replay h2 { margin: 2px 0 0; font-family: var(--serif); font-weight: 500; font-size: 20px; }
#replay .rp-film canvas { display: block; width: 100%; aspect-ratio: 16 / 9; height: auto; border-radius: 10px; background: #120d09; }
#replay.tall { width: auto; }
#replay.tall .rp-film canvas { width: auto; height: min(68vh, 760px); aspect-ratio: 9 / 16; margin: 0 auto; }
#replay .rp-ctl { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 12px; margin-top: 12px; }
#replay.tall .rp-ctl { grid-template-columns: auto 1fr auto; min-width: 380px; }
#replay.tall #rp-rec { grid-column: 1 / -1; }
#replay .rp-ctl .seg button { padding: 6px 10px; }
#replay .rp-ctl input[type=range] { width: 100%; accent-color: var(--accent); }
#replay .btn.disabled { opacity: 0.45; pointer-events: none; }
@media (max-width: 560px) { #replay .rp-ctl, #replay.tall .rp-ctl { grid-template-columns: auto 1fr; min-width: 0; } #replay #rp-rec, #replay #rp-fmt { grid-column: 1 / -1; } }

/* --- the colony, read-only (watch mode) */
#cdormant { display: none; margin-top: 8px; font-size: 12px; color: var(--ink-dim); line-height: 1.45; }
#colony.dormant #cdormant { display: block; }
#colony.dormant .body { display: none; }
.trow { display: grid; grid-template-columns: 96px 1fr 34px; align-items: center; gap: 8px; margin: 5px 0; font-size: 12px; color: var(--ink-dim); }
.trow .tl { display: inline-flex; align-items: center; gap: 6px; }
.trow .ico { color: var(--ink-faint); }
.trow .track { height: 5px; background: var(--track); border-radius: 3px; overflow: hidden; }
.trow .track i { display: block; height: 100%; width: 0; background: var(--accent); opacity: 0.8; transition: width 0.5s; }
.trow b { font-family: var(--sans); font-weight: 600; text-align: right; color: var(--ink); }
.broodrow { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--ink-faint); }
.broodrow span { display: inline-flex; align-items: center; gap: 4px; }
.broodrow b { font-family: var(--sans); font-weight: 600; color: var(--ink); }
.roomrow { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 10px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 12.5px; }
.roomrow:hover { background: rgba(255,255,255,0.05); }
.roomrow i { grid-row: 1 / 3; width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; filter: brightness(1.4) saturate(1.2); }
.roomrow span { color: var(--ink); }
.roomrow em { font-style: normal; font-family: var(--mono); color: var(--ink-faint); }
.roomrow small { grid-column: 2 / 4; font-family: var(--mono); font-size: 11px; color: var(--ink-faint); }
.roomrow.dig small { color: var(--accent); }

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
.linkbtn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--ink-dim); min-height: 28px; padding: 0 4px; }
.linkbtn:hover { color: var(--accent); }

/* --- title */
#title { position: absolute; inset: 0; display: none; align-items: flex-start; justify-content: center; pointer-events: auto; overflow: auto;
  background: radial-gradient(ellipse at 50% 46%, rgba(11,8,6,0.25) 0%, rgba(11,8,6,0.72) 62%, rgba(11,8,6,0.92) 100%); }
#title .inner { width: min(760px, calc(100vw - 32px)); text-align: center; padding: 24px 0; margin: auto 0; }
#title .logo .logo-ant { width: 72px; height: 72px; }
#title .wordmark { margin: 2px 0 6px; font-family: var(--serif); font-weight: 600; font-size: clamp(46px, 8vw, 84px); line-height: 1; letter-spacing: -0.01em; color: var(--ink); text-shadow: 0 2px 24px rgba(0,0,0,0.6); }
#title .tagline { font-family: var(--serif); font-style: italic; font-size: 19px; color: var(--ink-dim); }
#title .latin { margin-top: 8px; display: inline-flex; gap: 8px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em; color: var(--ink-faint); }
#title .latin i { font-family: var(--serif); font-size: 13px; letter-spacing: 0; color: var(--ink-dim); }
#title .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0 16px; }
#title .tempo { margin: 26px auto 0; max-width: 560px; }
#title .tempo-row { display: flex; align-items: center; justify-content: center; gap: 12px; }
#title .tempo-label { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
#title .tempo .seg { flex: 0 1 420px; }
#title .tempo .seg button { padding: 7px 10px; font-size: 12.5px; }
#title .tempo-desc { margin-top: 7px; min-height: 2.9em; font-size: 12.5px; line-height: 1.45; color: var(--ink-dim); }
@media (max-width: 560px) { #title .tempo-row { flex-direction: column; gap: 6px; } #title .tempo .seg { width: 100%; flex: none; } }
.mode { all: unset; box-sizing: border-box; cursor: pointer; position: relative; text-align: left; padding: 20px 22px 18px; border: 1px solid var(--line); border-radius: 18px;
  background: linear-gradient(180deg, rgba(44,34,26,0.92), rgba(22,17,13,0.92)); box-shadow: var(--shadow); transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s; }
.mode:hover, .mode:focus-visible { border-color: rgba(231,183,95,0.7); transform: translateY(-2px); box-shadow: var(--shadow), 0 0 0 4px var(--accent-dim); }
.mode .ico { width: 26px; height: 26px; color: var(--accent); }
.mode h3 { margin: 10px 0 6px; font-family: var(--serif); font-weight: 600; font-size: 24px; color: var(--ink); }
.mode p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-dim); }
.mode.last::before { content: ''; position: absolute; top: 12px; right: 12px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
#title #resume { display: block; width: 100%; padding: 11px; font-size: 13px; margin-bottom: 14px; }
#slots { margin: -6px 0 14px; text-align: left; }
#slots .linkbtn { font-size: 12px; }
#slots #slot-import { display: block; margin: 6px auto 0; color: var(--ink-faint); }
.slot-list { display: grid; gap: 6px; margin: 8px 0 4px; max-height: 220px; overflow-y: auto; }
.slot { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: rgba(22,17,13,0.82); }
.slot-txt { display: grid; gap: 2px; min-width: 0; }
.slot-txt b { font-family: var(--serif); font-weight: 600; font-size: 13.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slot-txt span { font-size: 11.5px; color: var(--ink-faint); }
.slot .btn { padding: 5px 8px; font-size: 11.5px; }
@media (max-width: 560px) { .slot { grid-template-columns: 1fr 1fr 1fr; } .slot-txt { grid-column: 1 / -1; } }
.sitecard { display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; gap: 8px; margin: 4px 0 16px; padding: 16px 12px; text-align: left; border: 1px solid var(--line); border-radius: 16px; pointer-events: auto;
  background: linear-gradient(180deg, rgba(36,28,21,0.85), rgba(20,15,11,0.85)); box-shadow: var(--shadow); }
.sitenav { all: unset; cursor: pointer; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--ink-dim); }
.sitenav:hover { color: var(--accent); background: rgba(255,255,255,0.05); }
.sitenav .ico { width: 18px; height: 18px; }
.sitenav.next .ico { transform: scaleX(-1); }
.sitename { font-family: var(--serif); font-weight: 600; font-size: 20px; color: var(--ink); }
.sitedesc { margin-top: 4px; font-size: 13px; line-height: 1.45; color: var(--ink-dim); }
.sitesp { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.sitesp i { font-family: var(--serif); font-size: 13px; color: var(--ink-dim); }
.traits { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.traits li { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--track); color: var(--ink-dim); }
.traits li b { margin-right: 5px; font-family: var(--mono); }
.traits li.pro { border-color: rgba(169,196,138,0.45); background: rgba(169,196,138,0.1); }
.traits li.pro b { color: var(--ok); }
.traits li.con { border-color: rgba(232,134,106,0.45); background: rgba(232,134,106,0.1); }
.traits li.con b { color: var(--danger); }
.title-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 18px; font-family: var(--mono); font-size: 12px; color: var(--ink-faint); }
.title-foot .seg button { padding: 4px 10px; }
#ui.titled #bar, #ui.titled #keys, #ui.titled #toasts, #ui.titled #caption { display: none !important; }

/* Shorter screens (a 720p laptop): the title compacts so it all fits without scrolling. */
@media (max-height: 820px) and (min-width: 761px) {
  #title .inner { padding: 12px 0; }
  #title .logo .logo-ant { width: 48px; height: 48px; }
  #title .wordmark { font-size: clamp(40px, 6.4vw, 64px); margin: 0 0 4px; }
  #title .tagline { font-size: 17px; }
  #title .modes { margin: 16px 0 12px; gap: 12px; }
  .mode { padding: 14px 18px 13px; }
  .mode h3 { font-size: 21px; margin: 6px 0 4px; }
  .mode p { font-size: 12.5px; line-height: 1.45; }
  .sitecard { padding: 11px 10px; margin-bottom: 10px; }
  .sitedesc { font-size: 12.5px; }
  .traits { margin-top: 8px; gap: 5px; }
  .traits li { padding: 3px 9px; }
}

/* --- phases: before landing there is only the meadow and the question */
#ui.ph-choose #drawer, #ui.ph-choose #card, #ui.ph-choose #strip { display: none !important; }

.slowtag { font-family: var(--sans); font-style: normal; font-size: 11px; letter-spacing: .04em; color: var(--accent); opacity: .85; margin-left: 6px; }
/* --- documentary: the panels step aside for the picture, the controls fade back */
#card, #drawer, #inspect { transition: opacity .6s ease, transform .6s ease; }
#bar { transition: opacity .5s ease; }
#ui.doc #card, #ui.doc #drawer, #ui.doc #inspect { opacity: 0; transform: translateY(-8px); pointer-events: none; }
#ui.doc #bar { opacity: .32; }
#ui::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1.2s ease; background: radial-gradient(ellipse 75% 70% at 50% 48%, transparent 55%, rgba(8,5,3,0.42) 100%); }
#ui.doc::before { opacity: 1; }
/* gamepad: the crosshair A picks at, and the button the d-pad is on */
#padcross { display: none; } #ui.padcross #padcross { display: block; position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 1.5px solid rgba(231,183,95,0.75); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.35); pointer-events: none; }
.padfocus { outline: 2px solid var(--accent) !important; outline-offset: 2px; }
#dip { position: absolute; inset: 0; background: #0a0705; opacity: 0; pointer-events: none; }
#ui.paused::after { content: attr(data-paused); position: absolute; top: 70px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: rgba(20,15,11,0.72); border: 1px solid var(--line); color: var(--ink-faint); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; pointer-events: none; }
@media (max-width: 700px) { #ui.paused::after { top: 102px; } }
#ui.doc #scale { opacity: 0; transition: opacity .6s ease; }
#ui.doc #bar:hover, #ui.doc #bar:focus-within { opacity: 1; }
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
  #drawer .tabs button { min-height: 42px; }
  #drawer .collapse { width: 42px; height: 42px; }
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
  /* One sheet at a time: the drawer steps aside for settings, the year's review and the end. */
  #ui.ph-failed #drawer, #ui.modal #drawer, #ui:has(> #keys:not([hidden])) #drawer { display: none !important; }
  #tabs [data-tab] { min-width: 44px; justify-content: center; }
  #strip { display: flex; }
  #bar { left: 8px; right: 8px; bottom: 8px; transform: none; width: auto; max-width: none; display: grid; grid-template-columns: auto 1fr; gap: 6px; padding: 6px; }
  #bar #speeds { grid-column: 1 / -1; }
  #bar .seg button { padding: 8px 4px; }
  #drawer { top: auto; bottom: 126px; left: 8px; right: 8px; width: auto; max-height: 50vh; }
  #keys { bottom: 126px; left: 8px; right: 8px; width: auto; transform: none; max-height: calc(100vh - 184px); overflow: auto; }
  #toasts { top: 50px; width: calc(100vw - 24px); min-width: 0; }
  .toast { font-size: 12px; }
  #inspect { top: 50px; bottom: auto; left: 8px; right: 8px; width: auto; padding: 8px 12px; }
  #inspect dl { grid-template-columns: 74px 1fr 74px 1fr; }
  #caption { left: 12px; right: 12px; bottom: 166px; }
  #caption .line { font-size: 13px; }
  #ui.cinema #caption { bottom: 20px; }
  #prompt { top: 30%; }
  #winter { bottom: 112px; }
  #bar .lbl { display: none; }
  #scale { top: auto; bottom: 176px; right: 12px; }
  /* The open sheet covers that corner: the scale bar steps aside. */
  #ui:has(#drawer:not(.collapsed):not([hidden])) #scale { display: none; }
  /* While an ant is followed its card holds the top; news drops below it. */
  #inspect[style*="block"] ~ #toasts { top: 210px; }
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
  #drawer { top: 8px; right: 8px; width: 280px; max-height: calc(100vh - 72px); }
  #bar { bottom: 6px; padding: 5px 8px; }
  #inspect { top: 50px; bottom: auto; left: 8px; }
  #toasts { top: 50px; left: 8px; transform: none; width: calc(100vw - 300px); min-width: 0; align-items: flex-start; }
  #keys { bottom: 64px; max-height: calc(100vh - 80px); overflow: auto; }
  #caption { bottom: 66px; }
  #prompt { top: 24%; }
  #bar .lbl { display: none; }
  #scale { bottom: 64px; }
  #title .modes { margin: 14px 0 10px; }
  #title .logo { display: none; }
}
`;
