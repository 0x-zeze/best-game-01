// EMBERFALL — Arena of the Last Lantern.
// config.js: every tuning number and colour in one place, so the world, the renderer and the
// shot scenes all agree on the same game. The arena is a fixed 1280x720 logical field drawn
// onto the canvas; the game scales it to the window with letterboxing.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'emberfall.best.score';
export const ARENA = { x: 48, y: 96, width: 1184, height: 576 };

export const PALETTE = {
  bgDeep: '#0a0a18',
  bgMid: '#12122a',
  bgGlow: '#1d1b3a',
  arenaLine: '#3a3560',
  arenaFill: '#101024',
  gold: '#ffc857',
  ember: '#ff7a3c',
  emberHot: '#ffd166',
  teal: '#4dd8c3',
  violet: '#9b7bff',
  rose: '#ff5d8f',
  bone: '#f2ead8',
  dim: '#8a87a8',
  danger: '#ff4757',
  heart: '#ff6b81',
};

export const PLAYER = {
  radius: 16,
  speed: 300,
  accel: 2400,
  friction: 6.5,
  maxHealth: 5,
  fireInterval: 0.16,
  bulletSpeed: 620,
  bulletRadius: 5,
  bulletDamage: 1,
  dashSpeed: 780,
  dashTime: 0.16,
  dashCooldown: 1.1,
  invulnTime: 1.0,
  pickupRadius: 30,
};

export const WAVES = {
  // Enemies per wave grow with the wave number; the boss arrives every 5th wave.
  baseCount: 6,
  perWave: 3,
  betweenSeconds: 3.0,
  bossEvery: 5,
  spawnInterval: 0.9,
};

// Enemy kinds: chaser, spitter, splitter, warden (boss).
export const ENEMIES = {
  mote: { radius: 14, speed: 118, health: 2, score: 50, touch: 1, color: '#ff5d8f', glow: '#ff8fb0' },
  spitter: { radius: 15, speed: 82, health: 3, score: 80, touch: 1, color: '#9b7bff', glow: '#c3aaff', shotInterval: 2.4, shotSpeed: 230 },
  splitter: { radius: 20, speed: 92, health: 4, score: 120, touch: 1, color: '#4dd8c3', glow: '#8ff0dd', children: 2 },
  warden: { radius: 44, speed: 62, health: 60, score: 1500, touch: 2, color: '#ffc857', glow: '#ffe29a', shotInterval: 1.7, shotSpeed: 260 },
};

export const PICKUPS = {
  heart: { color: '#ff6b81', label: 'HEART', seconds: 12 },
  rapid: { color: '#ffd166', label: 'RAPID FIRE', seconds: 10 },
  shield: { color: '#4dd8c3', label: 'AEGIS SHIELD', seconds: 12 },
  nova: { color: '#9b7bff', label: 'NOVA BOMB', seconds: 10 },
};

export const SCORING = {
  comboWindow: 3.0,
  comboStep: 0.25,
  comboCap: 4,
  waveClearBonus: 250,
  bossBonus: 1000,
};
