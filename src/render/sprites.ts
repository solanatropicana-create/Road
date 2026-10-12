import { ANT_COLORS, packRGB } from './palette';

/**
 * Side-view pixel ants, drawn facing east with legs on the bottom row.
 * At 1 px = 1 mm a minor worker is 7 mm long, a major 9 mm, the queen 13 mm.
 * The bottom row sits on the ant's own cell, against whatever it walks on.
 */
const ART = {
  worker: [
    [
      '.......a',
      'hh...kk.',
      'ggpttkkm',
      '.l.l.l..',
    ],
    [
      '......a.',
      'hh...kk.',
      'ggpttkkm',
      'l..l..l.',
    ],
  ],
  soldier: [
    [
      '........a.',
      '......sr..',
      'hhh..trrr.',
      'gggpttrrrm',
      '.l..l..l..',
    ],
    [
      '.......a..',
      '......sr..',
      'hhh..trrr.',
      'gggpttrrrm',
      'l..l..l...',
    ],
  ],
  queen: [
    [
      '...........a.',
      '.hhhh...tkk..',
      'hggggg.tttkkm',
      'ggggggptttkk.',
      '..l..l..l.l..',
    ],
    [
      '..........a..',
      '.hhhh...tkk..',
      'hggggg.tttkkm',
      'ggggggptttkk.',
      '.l..l..l..l..',
    ],
  ],
  wings: [
    'xwwwwwww.....',
    '.wwwwwww.....',
  ],
} as const;

export interface SpritePx {
  u: number;
  r: number;
  c: number;
}

export type Caste = 'worker' | 'soldier' | 'queen';

function parse(rows: readonly string[], anchorCol: number): SpritePx[] {
  const out: SpritePx[] = [];
  const last = rows.length - 1;
  rows.forEach((row, ri) => {
    for (let ci = 0; ci < row.length; ci++) {
      const ch = row[ci]!;
      const col = ANT_COLORS[ch];
      if (!col) continue;
      out.push({ u: ci - anchorCol, r: ri - last, c: packRGB(col) });
    }
  });
  return out;
}

const ANCHOR: Record<Caste, number> = { worker: 4, soldier: 5, queen: 7 };

export const SPRITES: Record<Caste, SpritePx[][]> = {
  worker: ART.worker.map((f) => parse(f, ANCHOR.worker)),
  soldier: ART.soldier.map((f) => parse(f, ANCHOR.soldier)),
  queen: ART.queen.map((f) => parse(f, ANCHOR.queen)),
};

/** Wings sit on the queen's back until she tears them off after landing. */
export const WINGS: SpritePx[] = parse(ART.wings, ANCHOR.queen).map((p) => ({ ...p, r: p.r - 3 }));

/** Position of the mandibles (where carried items are drawn), in sprite space. */
export const MOUTH: Record<Caste, { u: number; r: number }> = {
  worker: { u: 4, r: -1 },
  soldier: { u: 5, r: -1 },
  queen: { u: 6, r: -2 },
};
