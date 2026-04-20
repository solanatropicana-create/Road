import { HOUSE_EDGE, MULTIPLIER_GROWTH_RATE } from '../config/tuning';

// Stub provably-fair crash point sampler. Replace with a seed+hash driven
// implementation when the backend is ready; the signature is the contract.
export function provablyFairCrashPoint(houseEdge: number = HOUSE_EDGE): number {
  if (Math.random() < houseEdge) return 1.0;
  const u = Math.random();
  const raw = (1 - houseEdge) / Math.max(1e-12, 1 - u);
  const truncated = Math.floor(raw * 100) / 100;
  return Math.max(1.0, truncated);
}

export function multiplierAt(
  elapsedSeconds: number,
  growthRate: number = MULTIPLIER_GROWTH_RATE,
): number {
  if (elapsedSeconds <= 0) return 1.0;
  return Math.exp(growthRate * elapsedSeconds);
}

export interface CrashSessionHooks {
  onCrashPoint?(crashPoint: number): void;
  onCashOut?(multiplier: number): void;
}

type SessionStatus = 'idle' | 'running' | 'ended';

export class CrashSession {
  private hooks: CrashSessionHooks;
  private growthRate: number;
  private houseEdge: number;
  private startMs = 0;
  private endedAtMs: number | null = null;
  private status: SessionStatus = 'idle';
  crashPoint = 1.0;

  constructor(
    hooks: CrashSessionHooks = {},
    growthRate: number = MULTIPLIER_GROWTH_RATE,
    houseEdge: number = HOUSE_EDGE,
  ) {
    this.hooks = hooks;
    this.growthRate = growthRate;
    this.houseEdge = houseEdge;
  }

  start(): void {
    this.startMs = performance.now();
    this.endedAtMs = null;
    this.crashPoint = provablyFairCrashPoint(this.houseEdge);
    this.status = 'running';
    this.hooks.onCrashPoint?.(this.crashPoint);
  }

  currentMultiplier(): number {
    if (this.status === 'idle') return 1.0;
    const nowMs = this.endedAtMs ?? performance.now();
    const elapsed = (nowMs - this.startMs) / 1000;
    return multiplierAt(elapsed, this.growthRate);
  }

  cashOut(): number {
    const m = this.currentMultiplier();
    if (this.status === 'running') {
      this.endedAtMs = performance.now();
      this.status = 'ended';
      this.hooks.onCashOut?.(m);
    }
    return m;
  }

  end(): number {
    const m = this.currentMultiplier();
    if (this.status === 'running') {
      this.endedAtMs = performance.now();
      this.status = 'ended';
    }
    return m;
  }

  reset(): void {
    this.startMs = 0;
    this.endedAtMs = null;
    this.crashPoint = 1.0;
    this.status = 'idle';
  }

  isRunning(): boolean {
    return this.status === 'running';
  }
}
