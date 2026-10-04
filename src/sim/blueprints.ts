/** Ship layouts, drawn nose-up. See CHAR_MAP in defs.ts for the legend. */
export interface Blueprint {
  id: string;
  name: string;
  blurb: string;
  rows: string[];
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'serce',
    name: 'Serçe',
    blurb: 'Çevik avcı · 3 otomatik top',
    rows: [
      '....@C@....',
      '...^#+#^...',
      '.4C+++++C6.',
      '..#+GBG+#..',
      '..#++R++#..',
      '.4++@S@++6.',
      '..#v#.#v#..',
    ],
  },
  {
    id: 'kaplumbaga',
    name: 'Kaplumbağa',
    blurb: 'Zırhlı tank · 3 lazer · çift reaktör',
    rows: [
      '..^..@L@..^..',
      '..+@@#+#@@+..',
      '.@+++++++++@.',
      'L++#GRBRG#++L',
      '4+@@++S++@@+6',
      '.@@#+@@@+#@@.',
      '..@#v...v#@..',
    ],
  },
  {
    id: 'ari',
    name: 'Arı',
    blurb: 'Hafif akıncı · top + lazer · çok hızlı',
    rows: [
      '..@C@..',
      '.4^+^6.',
      '.@+B+@.',
      '.L+R+L.',
      '.4SG+6.',
      '..v@v..',
    ],
  },
];

export const blueprintById = (id: string): Blueprint => BLUEPRINTS.find((b) => b.id === id) ?? BLUEPRINTS[0]!;
