export type AbilityId = 'sprint' | 'gust' | 'broadside' | 'ram' | 'barrels' | 'repair' | 'fog';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  desc: string;
  cooldown: number;
  duration: number;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  sprint: { id: 'sprint', name: 'Kürek Hamlesi', desc: '3 saniye boyunca %60 hız.', cooldown: 10, duration: 3 },
  gust: { id: 'gust', name: 'Rüzgarı Yakala', desc: '5 saniye rüzgardan bağımsız tam hız ve hızlı dönüş.', cooldown: 14, duration: 5 },
  broadside: { id: 'broadside', name: 'Tam Borda', desc: 'Bütün toplar anında dolar ve ateşe hazırlanır.', cooldown: 16, duration: 0.2 },
  ram: { id: 'ram', name: 'Mahmuz Hücumu', desc: 'İleri atıl. Çarpışma hasarı 3 kat.', cooldown: 12, duration: 1.6 },
  barrels: { id: 'barrels', name: 'Barut Fıçıları', desc: 'Arkana 3 patlayıcı fıçı bırakır.', cooldown: 12, duration: 0.6 },
  repair: { id: 'repair', name: 'Tamirat', desc: '6 saniyede gövdenin %35\'ini onarır.', cooldown: 25, duration: 6 },
  fog: { id: 'fog', name: 'Sis Perdesi', desc: '5 saniye görünmez ol, hasarın yarısını al.', cooldown: 22, duration: 5 },
};

export interface SlotDef {
  /** Longitudinal position as a fraction of length (-0.5 stern … 0.5 bow). */
  x: number;
  /** Lateral position as a fraction of half-beam (-1 port … 1 starboard). */
  z: number;
  /** Facing in ship-local radians: 0 bow, +PI/2 starboard, -PI/2 port, PI stern. */
  face: number;
  /** Deck turrets turn freely. */
  turret?: boolean;
}

export interface MastDef {
  x: number;
  h: number;
  sail: 'square' | 'fore' | 'lateen';
  w: number;
}

export interface ShipDef {
  id: string;
  name: string;
  desc: string;
  tier: number;
  length: number;
  beam: number;
  mass: number;
  hp: number;
  /** Top speed on a broad reach, m/s. */
  speed: number;
  accel: number;
  /** Max yaw rate at speed, rad/s. */
  turn: number;
  hold: number;
  /** 0 = ignores wind (oars/steam), 1 = full sail. */
  windInfluence: number;
  ramMul: number;
  armor: number;
  slots: SlotDef[];
  masts: MastDef[];
  oars: number;
  castle: number;
  ability: AbilityId;
  priceGold: number;
  priceGems: number;
}

const P = Math.PI / 2;

/** n guns per side spread between two longitudinal fractions. */
function broadside(n: number, x0: number, x1: number, z = 0.92): SlotDef[] {
  const out: SlotDef[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    out.push({ x, z: -z, face: -P }, { x, z, face: P });
  }
  return out;
}

export const SHIPS: ShipDef[] = [
  {
    id: 'sandal', name: 'Sandal', tier: 1,
    desc: 'Küçük, çevik ve ucuz. Sandık toplamak ve kaçmak için ideal.',
    length: 7, beam: 2.6, mass: 3, hp: 70, speed: 13, accel: 7, turn: 1.9, hold: 300,
    windInfluence: 0.4, ramMul: 0.8, armor: 0,
    slots: broadside(1, 0.05, 0.05, 0.85),
    masts: [{ x: 0.12, h: 6, sail: 'lateen', w: 0.9 }],
    oars: 0, castle: 0, ability: 'sprint', priceGold: 0, priceGems: 0,
  },
  {
    id: 'salupa', name: 'Şalupa', tier: 2,
    desc: 'Tek direkli, hızlı bir korsan gemisi. Yeni kaptanların dostu.',
    length: 12, beam: 3.8, mass: 8, hp: 130, speed: 14.5, accel: 6, turn: 1.45, hold: 700,
    windInfluence: 0.9, ramMul: 1, armor: 0,
    slots: [...broadside(1, -0.02, -0.02), { x: 0.42, z: 0, face: 0 }, { x: -0.42, z: 0, face: Math.PI }],
    masts: [{ x: 0.08, h: 11, sail: 'square', w: 1 }],
    oars: 0, castle: 0.18, ability: 'gust', priceGold: 600, priceGems: 0,
  },
  {
    id: 'brigantin', name: 'Brigantin', tier: 3,
    desc: 'İki direk, altı top. Hız ve ateş gücü arasında altın oran.',
    length: 16, beam: 4.6, mass: 15, hp: 210, speed: 14, accel: 5.2, turn: 1.15, hold: 1400,
    windInfluence: 1, ramMul: 1, armor: 0.05,
    slots: [...broadside(2, -0.18, 0.14), { x: 0.44, z: 0, face: 0 }, { x: -0.43, z: 0, face: Math.PI }],
    masts: [{ x: 0.22, h: 13, sail: 'square', w: 1 }, { x: -0.16, h: 12, sail: 'fore', w: 1 }],
    oars: 0, castle: 0.2, ability: 'broadside', priceGold: 3500, priceGems: 0,
  },
  {
    id: 'kadirga', name: 'Kadırga', tier: 4,
    desc: 'Kürekli savaş gemisi. Rüzgarı umursamaz, mahmuzuyla gövdeleri yarar.',
    length: 20, beam: 4, mass: 18, hp: 240, speed: 13, accel: 7, turn: 1.3, hold: 1300,
    windInfluence: 0, ramMul: 2.2, armor: 0.1,
    slots: [
      { x: 0.42, z: -0.35, face: -0.12 }, { x: 0.44, z: 0, face: 0 }, { x: 0.42, z: 0.35, face: 0.12 },
      ...broadside(1, -0.15, -0.15),
    ],
    masts: [{ x: 0.1, h: 11, sail: 'lateen', w: 1.2 }],
    oars: 9, castle: 0.16, ability: 'ram', priceGold: 9000, priceGems: 0,
  },
  {
    id: 'firkateyn', name: 'Fırkateyn', tier: 5,
    desc: 'Donanmanın gözdesi. On top, sağlam gövde, hızlı.',
    length: 24, beam: 5.6, mass: 30, hp: 360, speed: 15, accel: 4.6, turn: 0.95, hold: 2800,
    windInfluence: 1, ramMul: 1, armor: 0.1,
    slots: [...broadside(4, -0.28, 0.24), { x: 0.46, z: 0, face: 0 }, { x: -0.44, z: 0, face: Math.PI }],
    masts: [
      { x: 0.26, h: 16, sail: 'square', w: 1 },
      { x: -0.02, h: 18, sail: 'square', w: 1.1 },
      { x: -0.28, h: 14, sail: 'fore', w: 0.9 },
    ],
    oars: 0, castle: 0.22, ability: 'broadside', priceGold: 20000, priceGems: 0,
  },
  {
    id: 'bomba', name: 'Bomba Gemisi', tier: 6,
    desc: 'Güvertesinde döner havan yuvaları. Uzaktan kuşatma ustası.',
    length: 20, beam: 5.6, mass: 28, hp: 320, speed: 12, accel: 4.4, turn: 0.9, hold: 2600,
    windInfluence: 1, ramMul: 1, armor: 0.12,
    slots: [
      { x: 0.24, z: 0, face: 0, turret: true }, { x: 0.02, z: 0, face: 0, turret: true },
      ...broadside(2, -0.3, -0.1),
    ],
    masts: [{ x: -0.16, h: 14, sail: 'square', w: 1 }, { x: -0.38, h: 11, sail: 'fore', w: 0.9 }],
    oars: 0, castle: 0.2, ability: 'barrels', priceGold: 38000, priceGems: 0,
  },
  {
    id: 'kalyon', name: 'Kalyon', tier: 7,
    desc: 'Yüzen bir kale. Yavaş döner ama on dört topla cehennem yağdırır.',
    length: 30, beam: 7.4, mass: 60, hp: 640, speed: 12, accel: 3.4, turn: 0.62, hold: 6000,
    windInfluence: 1, ramMul: 1.3, armor: 0.2,
    slots: [...broadside(6, -0.32, 0.28), { x: 0.47, z: 0, face: 0 }, { x: -0.45, z: 0, face: Math.PI }],
    masts: [
      { x: 0.28, h: 18, sail: 'square', w: 1 },
      { x: 0.0, h: 21, sail: 'square', w: 1.15 },
      { x: -0.26, h: 17, sail: 'square', w: 1 },
    ],
    oars: 0, castle: 0.28, ability: 'repair', priceGold: 80000, priceGems: 60,
  },
  {
    id: 'hayalet', name: 'Hayalet Gemi', tier: 8,
    desc: 'Ölü Sular\'dan dönen lanetli gemi. Sisin içinde kaybolur.',
    length: 26, beam: 5.8, mass: 34, hp: 480, speed: 16.5, accel: 5.4, turn: 1.0, hold: 5000,
    windInfluence: 0.3, ramMul: 1.2, armor: 0.15,
    slots: [...broadside(4, -0.26, 0.22), { x: 0.46, z: 0, face: 0 }, { x: -0.44, z: 0, face: Math.PI }],
    masts: [
      { x: 0.24, h: 17, sail: 'square', w: 1 },
      { x: -0.04, h: 19, sail: 'square', w: 1.1 },
      { x: -0.3, h: 15, sail: 'square', w: 0.9 },
    ],
    oars: 0, castle: 0.24, ability: 'fog', priceGold: 0, priceGems: 450,
  },
];

export const SHIP_BY_ID: Record<string, ShipDef> = Object.fromEntries(SHIPS.map((s) => [s.id, s]));

export type UpgradeStat = 'hp' | 'speed' | 'hold';
export const MAX_SHIP_UPGRADE = 10;

export const UPGRADE_INFO: Record<UpgradeStat, { name: string; per: string }> = {
  hp: { name: 'Gövde', per: '+%12 dayanıklılık' },
  speed: { name: 'Yelken', per: '+%3 hız, +%3 dönüş' },
  hold: { name: 'Ambar', per: '+%25 kapasite' },
};

export function shipUpgradeCost(def: ShipDef, stat: UpgradeStat, level: number): number {
  const base = { hp: 150, speed: 180, hold: 120 }[stat];
  return Math.round((base * Math.pow(1.55, def.tier - 1) * Math.pow(1.6, level)) / 10) * 10;
}

export interface ShipUpgrades {
  hp: number;
  speed: number;
  hold: number;
}

/** Final stats after upgrades. */
export function shipStats(def: ShipDef, up: ShipUpgrades) {
  return {
    hp: def.hp * (1 + 0.12 * up.hp),
    speed: def.speed * (1 + 0.03 * up.speed),
    turn: def.turn * (1 + 0.03 * up.speed),
    hold: Math.round(def.hold * (1 + 0.25 * up.hold)),
  };
}
