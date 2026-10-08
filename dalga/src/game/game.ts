import { formatNum } from '../core/math';
import { CANNONS } from '../data/cannons';
import { SHIP_BY_ID } from '../data/ships';
import { BOSSES, WORLD, zoneAt, type PortDef } from '../data/world';
import { GameScene } from '../render/scene';
import { Boat } from '../sim/boat';
import { Sim } from '../sim/world';
import { Harbor } from '../ui/harbor';
import { Hud } from '../ui/hud';
import { Input } from '../ui/input';
import { Modal, statsHtml, WorldMap } from '../ui/menus';
import { Audio } from './audio';
import { Profile } from './profile';
import { clearSave, loadSave } from './save';
import { Spawner } from './spawner';

type Mode = 'harbor' | 'sea' | 'dead';

const STEP = 1 / 60;

export class Game {
  readonly profile = new Profile(loadSave());
  readonly sim = new Sim();
  readonly scene: GameScene;
  readonly hud: Hud;
  readonly harbor: Harbor;
  readonly input: Input;
  readonly audio = new Audio();
  readonly spawner: Spawner;
  private modal: Modal;
  private map: WorldMap;
  private notice: HTMLDivElement;
  private noticeT = 0;
  private mode: Mode = 'harbor';
  private port: PortDef;
  private paused = false;
  private last = performance.now();
  private zoneId = -1;
  private nearPort: PortDef | null = null;
  private deadT = 0;
  private tutorialT = 0;
  private tutorialStep = 0;
  private previewKey = '';
  private levelCache = 1;
  private sailT = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.scene = new GameScene(canvas);
    this.hud = new Hud(ui);
    this.input = new Input(ui);
    this.harbor = new Harbor(ui, this.profile, this.scene, this.audio);
    this.modal = new Modal(ui);
    this.map = new WorldMap(ui);
    this.notice = document.createElement('div');
    this.notice.className = 'toast stroke';
    this.notice.style.top = '45%';
    ui.appendChild(this.notice);
    this.spawner = new Spawner(this.sim, () => this.levelCache);

    const s = this.profile.s;
    this.audio.enabled = s.sound;
    this.scene.setQuality(s.quality !== 'low');
    this.input.onFirstGesture = () => this.audio.unlock();

    this.hud.onAbility = () => this.useAbility();
    this.hud.onPort = () => this.tryEnterPort();
    this.hud.onPause = () => this.pause();
    this.hud.onMap = () => this.openMap();
    this.harbor.onSail = () => this.sail();
    this.harbor.onSettings = () => this.settings();
    this.harbor.onPreview = (id) => this.preview(id);

    this.port = WORLD.ports.find((p) => p.id === s.lastPort) ?? WORLD.ports[0];
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.enterHarbor(this.port, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'sea') this.pause();
      this.profile.save();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize() {
    this.scene.resize(window.innerWidth, window.innerHeight);
  }

  private say(msg: string, secs = 2.4) {
    if (this.mode === 'sea') { this.hud.toast(msg, secs); return; }
    this.notice.textContent = msg;
    this.notice.classList.add('show');
    this.noticeT = secs;
  }

  // ------------------------------------------------------------------ harbour
  private preview(id: string) {
    const ss = this.profile.s.ships[id];
    const guns = ss.slots.map((cid) => this.profile.cannon(cid)?.kind ?? null);
    const key = `${id}:${ss.owned}:${guns.join(',')}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.scene.enterHarbor(this.port, SHIP_BY_ID[id], !ss.owned, guns);
  }

  private enterHarbor(port: PortDef, first = false) {
    const s = this.profile.s;
    const p = this.sim.player;
    let banked = 0;
    if (p) {
      banked = Math.floor(p.cargo);
      s.gold += banked;
      s.stats.earned += banked;
      this.sim.remove(p);
      this.sim.player = null;
    }
    this.port = port;
    s.lastPort = port.id;
    if (!s.ports.includes(port.id)) s.ports.push(port.id);
    this.profile.save();
    this.mode = 'harbor';
    this.input.release();
    this.input.enabled = false;
    this.hud.show(false);
    this.previewKey = '';
    this.harbor.open(port);
    this.scene.snapTo(port.x, port.z);
    if (banked > 0) {
      this.audio.coin();
      this.say(`Ambar boşaltıldı: +${formatNum(banked)} altın kasada!`, 3);
    } else if (!first) {
      this.say('Gemi onarıldı.', 1.8);
    }
  }

  private sail() {
    const s = this.profile.s;
    const def = SHIP_BY_ID[s.ship];
    const lo = this.profile.loadout();
    if (!lo.guns.some(Boolean)) {
      this.say('Gemide hiç top yok! Cephanelikten top tak.', 2.6);
      this.audio.error();
      return;
    }
    const b = new Boat(def, 'player', lo.upgrades, lo.guns);
    const port = this.port;
    b.x = port.x + Math.cos(port.angle) * 34;
    b.z = port.z + Math.sin(port.angle) * 34;
    b.yaw = port.angle;
    b.input.heading = port.angle;
    b.input.throttle = 0;
    b.vx = Math.cos(port.angle) * def.speed * 0.5;
    b.vz = Math.sin(port.angle) * def.speed * 0.5;
    b.level = this.levelCache = this.profile.level();
    this.sim.add(b);
    this.sim.player = b;
    this.input.heading = port.angle;
    this.scene.leaveHarbor();
    this.harbor.close();
    this.hud.show(true);
    this.input.enabled = true;
    this.mode = 'sea';
    this.sailT = 0;
    this.zoneId = -1;
    this.scene.snapTo(b.x, b.z);
    this.audio.unlock();
    this.audio.bell();
    if (s.tutorial) { this.tutorialStep = 0; this.tutorialT = 0.8; }
  }

  private tryEnterPort() {
    if (this.mode !== 'sea' || !this.nearPort) return;
    this.audio.bell();
    this.enterHarbor(this.nearPort);
  }

  // ------------------------------------------------------------------ actions
  private useAbility() {
    const p = this.sim.player;
    if (this.mode !== 'sea' || !p || p.dead) return;
    if (this.sim.useAbility(p)) {
      this.audio.ability();
      this.hud.toast(`${p.ability.name}!`, 1.2);
    }
  }

  private pause() {
    if (this.mode !== 'sea' || this.paused) return;
    this.paused = true;
    this.input.release();
    const s = this.profile.s;
    this.modal.show(`<h1 class="stroke">Duraklatıldı</h1>${statsHtml(s)}<p>Taşıdığın altın limana varana kadar risk altında.</p>`, [
      { label: 'Devam', fn: () => { this.paused = false; } },
      { label: s.sound ? '🔊 Ses' : '🔇 Ses', cls: 'gray', fn: () => { this.toggleSound(); this.paused = false; this.pause(); return false; } },
      { label: '🗺️ Harita', cls: 'blue', fn: () => { this.paused = false; this.openMap(); } },
    ]);
  }

  private toggleSound() {
    const s = this.profile.s;
    s.sound = !s.sound;
    this.audio.setEnabled(s.sound);
    this.profile.save();
  }

  private openMap() {
    const p = this.sim.player;
    const x = p?.x ?? this.port.x, z = p?.z ?? this.port.z;
    this.map.show(this.profile.s, x, z, p?.yaw ?? this.port.angle);
  }

  private settings() {
    const s = this.profile.s;
    this.modal.show(`<h1 class="stroke">Ayarlar</h1>${statsHtml(s)}
      <p><b>Kontroller:</b> Ekrana dokunup sürükle, gemi o yöne döner. Toplar menzildeki düşmana kendiliğinden ateş eder. Yan toplar için düşmana bordanı çevir. Mavi düğme gemi yeteneğidir. Klavyede WASD ve Boşluk tuşu.</p>`, [
      { label: s.sound ? '🔊 Ses Açık' : '🔇 Ses Kapalı', cls: 'gray', fn: () => { this.toggleSound(); this.settings(); return false; } },
      { label: s.quality === 'low' ? 'Grafik: Düşük' : 'Grafik: Yüksek', cls: 'gray', fn: () => { s.quality = s.quality === 'low' ? 'high' : 'low'; this.scene.setQuality(s.quality !== 'low'); this.profile.save(); this.settings(); return false; } },
      { label: '🗺️ Harita', cls: 'blue', fn: () => this.openMap() },
      { label: 'Kaydı Sil', cls: 'red', fn: () => {
        this.modal.show('<h1 class="stroke">Emin misin?</h1><p>Bütün gemiler, toplar ve altın silinir.</p>', [
          { label: 'Sil', cls: 'red', fn: () => { clearSave(); location.reload(); } },
          { label: 'Vazgeç', cls: 'gray' },
        ]);
        return false;
      } },
      { label: 'Kapat' },
    ]);
  }

  // ------------------------------------------------------------------ loop
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = STEP;
    dt = Math.min(dt, 0.05);
    if (this.noticeT > 0) {
      this.noticeT -= dt;
      if (this.noticeT <= 0) this.notice.classList.remove('show');
    }
    if (this.paused || this.modal.open || this.map.root.classList.contains('show')) {
      if (this.mode === 'sea') { this.scene.update(this.sim, 0, this.spawner.mysteries); return; }
    }

    if (this.mode === 'sea' || this.mode === 'dead') this.controlPlayer();
    const steps = Math.max(1, Math.round(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.sim.step(h);
    if (this.mode !== 'harbor') this.spawner.update(dt);
    this.processEvents();
    if (this.mode === 'sea') this.seaLogic(dt);
    if (this.mode === 'dead') this.deadLogic(dt);

    this.scene.update(this.sim, dt, this.spawner.mysteries);
    if (this.mode === 'harbor') this.harbor.layout();
    else {
      const s = this.profile.s;
      this.hud.update(dt, this.sim, this.scene, {
        gold: s.gold, gems: s.gems, level: this.levelCache,
        discovered: new Set(s.ports), nearPort: this.nearPort?.id ?? null,
      }, this.spawner.mysteries);
    }
    const p = this.sim.player;
    const storm = p ? (zoneAt(p.x, p.z).theme === 'storm' ? 1 : 0) : 0;
    this.audio.setAmbient(p?.speed ?? 2, storm);
  }

  private controlPlayer() {
    const p = this.sim.player;
    if (!p || p.dead) return;
    this.input.poll();
    p.input.heading = this.input.heading;
    p.input.throttle = this.input.active ? this.input.throttle : 0;
    if (this.input.consumeAbility()) this.useAbility();
    if (this.input.consumePort()) this.tryEnterPort();
  }

  private processEvents() {
    const sim = this.sim;
    const p = sim.player;
    const cx = this.scene.camTarget.x, cz = this.scene.camTarget.z;
    const dist = (x: number, z: number) => Math.hypot(x - cx, z - cz);
    const s = this.profile.s;
    for (const e of sim.events) {
      switch (e.type) {
        case 'fire':
          this.audio.cannon(dist(e.x, e.z), e.kind === 'havan' || e.kind === 'karronat');
          break;
        case 'hit':
          this.audio.hit(dist(e.x, e.z), e.crit);
          if (p && e.by === p.id) this.hud.floater(String(Math.round(e.dmg)), e.crit ? 'dmg crit' : 'dmg', e.x, e.y + 1, e.z);
          else if (p && e.boat === p.id) this.hud.floater(`-${Math.round(e.dmg)}`, 'hurt', e.x, e.y + 1, e.z);
          break;
        case 'splash':
          this.audio.splash(dist(e.x, e.z));
          break;
        case 'explode':
          this.audio.explode(dist(e.x, e.z));
          break;
        case 'ram':
          this.audio.ram(dist(e.x, e.z), e.power);
          break;
        case 'ground':
          if (p && e.boat === p.id) this.hud.toast('Karaya oturdun! Gövde hasar aldı.', 1.6);
          break;
        case 'sink': {
          this.audio.sink(dist(e.x, e.z));
          const b = sim.boatById(e.boat);
          if (!b) break;
          if (b === p) {
            this.onPlayerSunk();
          } else if (p && e.by === p.id) {
            s.stats.sunk++;
            this.hud.floater('BATTI!', 'dmg crit', b.x, b.deck + 4, b.z, 1.6);
            if (b.bossId) {
              s.stats.bossKills++;
              s.bosses[b.bossId] = (s.bosses[b.bossId] ?? 0) + 1;
              this.spawner.onBossKilled(b.bossId);
              this.hud.toast(`☠ ${b.name} battı! Elmasları ve sandığı topla!`, 3.5);
              this.audio.success();
            }
          } else if (b.bossId) {
            this.spawner.onBossKilled(b.bossId);
          }
          break;
        }
        case 'pickup':
          if (!p) break;
          if (e.kind === 'gold') {
            this.audio.coin();
            this.hud.floater(`+${formatNum(e.value)}`, 'gold', p.x, p.deck + 3, p.z, 0.9);
          } else if (e.kind === 'gem') {
            s.gems += e.value;
            this.audio.gem();
            this.hud.floater(`+${e.value} 💎`, 'gem', p.x, p.deck + 3, p.z, 1.2);
            this.profile.save();
          } else if (e.kind === 'crate' && e.cannon) {
            const c = this.profile.addCannon(e.cannon.kind, e.cannon.level);
            this.profile.save();
            this.audio.success();
            this.hud.toast(`Sandıktan ${CANNONS[c.kind].name} (Sv ${c.level}) çıktı! Limanda tak.`, 3.2);
          }
          break;
        case 'holdFull':
          this.hud.toast('Ambar dolu! Limana dönüp altını kasaya koy.', 2.6);
          this.audio.error();
          break;
        default:
          break;
      }
    }
    sim.events.length = 0;
  }

  private seaLogic(dt: number) {
    const p = this.sim.player;
    if (!p) return;
    const s = this.profile.s;
    this.sailT += dt;
    // Zone banner.
    const zone = zoneAt(p.x, p.z);
    if (zone.id !== this.zoneId) {
      if (this.zoneId !== -1 || zone.id > 0) this.hud.zoneBanner(zone.name, `Düşman seviyesi ${zone.levelMin}-${zone.levelMax}`);
      this.zoneId = zone.id;
    }
    // Port discovery and mooring.
    this.nearPort = null;
    for (const port of WORLD.ports) {
      const d = Math.hypot(port.x - p.x, port.z - p.z);
      if (d < 170 && !s.ports.includes(port.id)) {
        s.ports.push(port.id);
        this.profile.save();
        this.audio.bell();
        this.hud.toast(`Yeni liman keşfedildi: ${port.name}!`, 3);
      }
      if (d < 55 && this.sailT > 5) this.nearPort = port;
    }
    // Mysteries.
    for (const m of [...this.spawner.mysteries]) {
      if (Math.hypot(m.x - p.x, m.z - p.z) < p.length * 0.5 + 10) {
        const msg = this.spawner.trigger(m);
        this.hud.toast(msg, 2.8);
        this.audio.success();
      }
    }
    // Boss proximity warning.
    for (const bd of BOSSES) {
      const boss = this.sim.boats.find((b) => b.bossId === bd.id && !b.dead);
      if (boss && Math.hypot(boss.x - p.x, boss.z - p.z) < 200 && !boss.userSeen) {
        boss.userSeen = true;
        this.hud.zoneBanner(`☠ ${bd.name}`, `Seviye ${boss.level} · Ödül ${formatNum(bd.bounty)} altın + ${bd.gems} elmas`);
      }
    }
    if (s.tutorial) this.tutorial(dt);
  }

  private tutorial(dt: number) {
    this.tutorialT -= dt;
    if (this.tutorialT > 0) return;
    const steps = [
      ['Ekrana dokun ve sürükle: gemi o yöne döner.', 6],
      ['Toplar menzildeki düşmana kendiliğinden ateş eder. Yan toplar için düşmana bordanı çevir!', 7],
      ['Batan gemiler altın fıçısı bırakır. Üzerinden geçip topla.', 7],
      ['Altın ancak limana dönünce kasaya girer. Batarsan ambarındakini kaybedersin!', 7],
      ['Mavi düğme gemi yeteneğin. Haritadaki ? işaretleri hazine, ☠ ise boss.', 6],
    ] as const;
    if (this.tutorialStep >= steps.length) {
      this.profile.s.tutorial = false;
      this.profile.save();
      return;
    }
    const [msg, secs] = steps[this.tutorialStep++];
    this.hud.toast(msg, secs - 0.5);
    this.tutorialT = secs;
  }

  private onPlayerSunk() {
    const s = this.profile.s;
    s.stats.deaths++;
    this.profile.save();
    this.mode = 'dead';
    this.deadT = 0;
    this.input.release();
    this.input.enabled = false;
    this.hud.toast('Gemin batıyor!', 2);
  }

  private deadLogic(dt: number) {
    this.deadT += dt;
    if (this.deadT < 2.4 || this.modal.open) return;
    const p = this.sim.player;
    const lost = p ? Math.round(this.sim.loot.filter((l) => l.kind === 'gold' && Math.hypot(l.x - p.x, l.z - p.z) < 40).reduce((a, l) => a + l.value, 0)) : 0;
    // Nearest known port.
    let best = this.port;
    let bd = Infinity;
    for (const port of WORLD.ports) {
      if (!this.profile.s.ports.includes(port.id) || !p) continue;
      const d = Math.hypot(port.x - p.x, port.z - p.z);
      if (d < bd) { bd = d; best = port; }
    }
    this.modal.show(`<h1 class="stroke">Battın!</h1><p>${lost ? `Ambarındaki ${formatNum(lost)} altın denize saçıldı.` : 'Neyse ki ambarın boştu.'}<br>Gemin onarıldı. Dönüş limanı: ${best.name}</p>`, [
      { label: 'Limana Dön', fn: () => {
        if (p) { this.sim.remove(p); this.sim.player = null; }
        this.enterHarbor(best, true);
      } },
    ]);
    this.deadT = -999;
  }
}
