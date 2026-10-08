import { formatNum } from '../core/math';
import { cannonStats, CANNONS, MAX_CANNON_LEVEL } from '../data/cannons';
import { deckHeight, hullWidth } from '../data/hull';
import { ABILITIES, MAX_SHIP_UPGRADE, SHIPS, shipStats, UPGRADE_INFO, type UpgradeStat } from '../data/ships';
import { WORLD, type PortDef } from '../data/world';
import type { Audio } from '../game/audio';
import { CRATES, type Profile } from '../game/profile';
import type { CannonItem } from '../game/save';
import type { GameScene } from '../render/scene';
import { ABILITY_ICON, cannonSvg, COIN, GEM } from './icons';

type Sheet = 'shop' | 'upgrade' | 'armory' | null;

const el = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const price = (gold: number, gems: number) =>
  `${gold ? `${formatNum(gold)} ${COIN}` : ''}${gold && gems ? ' + ' : ''}${gems ? `${formatNum(gems)} ${GEM}` : ''}` || 'Bedava';

export class Harbor {
  readonly root: HTMLElement;
  private svg: SVGSVGElement;
  private slotLayer: HTMLElement;
  private slots: HTMLElement[] = [];
  private title: HTMLElement;
  private buyBtn: HTMLButtonElement;
  private goldTxt: HTMLElement;
  private gemTxt: HTMLElement;
  private sheet: HTMLElement;
  private sheetBody: HTMLElement;
  private sheetTitle: HTMLElement;
  private modal: HTMLElement;
  private viewIndex = 0;
  private sheetKind: Sheet = null;
  private selSlot: number | null = null;
  private port: PortDef | null = null;
  private upDot: HTMLElement;
  onSail: (() => void) | null = null;
  onPreview: ((shipId: string) => void) | null = null;
  onSettings: (() => void) | null = null;

  constructor(parent: HTMLElement, private profile: Profile, private scene: GameScene, private audio: Audio) {
    this.root = el(`<div class="harbor"></div>`);
    parent.appendChild(this.root);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('lines');
    this.root.appendChild(this.svg);
    this.slotLayer = el(`<div style="position:absolute;inset:0"></div>`);
    this.root.appendChild(this.slotLayer);

    const top = el(`<div class="top">
      <div class="btn-round tap" data-a="settings">⚙️</div>
      <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="pill stroke"><span data-v="gold">0</span>${COIN}</div>
        <div class="pill stroke"><span data-v="gems">0</span>${GEM}</div>
      </div></div>`);
    this.root.appendChild(top);
    this.goldTxt = top.querySelector('[data-v=gold]')!;
    this.gemTxt = top.querySelector('[data-v=gems]')!;
    top.querySelector('[data-a=settings]')!.addEventListener('click', () => this.onSettings?.());

    this.title = el(`<div class="title stroke"></div>`);
    this.root.appendChild(this.title);

    const left = el(`<div class="arrow l tap stroke">◀</div>`);
    const right = el(`<div class="arrow r tap stroke">▶</div>`);
    left.addEventListener('click', () => this.browse(-1));
    right.addEventListener('click', () => this.browse(1));
    this.root.append(left, right);

    this.buyBtn = el(`<button class="btn yellow buy tap stroke"></button>`) as HTMLButtonElement;
    this.buyBtn.addEventListener('click', () => this.buyOrSelect());
    this.root.appendChild(this.buyBtn);

    const tabs = el(`<div class="tabs">
      <button class="btn yellow stroke" data-t="shop"><span class="big">🏪</span>Pazar</button>
      <button class="btn purple stroke" data-t="upgrade"><span class="big">🔨</span>Tersane<span class="dot"></span></button>
      <button class="btn blue stroke" data-t="armory"><span class="big">💣</span>Cephanelik</button>
      <button class="btn stroke" data-t="go"><span class="big">⚔️</span>Denize Aç!</button>
    </div>`);
    this.upDot = tabs.querySelector('.dot')!;
    tabs.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.audio.ui();
        const t = (b as HTMLElement).dataset.t!;
        if (t === 'go') { this.closeSheet(); this.onSail?.(); return; }
        this.selSlot = null;
        this.openSheet(t as Sheet);
      }),
    );
    this.root.appendChild(tabs);

    this.sheet = el(`<div class="sheet"><div class="head"><h2 class="stroke"></h2><div class="close tap">✕</div></div><div class="body"></div></div>`);
    this.sheetTitle = this.sheet.querySelector('h2')!;
    this.sheetBody = this.sheet.querySelector('.body')!;
    this.sheet.querySelector('.close')!.addEventListener('click', () => this.closeSheet());
    this.root.appendChild(this.sheet);

    this.modal = el(`<div class="overlay"><div class="card"></div></div>`);
    this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.modal.classList.remove('show'); });
    this.root.appendChild(this.modal);
  }

  get s() { return this.profile.s; }

  open(port: PortDef) {
    this.port = port;
    this.viewIndex = SHIPS.findIndex((x) => x.id === this.s.ship);
    this.selSlot = null;
    this.closeSheet();
    this.root.classList.add('show');
    this.refresh();
  }

  close() {
    this.root.classList.remove('show');
    this.closeSheet();
    this.modal.classList.remove('show');
  }

  get viewing() { return SHIPS[this.viewIndex]; }

  private browse(d: number) {
    this.audio.ui();
    this.viewIndex = (this.viewIndex + d + SHIPS.length) % SHIPS.length;
    this.selSlot = null;
    if (this.sheetKind === 'upgrade' || this.sheetKind === 'armory') this.closeSheet();
    this.refresh();
  }

  private buyOrSelect() {
    const def = this.viewing;
    const ss = this.s.ships[def.id];
    if (ss.owned) {
      this.profile.selectShip(def.id);
      this.audio.success();
    } else if (this.profile.buyShip(def.id)) {
      this.audio.success();
      this.reveal(`<h1>${def.name}</h1><p>Yeni gemin limanda! Toplarını yerleştirmeyi unutma.</p>`);
    } else {
      this.audio.error();
      return;
    }
    this.refresh();
  }

  /** Re-renders everything that depends on the profile. */
  refresh() {
    const def = this.viewing;
    const ss = this.s.ships[def.id];
    const current = def.id === this.s.ship;
    this.goldTxt.textContent = formatNum(this.s.gold);
    this.gemTxt.textContent = formatNum(this.s.gems);
    const st = shipStats(def, ss.up);
    const ab = ABILITIES[def.ability];
    const lvl = ss.owned ? this.profile.level(def.id) : '?';
    this.title.innerHTML = `
      <div class="port">⚓ ${this.port?.name ?? ''}</div>
      <div class="ship"><div class="hex">${lvl}</div>${def.name}</div>
      <div class="desc">${def.desc}</div>
      <div class="statline"><span>❤️ <b>${Math.round(st.hp)}</b></span><span>⛵ <b>${st.speed.toFixed(1)}</b></span><span>📦 <b>${formatNum(st.hold)}</b></span><span>💣 <b>${def.slots.length}</b></span><span>${ABILITY_ICON[ab.id]} <b>${ab.name}</b></span></div>`;
    if (!ss.owned) {
      this.buyBtn.style.display = '';
      const afford = this.s.gold >= def.priceGold && this.s.gems >= def.priceGems;
      this.buyBtn.innerHTML = `Satın Al: ${price(def.priceGold, def.priceGems)}`;
      this.buyBtn.disabled = !afford;
    } else if (!current) {
      this.buyBtn.style.display = '';
      this.buyBtn.disabled = false;
      this.buyBtn.innerHTML = 'Bu Gemiyle Çık';
    } else {
      this.buyBtn.style.display = 'none';
    }
    this.onPreview?.(def.id);
    this.buildSlots();
    const canUp = (['hp', 'speed', 'hold'] as UpgradeStat[]).some((k) => this.s.ships[this.s.ship].up[k] < MAX_SHIP_UPGRADE && this.s.gold >= this.profile.shipUpgradeCost(k));
    this.upDot.classList.toggle('on', canUp);
    if (this.sheetKind) this.renderSheet();
  }

  // ------------------------------------------------------------------ slots
  private buildSlots() {
    this.slotLayer.innerHTML = '';
    this.slots = [];
    const def = this.viewing;
    if (def.id !== this.s.ship) { this.svg.innerHTML = ''; return; }
    const ss = this.s.ships[def.id];
    const free = this.s.cannons.filter((c) => !this.profile.mountedOn(c.id));
    def.slots.forEach((_, i) => {
      const c = this.profile.cannon(ss.slots[i]);
      const better = c
        ? free.some((f) => f.level > c.level) || (c.level < MAX_CANNON_LEVEL && this.s.gold >= this.profile.upgradeCannonCost(c))
        : free.length > 0;
      const box = el(`<div class="slot tap ${c ? 'filled' : ''} ${this.selSlot === i ? 'sel' : ''}">
        ${c ? cannonSvg(c.kind) + `<span class="lv">${c.level}</span>` : ''}
        ${better ? '<span class="up">⬆</span>' : ''}</div>`);
      box.addEventListener('click', () => {
        this.audio.ui();
        this.selSlot = i;
        this.openSheet('armory');
        this.buildSlots();
      });
      this.slotLayer.appendChild(box);
      this.slots.push(box);
    });
  }

  /** Called every frame: keeps slot boxes and leader lines attached to the moving ship. */
  layout() {
    const def = this.viewing;
    if (!this.root.classList.contains('show') || def.id !== this.s.ship || !this.slots.length) return;
    const W = window.innerWidth, H = window.innerHeight;
    const L = def.length, B = def.beam;
    const deck = deckHeight(L);
    const anchors = def.slots.map((s) => {
      const t = s.x + 0.5;
      return this.scene.harborPoint(s.x * L, deck + 0.4, s.z * (B / 2) * hullWidth(t) * 0.86, W, H);
    });
    const [, cy] = this.scene.harborPoint(0, deck, 0, W, H);
    const sheetOpen = this.sheet.classList.contains('show');
    const wide = W > H;
    const topY = wide ? Math.max(150, H * 0.36) : Math.max(H * 0.3, 205);
    const botY = sheetOpen ? H * 0.36 + 70 : wide ? H - 128 : Math.min(H * 0.7, H - 190);
    const rows: number[][] = [[], []];
    anchors.forEach(([, ay], i) => rows[ay < cy ? 0 : 1].push(i));
    if (sheetOpen) { rows[0] = [...rows[0], ...rows[1]]; rows[1] = []; }
    let lines = '';
    rows.forEach((row, r) => {
      row.sort((a, b) => anchors[a][0] - anchors[b][0]);
      const n = row.length;
      const size = Math.min(56, (W - 24) / Math.max(1, n) - 6);
      const span = Math.min(W - 24 - size, n * (size + 10));
      row.forEach((i, k) => {
        const x = W / 2 - span / 2 + (n === 1 ? span / 2 : (span * k) / (n - 1));
        const y = r === 0 ? (sheetOpen ? Math.min(topY, H * 0.3) : topY) : botY;
        const box = this.slots[i];
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = box.style.height = `${size}px`;
        box.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
        const [ax, ay] = anchors[i];
        lines += `<line x1="${x}" y1="${y + (r === 0 ? size / 2 : -size / 2)}" x2="${ax}" y2="${ay}" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>`;
      });
    });
    this.svg.innerHTML = lines;
  }

  // ------------------------------------------------------------------ sheets
  private openSheet(kind: Sheet) {
    this.sheetKind = kind;
    this.sheet.classList.add('show');
    this.renderSheet();
  }

  private closeSheet() {
    this.sheetKind = null;
    this.selSlot = null;
    this.sheet.classList.remove('show');
    if (this.root.classList.contains('show')) this.buildSlots();
  }

  private renderSheet() {
    this.goldTxt.textContent = formatNum(this.s.gold);
    this.gemTxt.textContent = formatNum(this.s.gems);
    if (this.sheetKind === 'shop') this.renderShop();
    else if (this.sheetKind === 'upgrade') this.renderUpgrade();
    else if (this.sheetKind === 'armory') this.renderArmory();
  }

  private renderShop() {
    this.sheetTitle.textContent = 'Pazar';
    const now = Date.now();
    const freeIn = Math.max(0, (this.s.freeCrateAt ?? 0) - now);
    const parts = CRATES.map((c) => {
      const cost = this.profile.crateCost(c);
      const ok = this.s.gold >= cost.gold && this.s.gems >= cost.gems;
      const art = c.id === 'tahta' ? '📦' : c.id === 'demir' ? '🧰' : '👑';
      return `<div class="crate"><div class="art">${art}</div><div class="nm stroke">${c.name}</div>
        <div class="st">${c.desc} · Sv ${c.levels[0] + this.profile.progress}-${c.levels[1] + this.profile.progress}</div>
        <button class="btn ${c.gems ? 'purple' : 'yellow'} stroke tap" data-c="${c.id}" ${ok ? '' : 'disabled'}>${price(cost.gold, cost.gems)}</button></div>`;
    });
    const freeHtml = `<div class="crate"><div class="art">🎁</div><div class="nm stroke">Günlük Hediye</div>
      <div class="st">Her 4 saatte bir bedava top</div>
      <button class="btn stroke tap" data-free="1" ${freeIn > 0 ? 'disabled' : ''}>${freeIn > 0 ? `${Math.ceil(freeIn / 60000)} dk` : 'Aç!'}</button></div>`;
    this.sheetBody.innerHTML = `<p class="hint">Sandıklardan rastgele top çıkar. Aynı tür ve seviyedeki iki top birleşip bir üst seviyeye çıkar.</p><div class="crates">${freeHtml}${parts.join('')}</div>`;
    this.sheetBody.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = CRATES.find((x) => x.id === b.dataset.c)!;
        const item = this.profile.openCrate(c);
        if (!item) { this.audio.error(); return; }
        this.revealCannon(item, c.name);
      }),
    );
    this.sheetBody.querySelector<HTMLButtonElement>('[data-free]')?.addEventListener('click', () => {
      if ((this.s.freeCrateAt ?? 0) > Date.now()) return;
      this.s.freeCrateAt = Date.now() + 4 * 3600 * 1000;
      const item = this.profile.rollCrate(CRATES[0]);
      this.s.gems += 3;
      this.profile.save();
      this.revealCannon(item, 'Günlük Hediye (+3 💎)');
    });
  }

  private revealCannon(item: CannonItem, from: string) {
    this.audio.success();
    const st = cannonStats(item.kind, item.level);
    this.reveal(`<p style="margin:0 0 6px">${from}</p>
      <div class="reveal"><div class="icon">${cannonSvg(item.kind)}<span class="lv stroke">${item.level}</span></div>
      <h1 class="stroke">${CANNONS[item.kind].name}</h1></div>
      <p>${CANNONS[item.kind].desc}<br>Hasar ${st.dmg.toFixed(0)}${st.pellets > 1 ? '×' + st.pellets : ''} · Menzil ${st.range.toFixed(0)} m · Dolum ${st.reload.toFixed(1)} sn</p>`,
      [{ label: 'Yerleştir', cls: '', fn: () => { this.profile.autoEquip(); } }]);
    this.refresh();
  }

  private reveal(html: string, extra: { label: string; cls: string; fn: () => void }[] = []) {
    const card = this.modal.querySelector('.card')!;
    card.innerHTML = `${html}<div class="row"></div>`;
    const row = card.querySelector('.row')!;
    for (const x of extra) {
      const b = el(`<button class="btn ${x.cls} stroke tap">${x.label}</button>`);
      b.addEventListener('click', () => { x.fn(); this.modal.classList.remove('show'); this.refresh(); });
      row.appendChild(b);
    }
    const ok = el(`<button class="btn blue stroke tap">Tamam</button>`);
    ok.addEventListener('click', () => this.modal.classList.remove('show'));
    row.appendChild(ok);
    this.modal.classList.add('show');
  }

  private renderUpgrade() {
    const def = this.SSdef();
    this.sheetTitle.textContent = `Tersane · ${def.name}`;
    const ss = this.s.ships[def.id];
    const icons: Record<UpgradeStat, string> = { hp: '🛡️', speed: '⛵', hold: '📦' };
    const st = shipStats(def, ss.up);
    const now: Record<UpgradeStat, string> = { hp: `${Math.round(st.hp)} can`, speed: `${st.speed.toFixed(1)} m/sn`, hold: `${formatNum(st.hold)} altın` };
    this.sheetBody.innerHTML = `<p class="hint">Yükseltmeler bu gemiye özeldir. Ambar, denizde taşıyabileceğin altını belirler: batarsan taşıdığın altın denize saçılır!</p>` +
      (['hp', 'speed', 'hold'] as UpgradeStat[]).map((k) => {
        const lv = ss.up[k];
        const max = lv >= MAX_SHIP_UPGRADE;
        const cost = this.profile.shipUpgradeCost(k);
        const pips = Array.from({ length: MAX_SHIP_UPGRADE }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        return `<div class="uprow"><div class="ic">${icons[k]}</div><div class="info"><div class="nm stroke">${UPGRADE_INFO[k].name} <small style="font-size:14px;opacity:.8">${now[k]}</small></div>
          <div class="pips">${pips}</div><div class="st">${UPGRADE_INFO[k].per}</div></div>
          <button class="btn yellow stroke tap" data-u="${k}" ${max || this.s.gold < cost ? 'disabled' : ''}>${max ? 'MAKS' : price(cost, 0)}</button></div>`;
      }).join('');
    this.sheetBody.querySelectorAll<HTMLButtonElement>('[data-u]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.profile.upgradeShip(b.dataset.u as UpgradeStat)) { this.audio.success(); this.refresh(); }
        else this.audio.error();
      }),
    );
  }

  private SSdef() {
    return SHIPS.find((x) => x.id === this.s.ship)!;
  }

  private renderArmory() {
    const ss = this.s.ships[this.s.ship];
    const sel = this.selSlot;
    this.sheetTitle.textContent = sel !== null ? `Yuva ${sel + 1} · Top seç` : 'Cephanelik';
    const items = [...this.s.cannons].sort((a, b) => b.level - a.level || a.kind.localeCompare(b.kind));
    const cur = sel !== null ? this.profile.cannon(ss.slots[sel]) : null;
    const pairs = new Set<number>();
    for (const a of items) for (const b of items) if (this.profile.canMerge(a, b)) { pairs.add(a.id); pairs.add(b.id); }
    const card = (c: CannonItem) => {
      const st = cannonStats(c.kind, c.level);
      const at = this.profile.mountedOn(c.id);
      const here = at && at.ship === this.s.ship;
      const tag = at ? `<span class="tag">${here ? `Yuva ${at.slot + 1}` : SHIPS.find((x) => x.id === at.ship)!.name}</span>` : '';
      const upCost = this.profile.upgradeCannonCost(c);
      const canUp = c.level < MAX_CANNON_LEVEL;
      const acts: string[] = [];
      if (sel !== null && c.id !== cur?.id) acts.push(`<button class="btn stroke tap" data-eq="${c.id}">Tak</button>`);
      if (sel !== null && c.id === cur?.id) acts.push(`<button class="btn gray stroke tap" data-un="${c.id}">Çıkar</button>`);
      if (sel === null && !here) acts.push(`<button class="btn stroke tap" data-eq="${c.id}">Tak</button>`);
      if (pairs.has(c.id)) acts.push(`<button class="btn purple stroke tap" data-mg="${c.id}">Birleştir</button>`);
      acts.push(`<button class="btn yellow stroke tap" data-up="${c.id}" ${!canUp || this.s.gold < upCost ? 'disabled' : ''}>${canUp ? `⬆ ${formatNum(upCost)}` : 'MAKS'}</button>`);
      return `<div class="ccard ${c.id === cur?.id ? 'sel' : ''} ${pairs.has(c.id) ? 'mergeable' : ''}">${tag}
        <div class="top"><div class="icon">${cannonSvg(c.kind)}<span class="lv stroke">${c.level}</span></div>
        <div><div class="nm stroke">${CANNONS[c.kind].name}</div>
        <div class="st">⚔ ${st.dmg.toFixed(0)}${st.pellets > 1 ? '×' + st.pellets : ''} · 🎯 ${st.range.toFixed(0)}m · ⏱ ${st.reload.toFixed(1)}s</div></div></div>
        <div class="acts">${acts.join('')}</div>
        ${c.id === cur?.id || (sel === null && !at) ? `<div class="st" style="text-align:right"><a class="tap" data-sell="${c.id}" style="text-decoration:underline">Sat (+${formatNum(this.profile.sellValue(c))})</a></div>` : ''}
      </div>`;
    };
    this.sheetBody.innerHTML = `
      <div class="row" style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button class="btn purple stroke tap" data-a="merge" ${pairs.size ? '' : 'disabled'}>⚡ Hepsini Birleştir</button>
        <button class="btn blue stroke tap" data-a="equip">Boşlukları Doldur</button>
      </div>
      <p class="hint">${sel !== null ? 'Bu yuvaya takmak istediğin topu seç.' : 'Bir yuvaya dokun ya da topa "Tak" de. Aynı iki top birleşince seviye atlar.'} Yan toplar yalnızca bordadan ateş eder; geminin yanını düşmana çevir!</p>
      <div class="grid">${items.length ? items.map(card).join('') : '<p class="hint">Hiç topun yok. Pazar\'dan sandık aç!</p>'}</div>`;
    const find = (id: string | undefined) => this.s.cannons.find((c) => c.id === Number(id))!;
    this.sheetBody.querySelectorAll<HTMLElement>('[data-eq]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = find(b.dataset.eq);
        let slot = sel;
        if (slot === null) {
          slot = ss.slots.findIndex((x) => x === null);
          if (slot < 0) {
            // Replace the weakest mounted gun.
            let worst = 0;
            ss.slots.forEach((id, i) => { if ((this.profile.cannon(id)?.level ?? 0) < (this.profile.cannon(ss.slots[worst])?.level ?? 0)) worst = i; });
            slot = worst;
          }
        }
        this.profile.equip(slot, c.id);
        this.audio.ui();
        this.refresh();
      }),
    );
    this.sheetBody.querySelectorAll<HTMLElement>('[data-un]').forEach((b) =>
      b.addEventListener('click', () => { if (sel !== null) this.profile.equip(sel, null); this.audio.ui(); this.refresh(); }),
    );
    this.sheetBody.querySelectorAll<HTMLElement>('[data-up]').forEach((b) =>
      b.addEventListener('click', () => { if (this.profile.upgradeCannon(find(b.dataset.up))) this.audio.success(); else this.audio.error(); this.refresh(); }),
    );
    this.sheetBody.querySelectorAll<HTMLElement>('[data-mg]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = find(b.dataset.mg);
        const other = this.s.cannons.find((x) => this.profile.canMerge(a, x));
        if (other && this.profile.merge(a, other)) this.audio.success();
        this.refresh();
      }),
    );
    this.sheetBody.querySelectorAll<HTMLElement>('[data-sell]').forEach((b) =>
      b.addEventListener('click', () => { this.profile.sell(find(b.dataset.sell)); this.audio.coin(); this.refresh(); }),
    );
    this.sheetBody.querySelector('[data-a=merge]')?.addEventListener('click', () => {
      const n = this.profile.autoMerge();
      if (n) this.audio.success();
      this.refresh();
    });
    this.sheetBody.querySelector('[data-a=equip]')?.addEventListener('click', () => {
      this.profile.autoEquip();
      this.audio.ui();
      this.refresh();
    });
  }

  /** Port list for the settings / world map. */
  static portName(id: string) {
    return WORLD.ports.find((p) => p.id === id)?.name ?? id;
  }
}
