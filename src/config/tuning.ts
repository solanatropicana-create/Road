export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 800;
export const BACKGROUND_COLOR = 0x05030a;

export const LANE_COUNT = 3;
export const LANE_WIDTH = 110;
export const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;
export const ROAD_LEFT_X = (CANVAS_WIDTH - ROAD_WIDTH) / 2;

export const LANE_X_CENTERS: readonly number[] = Array.from(
  { length: LANE_COUNT },
  (_, i) => ROAD_LEFT_X + LANE_WIDTH * (i + 0.5),
);

export const PLAYER_Y = 680;
export const PLAYER_WIDTH = 46;
export const PLAYER_HEIGHT = 78;
export const PLAYER_COLOR = 0x00f0ff;
export const PLAYER_ACCENT = 0xff3cf0;
export const PLAYER_LANE_LERP_MS = 170;
export const PLAYER_START_LANE = 1;
export const PLAYER_HITBOX_INSET = 4;

export const TRAFFIC_RELATIVE_SPEED = 420;
export const TRAFFIC_SPAWN_MIN_MS = 380;
export const TRAFFIC_SPAWN_MAX_MS = 900;
export const TRAFFIC_MIN_LANE_GAP_PX = 220;
export const TRAFFIC_POOL_SIZE = 24;
export const TRAFFIC_WIDTH = 46;
export const TRAFFIC_HEIGHT = 82;
export const TRAFFIC_COLORS: readonly number[] = [0xff3cf0, 0x7a3cff, 0xff8a3c, 0x3cffb8];
export const TRAFFIC_HITBOX_INSET = 4;
export const TRAFFIC_OFFSCREEN_MARGIN = 120;

export const ROAD_SCROLL_SPEED = 520;
export const LANE_STRIPE_LENGTH = 44;
export const LANE_STRIPE_GAP = 32;
export const LANE_STRIPE_WIDTH = 6;
export const LANE_STRIPE_COLOR = 0x9cf4ff;
export const ROAD_EDGE_COLOR = 0xff2cf0;
export const ROAD_EDGE_WIDTH = 3;
export const PARALLAX_BG_SPEED = 140;
export const PARALLAX_LINE_COUNT = 10;
export const PARALLAX_LINE_COLOR = 0x1a0a2e;

export const MULTIPLIER_GROWTH_RATE = 0.09;

export const HOUSE_EDGE = 0.03;

export const BLOOM_THRESHOLD = 0.35;
export const BLOOM_SCALE = 1.1;
export const BLOOM_BRIGHTNESS = 1.0;
export const BLOOM_BLUR = 8;
export const BLOOM_QUALITY = 6;

export const CHROMATIC_R_OFFSET: readonly [number, number] = [1.6, 0];
export const CHROMATIC_G_OFFSET: readonly [number, number] = [0, 0];
export const CHROMATIC_B_OFFSET: readonly [number, number] = [-1.6, 0];

export const SPEED_LINE_COUNT = 22;
export const SPEED_LINE_SPEED_MIN = 900;
export const SPEED_LINE_SPEED_MAX = 1500;
export const SPEED_LINE_LENGTH_MIN = 40;
export const SPEED_LINE_LENGTH_MAX = 110;
export const SPEED_LINE_WIDTH = 2;
export const SPEED_LINE_COLOR = 0xcfe9ff;
export const SPEED_LINE_ALPHA_MIN = 0.15;
export const SPEED_LINE_ALPHA_MAX = 0.55;

export const THRUSTER_LENGTH = 44;
export const THRUSTER_WIDTH = 22;
export const THRUSTER_COLOR_INNER = 0xb4faff;
export const THRUSTER_COLOR_OUTER = 0x00f0ff;
export const THRUSTER_PULSE_SPEED = 12;
export const THRUSTER_PULSE_AMOUNT = 0.25;

export const KEY_LEFT: readonly string[] = ['ArrowLeft', 'KeyA'];
export const KEY_RIGHT: readonly string[] = ['ArrowRight', 'KeyD'];
export const KEY_RESTART: readonly string[] = ['Space', 'Enter'];

export const HUD_FONT_SIZE = 56;
export const HUD_FONT_FAMILY = '"Orbitron", "Segoe UI", system-ui, sans-serif';
export const HUD_COLOR = 0x00f0ff;
export const HUD_STROKE_COLOR = 0xff3cf0;
export const HUD_X = 24;
export const HUD_Y = 24;

export const GAMEOVER_OVERLAY_COLOR = 0x05030a;
export const GAMEOVER_OVERLAY_ALPHA = 0.78;
export const GAMEOVER_TITLE_COLOR = 0xff3cf0;
export const GAMEOVER_MULT_COLOR = 0x00f0ff;
