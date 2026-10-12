import { DAY_TICKS } from '../config';
import { clamp } from '../util/math';

/**
 * Time and climate.
 *
 * The day–night cycle runs as before (one in-game day is six minutes at 1x),
 * so behaviour keeps its real rhythm: foragers out in the cool of the
 * evening, nest doors closed at night. Biology runs on a slower calendar:
 * each in-game day stands for one week of the colony's life, so brood takes
 * the eight to twelve "weeks" it really takes and a worker lives a year or
 * two. The calendar is shown honestly as weeks and months.
 *
 * Temperature drives almost everything a harvester ant does, so it is
 * modelled from a site's monthly means: a daily wave at the surface (bare
 * soil in sun gets far hotter than the air) that fades with depth (about
 * 8 cm damping depth), on top of a seasonal wave that reaches much deeper.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface Climate {
  /** Mean air temperature for each month, °C (Jan..Dec). */
  tMonth: number[];
  /** Rain showers per in-game week, by month. */
  showers: number[];
  /** Share of summer showers that come as thunderstorms. */
  stormShare: number;
  /** Latitude in degrees (day length). */
  lat: number;
}

/** Pannonian loess steppe (Hortobágy edge / Weinviertel): ~550 mm, June peak. */
export const PANNONIAN: Climate = {
  tMonth: [-1, 1, 6, 11.5, 16.5, 19.5, 21.5, 21, 16.5, 11, 5, 0.5],
  showers: [0.5, 0.5, 0.6, 0.8, 1.0, 1.2, 1.0, 0.9, 0.7, 0.6, 0.7, 0.6],
  stormShare: 0.35,
  lat: 47.5,
};

const DAYS_IN_YEAR = 365;
/** Mid-month day of year, for interpolating monthly means. */
const MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export class Calendar {
  climate: Climate;
  /** Day of the year the queen lands (10 April: dealate queens are found in April near Vienna). */
  startDoy = 100;
  /** In-game day (tick / DAY_TICKS) the colony was founded; the calendar runs from there. */
  originDay = 0;
  /** This spot's own warmth: a south-facing slope runs warmer than the site's means, a north-facing one cooler. */
  tOffset = 0;
  /** How much hotter than a meadow the bare ground gets in sun (sand and rock heat up more). */
  heat = 1;
  /** Shade over the nest from a tree's crown, 0..1 (cuts the sun's heating). */
  shade = 0;

  constructor(climate: Climate) {
    this.climate = climate;
  }

  /** Real days since the landing, as a fraction (7 per in-game day). */
  elapsed(simDays: number): number {
    return Math.max(0, simDays - this.originDay) * 7;
  }

  /** Day of the year 0..364 (fractional). */
  doy(simDays: number): number {
    return (this.startDoy + this.elapsed(simDays)) % DAYS_IN_YEAR;
  }

  /** Year of the colony's life, from 1. */
  year(simDays: number): number {
    return Math.floor((this.startDoy + this.elapsed(simDays)) / DAYS_IN_YEAR) + 1;
  }

  month(doy: number): number {
    let m = 11;
    while (m > 0 && doy < MONTH_START[m]!) m--;
    return m;
  }

  /** Week of the month, 1..5. */
  weekOfMonth(doy: number): number {
    return Math.min(5, Math.floor((doy - MONTH_START[this.month(doy)]!) / 7) + 1);
  }

  /** Mean air temperature for this day of the year (smooth between monthly means). */
  airMean(doy: number): number {
    return this.monthMean(doy) + this.tOffset;
  }

  private monthMean(doy: number): number {
    const t = this.climate.tMonth;
    let k = 0;
    while (k < 11 && doy >= MID[k + 1]!) k++;
    const a = MID[k]!;
    const b = k < 11 ? MID[k + 1]! : MID[0]! + DAYS_IN_YEAR;
    if (doy < MID[0]!) {
      // January before mid-month: between December and January.
      const f = (doy + DAYS_IN_YEAR - MID[11]!) / (MID[0]! + DAYS_IN_YEAR - MID[11]!);
      return t[11]! + (t[0]! - t[11]!) * f;
    }
    const f = (doy - a) / (b - a);
    return t[k]! + (t[(k + 1) % 12]! - t[k]!) * f;
  }

  annualMean(): number {
    return this.climate.tMonth.reduce((s, v) => s + v, 0) / 12 + this.tOffset;
  }

  season(doy: number): Season {
    const m = this.month(doy);
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }

  /** Hours of daylight. */
  dayLength(doy: number): number {
    const decl = 23.44 * Math.sin(((2 * Math.PI) / DAYS_IN_YEAR) * (doy - 80));
    const lat = (this.climate.lat * Math.PI) / 180;
    const c = -Math.tan(lat) * Math.tan((decl * Math.PI) / 180);
    return (24 * Math.acos(clamp(c, -1, 1))) / Math.PI;
  }

  /** Sunrise and sunset as fractions of the day (0 = midnight). */
  sun(doy: number): { rise: number; set: number } {
    const half = this.dayLength(doy) / 48;
    return { rise: 0.5 - half, set: 0.5 + half };
  }

  /**
   * Solar time: the day remapped so that sunrise falls at 0.25 and sunset at
   * 0.75, whatever the season. The sky and the lighting are keyed to this.
   */
  solar(dayT: number, doy: number): number {
    const { rise, set } = this.sun(doy);
    if (dayT < rise) return (dayT / rise) * 0.25;
    if (dayT < set) return 0.25 + ((dayT - rise) / (set - rise)) * 0.5;
    return 0.75 + ((dayT - set) / (1 - set)) * 0.25;
  }

  /** Sun height 0..1 (0 at night). */
  daylight(dayT: number, doy: number): number {
    const s = this.solar(dayT, doy);
    return Math.max(0, Math.sin((s - 0.25) * Math.PI * 2));
  }

  /** How summery the season is, 0 (cold) .. 1 (high summer). */
  warmth(doy: number): number {
    return clamp((this.airMean(doy) - 4) / 17, 0, 1);
  }

  /**
   * Temperature of the soil surface, °C. Air temperature swings a few degrees
   * through the day; bare soil in sunshine heats far above the air (a July
   * noon reaches 45–50 °C, which is why harvester ants forage at dusk then).
   */
  surfaceTemp(dayT: number, doy: number, cloud: number, snow: number): number {
    const mean = this.airMean(doy);
    const warm = this.warmth(doy);
    const s = this.solar(dayT, doy);
    // Air: coolest just before dawn, warmest mid-afternoon.
    const air = mean + (3.5 + 3.5 * warm) * Math.sin((s - 0.33) * Math.PI * 2);
    const sunHeat = (5 + 18 * warm) * this.heat * this.daylight(dayT, doy) * (1 - 0.75 * clamp(cloud, 0, 1)) * (1 - this.shade);
    const t = air + sunHeat;
    // Snow holds the surface near freezing.
    return snow > 3 ? Math.min(t, 0) * 0.3 : t;
  }

  /** Soil temperature at a depth below the surface (mm), °C. */
  soilTemp(depthMm: number, dayT: number, doy: number, cloud: number, snow: number): number {
    const d = Math.max(0, depthMm);
    const mean = this.airMean(doy);
    const annual = this.annualMean();
    // The seasonal wave reaches deep (damping depth ~1.5 m); snow insulates.
    const insul = snow > 3 ? 0.55 : 1;
    const seasonal = annual + (mean - annual) * Math.exp(-d / 1500) * insul + (snow > 3 ? 1.5 : 0);
    const surf = this.surfaceTemp(dayT, doy, cloud, snow);
    return seasonal + (surf - mean) * Math.exp(-d / 80);
  }
}

/**
 * Development rate of brood at a temperature, 0..1: nothing below 8 °C, full
 * speed from 22 to 31 °C (keepers raise Messor brood in 8–12 weeks at
 * 22–27 °C), slowing again in the heat and stopping at 38 °C.
 */
export function devRate(t: number): number {
  if (t <= 8 || t >= 38) return 0;
  if (t < 22) return (t - 8) / 14;
  if (t <= 31) return 1;
  return (38 - t) / 7;
}

/** How willing foragers are to go out at this surface temperature, 0..1 (Messor: about 12–40 °C). */
export function forageWindow(t: number): number {
  if (t <= 11 || t >= 41) return 0;
  if (t < 15) return (t - 11) / 4;
  if (t <= 36) return 1;
  return (41 - t) / 5;
}

/** Metabolic rate relative to a warm summer day (food use and ageing), 0.1..1.2. */
export function metabolism(t: number): number {
  return clamp((t - 2) / 22, 0.1, 1.2);
}

/** Ticks per real week (one in-game day). */
export const WEEK_TICKS = DAY_TICKS;
