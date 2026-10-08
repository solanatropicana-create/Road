export type CannonKind = 'top' | 'uzun' | 'karronat' | 'zincir' | 'havan' | 'zipkin';

export interface CannonDef {
  kind: CannonKind;
  name: string;
  desc: string;
  /** Damage per hit at level 1. */
  dmg: number;
  /** Max horizontal range (m). */
  range: number;
  /** Minimum range (mortar). */
  minRange: number;
  /** Seconds between shots at level 1. */
  reload: number;
  /** Muzzle speed (m/s). */
  speed: number;
  /** Half of the firing arc, radians. A turret uses PI. */
  arc: number;
  /** Random aim error (radians). */
  spread: number;
  /** Mortars use the high ballistic solution. */
  highArc: boolean;
  /** Area damage radius, 0 = direct hit only. */
  aoe: number;
  /** Seconds of sail damage (speed penalty) applied on hit. */
  slow: number;
  /** Harpoon: ties the target to the shooter with a rope. */
  tether: boolean;
  /** Pellets per shot. */
  pellets: number;
  /** Visual ball radius. */
  ballR: number;
  /** Recoil impulse factor. */
  recoil: number;
  color: string;
}

export const CANNONS: Record<CannonKind, CannonDef> = {
  top: {
    kind: 'top', name: 'Top', desc: 'Dengeli, güvenilir yan top.',
    dmg: 10, range: 58, minRange: 0, reload: 1.6, speed: 46, arc: 0.75, spread: 0.05,
    highArc: false, aoe: 0, slow: 0, tether: false, pellets: 1, ballR: 0.32, recoil: 1, color: '#7a4a2a',
  },
  uzun: {
    kind: 'uzun', name: 'Uzun Top', desc: 'Uzak menzil, dar açı. Kaçanları avlar.',
    dmg: 9, range: 88, minRange: 0, reload: 2.1, speed: 58, arc: 0.5, spread: 0.02,
    highArc: false, aoe: 0, slow: 0, tether: false, pellets: 1, ballR: 0.28, recoil: 1.2, color: '#4f5d6b',
  },
  karronat: {
    kind: 'karronat', name: 'Karronat', desc: 'Kısa menzil, saçma atar. Yakın dövüşte yıkıcı.',
    dmg: 5, range: 36, minRange: 0, reload: 2.0, speed: 40, arc: 0.85, spread: 0.12,
    highArc: false, aoe: 0, slow: 0, tether: false, pellets: 4, ballR: 0.22, recoil: 1.6, color: '#3b3b3b',
  },
  zincir: {
    kind: 'zincir', name: 'Zincir Gülle', desc: 'Yelkenleri parçalar, hedefi yavaşlatır.',
    dmg: 6, range: 50, minRange: 0, reload: 1.9, speed: 42, arc: 0.7, spread: 0.05,
    highArc: false, aoe: 0, slow: 2.5, tether: false, pellets: 1, ballR: 0.3, recoil: 1, color: '#8a8f96',
  },
  havan: {
    kind: 'havan', name: 'Havan', desc: 'Yüksek kavis, alan hasarı. Adaların ardını vurur.',
    dmg: 24, range: 105, minRange: 28, reload: 4.2, speed: 50, arc: Math.PI, spread: 0.03,
    highArc: true, aoe: 9, slow: 0, tether: false, pellets: 1, ballR: 0.5, recoil: 2.2, color: '#2a2a33',
  },
  zipkin: {
    kind: 'zipkin', name: 'Zıpkın', desc: 'Hedefe halat atar ve onu kendine çeker.',
    dmg: 5, range: 48, minRange: 0, reload: 7, speed: 52, arc: 0.6, spread: 0.02,
    highArc: false, aoe: 0, slow: 0, tether: true, pellets: 1, ballR: 0.25, recoil: 0.6, color: '#b8862e',
  },
};

export const CANNON_KINDS = Object.keys(CANNONS) as CannonKind[];
export const MAX_CANNON_LEVEL = 10;

export interface CannonStats extends CannonDef {
  level: number;
}

/** Level scaling: damage grows fastest, reload and range improve a little. */
export function cannonStats(kind: CannonKind, level: number): CannonStats {
  const d = CANNONS[kind];
  const l = level - 1;
  return {
    ...d,
    level,
    dmg: d.dmg * (1 + 0.28 * l + 0.012 * l * l),
    reload: d.reload * Math.pow(0.97, l),
    range: d.range * (1 + 0.02 * l),
    speed: d.speed * Math.sqrt(1 + 0.02 * l),
  };
}

/** Rough sustained damage per second, used for power/level ratings. */
export function cannonDps(kind: CannonKind, level: number): number {
  const s = cannonStats(kind, level);
  return (s.dmg * s.pellets * (s.aoe > 0 ? 1.4 : 1)) / s.reload;
}

export function cannonUpgradeCost(level: number): number {
  return Math.round(120 * Math.pow(1.85, level - 1) / 10) * 10;
}
