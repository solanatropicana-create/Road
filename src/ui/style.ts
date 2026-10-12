/** UI styles, injected at boot so the build stays a single script. */
export const CSS = `
:root {
  --ink: #efe6d6;
  --ink-dim: rgba(239, 230, 214, 0.62);
  --ink-faint: rgba(239, 230, 214, 0.38);
  --panel: rgba(16, 12, 9, 0.74);
  --panel-solid: #15100c;
  --line: rgba(239, 230, 214, 0.12);
  --accent: #e2b45c;
  --accent-dim: rgba(226, 180, 92, 0.18);
  --danger: #e07a5f;
  --ok: #9cc27a;
  --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif;
}
#ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--sans); color: var(--ink); font-size: 13px; }
#ui * { box-sizing: border-box; }
#ui [hidden] { display: none !important; }
.panel {
  position: absolute; pointer-events: auto; background: var(--panel);
  border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}
.eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
.title { font-family: var(--mono); font-weight: 600; letter-spacing: 0.22em; font-size: 11px; color: var(--accent); }
.species { font-style: italic; color: var(--ink-dim); font-size: 12px; margin-top: 2px; }

#card { top: 14px; left: 14px; width: 248px; }
#card .pop { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 2px; }
#card .pop b { font-family: var(--mono); font-weight: 500; font-size: 34px; line-height: 1; letter-spacing: -0.02em; }
#card .pop span { color: var(--ink-dim); }
#card .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 6px; margin-top: 10px; }
#card .grid div { display: flex; flex-direction: column; gap: 1px; }
#card .grid b { font-family: var(--mono); font-weight: 500; font-size: 15px; }
#card .grid b.warn { color: var(--danger); }
#card canvas { display: block; width: 100%; height: 38px; margin-top: 10px; }
#card .legend { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 10px; color: var(--ink-faint); }
#card .legend span { display: inline-flex; align-items: center; gap: 4px; }
#card .legend i { width: 8px; height: 8px; border-radius: 2px; filter: brightness(1.5) saturate(1.2); }
#card .notes { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
#card .notes-head { display: flex; justify-content: space-between; align-items: baseline; }
#card .notes ol { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
#card .notes.open ol { max-height: 260px; overflow: auto; }
#card .notes li { display: grid; grid-template-columns: 54px 1fr; gap: 6px; font-size: 11px; color: var(--ink-dim); line-height: 1.35; }
#card .notes li time { font-family: var(--mono); font-size: 10px; color: var(--ink-faint); font-variant-numeric: tabular-nums; padding-top: 1px; }
#card .notes li:first-child span { color: var(--ink); }
#card .notes li b { color: var(--accent); font-weight: 500; }
#card .clock { display: flex; justify-content: space-between; margin-top: 8px; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); }

#brain { top: 14px; right: 14px; width: 272px; max-height: calc(100vh - 100px); overflow: auto; }
#brain h3 { margin: 14px 0 8px; }
#brain h3:first-of-type { margin-top: 10px; }
.row { display: grid; grid-template-columns: 62px 1fr; align-items: center; gap: 8px; margin: 6px 0; }
.row label { font-size: 12px; color: var(--ink-dim); }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg button { all: unset; cursor: pointer; text-align: center; font-family: var(--mono); font-size: 10px; padding: 5px 0; color: var(--ink-faint); letter-spacing: 0.04em; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { color: var(--ink); background: rgba(255,255,255,0.04); }
.seg button.on { color: #1a120b; background: var(--accent); font-weight: 600; }
.share { height: 3px; background: var(--line); border-radius: 2px; margin: -2px 0 4px 70px; overflow: hidden; }
.share i { display: block; height: 100%; background: var(--accent); opacity: 0.7; transition: width 0.4s; }
.btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.btn { all: unset; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 7px 8px; font-size: 12px; text-align: center; color: var(--ink); }
.btn:hover { border-color: rgba(226,180,92,0.5); background: var(--accent-dim); }
.btn.on { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
.queue { margin-top: 8px; font-family: var(--mono); font-size: 11px; color: var(--ink-dim); min-height: 14px; }
.hint { font-size: 11px; color: var(--ink-faint); line-height: 1.45; margin-top: 8px; }
input[type=range] { width: 100%; accent-color: var(--accent); }

#bar { left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 8px 10px; }
#bar .seg button { padding: 6px 10px; font-size: 11px; }
#bar .perf { font-family: var(--mono); font-size: 10px; color: var(--ink-faint); min-width: 64px; text-align: right; }

#caption { position: absolute; left: 22px; bottom: 22px; display: none; pointer-events: none; max-width: min(520px, calc(100vw - 44px)); }
#caption .line { font-family: var(--mono); font-size: 13px; color: var(--ink); margin-top: 4px; text-shadow: 0 1px 8px rgba(0,0,0,0.7); }
#caption .eyebrow { color: var(--accent); text-shadow: 0 1px 6px rgba(0,0,0,0.7); }
#keys { left: 50%; bottom: 74px; transform: translateX(-50%); width: 300px; }
#keys dl { display: grid; grid-template-columns: 96px 1fr; gap: 5px 10px; margin: 8px 0 12px; font-size: 12px; }
#keys dt { font-family: var(--mono); font-size: 11px; color: var(--accent); }
#keys dd { margin: 0; color: var(--ink-dim); }
#keys .btn { display: block; text-align: center; }
.btn.danger { border-color: var(--danger); color: var(--danger); background: rgba(224,122,95,0.12); }
#inspect { left: 14px; bottom: 14px; width: 248px; display: none; }
#inspect .name { font-family: var(--mono); font-size: 15px; margin: 4px 0 8px; }
#inspect dl { display: grid; grid-template-columns: 70px 1fr; gap: 4px 8px; margin: 0; }
#inspect dt { color: var(--ink-faint); font-size: 11px; }
#inspect dd { margin: 0; font-size: 12px; }

#prompt { left: 50%; top: 18%; transform: translateX(-50%); text-align: center; padding: 16px 22px; max-width: 440px; }
#prompt h2 { margin: 6px 0 6px; font-weight: 500; font-size: 20px; }
#prompt p { margin: 0; color: var(--ink-dim); line-height: 1.5; }
#prompt .prompt-btns { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
#prompt .prompt-btns .btn { padding: 7px 14px; }

#toasts { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
.toast { background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; font-size: 12px; animation: toast 5s forwards; backdrop-filter: blur(8px); }
.toast b { color: var(--accent); font-weight: 500; }
@keyframes toast { 0% { opacity: 0; transform: translateY(-6px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }

#tip { position: absolute; pointer-events: none; background: var(--panel-solid); border: 1px solid var(--line); border-radius: 6px; padding: 6px 9px; font-size: 11px; display: none; white-space: nowrap; }
#tip b { font-family: var(--mono); color: var(--accent); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; }
#tip .fact { margin-top: 4px; max-width: 230px; white-space: normal; color: var(--ink-faint); font-style: italic; line-height: 1.35; }

#over { left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; padding: 22px 28px; display: none; max-width: 420px; }
#over h2 { margin: 6px 0 8px; font-weight: 500; }
#over p { color: var(--ink-dim); margin: 0 0 14px; line-height: 1.5; }

@media (max-width: 760px) {
  #card { width: 200px; padding: 10px 12px; }
  #card .pop b { font-size: 26px; }
  #brain { top: auto; bottom: 66px; right: 8px; left: 8px; width: auto; max-height: 38vh; }
  #brain.collapsed .body { display: none; }
  #bar { bottom: 8px; left: 8px; right: 8px; transform: none; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 6px; }
  #bar .seg button { padding: 6px 8px; }
  #bar .perf { display: none; }
  #brain { bottom: 104px; }
  #keys { bottom: 104px; width: auto; left: 8px; right: 8px; transform: none; }
  #toasts { top: 232px; width: calc(100vw - 32px); }
  #inspect { display: none !important; }
  #caption { bottom: 120px; left: 14px; }
  #card .notes, #card .legend { display: none; }
}
.collapse { all: unset; cursor: pointer; float: right; font-family: var(--mono); font-size: 10px; color: var(--ink-faint); }
`;
