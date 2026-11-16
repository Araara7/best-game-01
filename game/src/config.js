// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 310,
  dashSpeed: 980,
  dashTime: 0.16,
  dashCooldown: 1.1,
  fireInterval: 0.22,
  fireRange: 640,
  bulletSpeed: 580,
  bulletRadius: 5,
  invulnerable: 1.2,
  maxLives: 3,
};

export const ENEMY = {
  chaser: { radius: 15, speed: 108, speedPerWave: 4, hp: 2, score: 50 },
  weaver: { radius: 13, speed: 155, speedPerWave: 5, hp: 1, score: 70 },
  spitter: { radius: 16, speed: 72, hp: 3, score: 100, shootInterval: 2.4, keepRange: 330, bulletSpeed: 210 },
  elite: { radius: 24, speed: 92, hp: 10, score: 250 },
  boss: { radius: 46, speed: 56, hp: 70, hpPerBoss: 30, score: 1000, burstInterval: 2.6, burstCount: 12, summonInterval: 6, bulletSpeed: 190 },
};

/** Light shards: what enemies drop, what the combo feeds on. */
export const SHARD = { radius: 7, value: 10, life: 14, streakForLife: 20 };

/** Combo: kills and shards refresh the window; every 4 combo raises the multiplier. */
export const COMBO = { window: 3, max: 24, perMultiplier: 4, maxMultiplier: 7 };

export const POWERUP = {
  spread: { duration: 12 },
  shield: { duration: 20 },
  magnet: { duration: 12 },
};

/** Waves: how many enemies a wave holds, the breather between waves, the boss cadence. */
export const WAVE = {
  baseCount: 8,
  perWave: 3,
  maxCount: 44,
  breather: 2.5,
  spawnInterval: 0.5,
  bossEvery: 5,
};

/** How many of each thing can exist at once; the pools are allocated once, at boot. */
export const POOL = { enemies: 48, pbullets: 64, ebullets: 96, shards: 96, powerups: 8, particles: 256 };

export const PALETTE = {
  backdrop: '#04060d',
  field: '#070b18',
  grid: '#0e1730',
  border: '#1c2c52',
  player: '#5ff2ff',
  playerCore: '#e8feff',
  shard: '#ffd75e',
  pbullet: '#aef6ff',
  ebullet: '#ff8fa3',
  chaser: '#ff5d73',
  weaver: '#c792ff',
  spitter: '#ff9f43',
  elite: '#ff4d6d',
  boss: '#ff2e63',
  text: '#eaf6ff',
  muted: '#7d8aa5',
  panel: '#0d1526',
  panelEdge: '#24406e',
  gold: '#ffd75e',
  danger: '#ff5d73',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-drift.best';
