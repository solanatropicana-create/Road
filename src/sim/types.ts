export const Carry = {
  None: 0,
  Soil: 1,
  Seed: 2,
  Fruit: 3,
  Egg: 4,
  Larva: 5,
  Pupa: 6,
  Corpse: 7,
  Refuse: 8,
} as const;
export type CarryKind = (typeof Carry)[keyof typeof Carry];

export const Task = {
  Idle: 0,
  Dig: 1,
  Forage: 2,
  Nurse: 3,
  Clean: 4,
  Found: 5,
} as const;
export type TaskKind = (typeof Task)[keyof typeof Task];

/** The work the player weighs in the colony brain (mode B). */
export const WORK = ['dig', 'forage', 'nurse', 'clean'] as const;
export type Work = (typeof WORK)[number];

export const TASK_LABEL: Record<TaskKind, string> = {
  [Task.Idle]: 'resting',
  [Task.Dig]: 'digging',
  [Task.Forage]: 'foraging',
  [Task.Nurse]: 'nursing',
  [Task.Clean]: 'cleaning',
  [Task.Found]: 'founding',
};

/** Minor worker, major ("soldier", the big-headed seed crusher) or queen. */
export type Caste = 'worker' | 'soldier' | 'queen';

export type ChamberKind = 'queen' | 'nursery' | 'granary' | 'rest';
