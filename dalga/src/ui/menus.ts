import { formatNum } from '../core/math';
import { BOSSES, islandRadiusAt, WORLD } from '../data/world';
import type { SaveData } from '../game/save';
import { COIN } from './icons';

const el = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

/** Generic modal card. Buttons close the card unless their handler returns false. */
export class Modal {
  readonly root: HTMLElement;
  private card: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el(`<div class="overlay"><div class="card"></div></div>`);
    this.card = this.root.querySelector('.card')!;
    parent.appendChild(this.root);
  }
  show(html: string, buttons: { label: string; cls?: string; fn?: () => boolean | void }[]) {
    this.card.innerHTML = `${html}<div class="row"></div>`;
    const row = this.card.querySelector('.row')!;
    for (const b of buttons) {
      const btn = el(`<button class="btn ${b.cls ?? ''} stroke tap">${b.label}</button>`);
      btn.addEventListener('click', () => {
        const keep = b.fn?.() === false;
        if (!keep) this.hide();
      });
      row.appendChild(btn);
    }
    this.root.classList.add('show');
  }
  hide() {
    this.root.classList.remove('show');
  }
  get open() {
    return this.root.classList.contains('show');
  }
}

/** Full world chart: zones, islands, ports, boss lairs. */
export class WorldMap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  constructor(parent: HTMLElement) {
    this.root = el(`<div class="overlay"><div class="card" style="width:min(96vw,620px);padding:12px">
      <h1 class="stroke" style="font-size:28px">Dünya Haritası</h1>
      <canvas style="width:100%;aspect-ratio:1;border-radius:50%;display:block;background:#123"></canvas>
      <p class="hint" style="margin-top:8px">İçe doğru güvenli sular, dışa doğru zor düşmanlar ve daha büyük ödüller. ☠ boss inleri.</p>
      <div class="row"><button class="btn blue stroke tap">Kapat</button></div></div></div>`);
    this.canvas = this.root.querySelector('canvas')!;
    this.root.querySelector('button')!.addEventListener('click', () => this.root.classList.remove('show'));
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.root.classList.remove('show'); });
    parent.appendChild(this.root);
  }

  show(s: SaveData, px: number, pz: number, yaw: number) {
    this.root.classList.add('show');
    const S = 900;
    this.canvas.width = this.canvas.height = S;
    const g = this.canvas.getContext('2d')!;
    const R = WORLD.radius * 1.04;
    const k = S / 2 / R;
    const tx = (x: number) => S / 2 + x * k;
    const tz = (z: number) => S / 2 + z * k;
    for (let i = WORLD.zones.length - 1; i >= 0; i--) {
      const z = WORLD.zones[i];
      g.fillStyle = z.deep;
      g.beginPath(); g.arc(S / 2, S / 2, z.r1 * k, 0, Math.PI * 2); g.fill();
    }
    for (const isl of WORLD.islands) {
      g.fillStyle = isl.portId ? '#ffe9a8' : '#d9cc98';
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = islandRadiusAt(isl, a);
        const x = tx(isl.x + Math.cos(a) * r), y = tz(isl.z + Math.sin(a) * r);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '28px "Lilita One", sans-serif';
    for (const z of WORLD.zones) {
      const y = tz(-(z.r0 + z.r1) / 2);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText(`${z.name}`, S / 2, y - 12);
      g.font = '20px "Lilita One", sans-serif';
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillText(`Seviye ${z.levelMin}-${z.levelMax}`, S / 2, y + 14);
      g.font = '28px "Lilita One", sans-serif';
    }
    for (const p of WORLD.ports) {
      const known = s.ports.includes(p.id);
      g.font = '34px sans-serif';
      g.globalAlpha = known ? 1 : 0.45;
      g.fillText('⚓', tx(p.x), tz(p.z));
      g.globalAlpha = 1;
      g.font = '20px "Lilita One", sans-serif';
      g.fillStyle = known ? '#fff' : 'rgba(255,255,255,.5)';
      g.fillText(known ? p.name : '???', tx(p.x), tz(p.z) + 28);
    }
    for (const b of BOSSES) {
      g.font = '32px sans-serif';
      g.fillText('☠', tx(b.x), tz(b.z));
      g.font = '18px "Lilita One", sans-serif';
      g.fillStyle = '#ffcf3a';
      g.fillText(`${b.name} (${b.level})${s.bosses[b.id] ? ' ✓' : ''}`, tx(b.x), tz(b.z) + 26);
      g.fillStyle = '#fff';
    }
    g.save();
    g.translate(tx(px), tz(pz));
    g.rotate(yaw);
    g.fillStyle = '#ff4a3c';
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(22, 0); g.lineTo(-14, -14); g.lineTo(-6, 0); g.lineTo(-14, 14); g.closePath();
    g.stroke(); g.fill();
    g.restore();
  }
}

export function statsHtml(s: SaveData) {
  return `<div class="statline"><span>Batırılan <b>${s.stats.sunk}</b></span><span>Boss <b>${s.stats.bossKills}</b></span><span>Kazanç <b>${formatNum(s.stats.earned)}</b> ${COIN.replace('class="ico"', 'class="ico" style="width:14px;height:14px;vertical-align:-2px"')}</span><span>Batış <b>${s.stats.deaths}</b></span></div>`;
}
