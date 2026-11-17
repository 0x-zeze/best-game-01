// shots.js: the screenshot scenes behind ?shot=start|play|boss|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (kite away from the nearest enemy, keep the aim on the closest target, fire whenever one is
// in range), so every frame is what a short real game looks like and the same seed always gives
// the same frame. The end scene's pilot is deliberately clumsy — it walks into danger and
// never dashes — so it is caught out, as a hurried player is.

import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { angleTo, distance } from './random.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 30;
const BOSS_SECONDS = 12;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;

const silentSounds = {
  shoot() {}, hit() {}, kill() {}, hurt() {}, pickup() {}, dash() {},
  nova() {}, waveClear() {}, bossRoar() {}, gameOver() {}, win() {},
  musicTick() {}, startMusic() {}, stopMusic() {},
};

function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = distance(state.player.x, state.player.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return { enemy: best, dist: bestD };
}

// Steer: flee the nearest enemy when it is close, otherwise strafe toward the middle of the
// arena and keep firing at the closest target. `skill` 1.0 plays well; 0.35 plays badly.
function autopilot(state, skill) {
  const p = state.player;
  const { enemy, dist } = nearestEnemy(state);
  let mx = 0;
  let my = 0;
  if (enemy) {
    const danger = 150 + (1 - skill) * 120;
    if (dist < danger) {
      const a = angleTo(enemy.x, enemy.y, p.x, p.y);
      mx = Math.cos(a);
      my = Math.sin(a);
    } else if (dist > 320) {
      const a = angleTo(p.x, p.y, enemy.x, enemy.y);
      mx = Math.cos(a) * 0.7;
      my = Math.sin(a) * 0.7;
    } else {
      // Strafe around the target.
      const a = angleTo(p.x, p.y, enemy.x, enemy.y) + Math.PI / 2;
      mx = Math.cos(a) * 0.8;
      my = Math.sin(a) * 0.8;
    }
  }
  // Drift back toward the centre so the pilot never hugs a wall.
  mx += (640 - p.x) / 640 * 0.25;
  my += (390 - p.y) / 390 * 0.25;
  const len = Math.hypot(mx, my) || 1;
  const aimAngle = enemy ? angleTo(p.x, p.y, enemy.x, enemy.y) : -Math.PI / 2;
  return {
    move: { x: mx / len, y: my / len },
    aimAngle,
    firing: !!enemy && dist < 520,
    dash: skill > 0.8 && dist < 90 && p.dashCooldown <= 0,
    nova: false,
  };
}

function simulate(world, seconds, skill) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    const controls = autopilot(world.state, skill);
    const events = world.step(STEP, controls, silentSounds, false);
    if (events & EVENT_OVER) return true;
    if (world.won) return false;
  }
  return false;
}

/**
 * Set `world` to the named scene (start, play, boss or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, autopilot(world.state, 1), silentSounds, true);
    return { screen: SCREEN_TITLE, best: 1240 };
  }
  if (name === 'play') {
    simulate(world, PLAY_SECONDS, 1);
    const over = world.state.player.health <= 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: Math.max(1240, world.state.score) };
  }
  if (name === 'boss') {
    // Fast-forward to wave 5: clear the earlier waves by simulating with a strong pilot,
    // then heal the keeper back to full and let the Warden arrive and fight it.
    let guard = 0;
    while (world.state.wave < 5 && guard < 8) {
      simulate(world, 40, 1);
      guard += 1;
      if (world.state.player.health <= 0) break;
    }
    world.state.player.health = 5;
    world.state.player.invuln = 1;
    simulate(world, BOSS_SECONDS, 1);
    const over = world.state.player.health <= 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: Math.max(1240, world.state.score) };
  }
  // end: a weak pilot that never dashes and walks toward enemies.
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    const p = world.state.player;
    const { enemy } = nearestEnemy(world.state);
    const controls = enemy
      ? { move: { x: Math.cos(angleTo(p.x, p.y, enemy.x, enemy.y)) * 0.5, y: Math.sin(angleTo(p.x, p.y, enemy.x, enemy.y)) * 0.5 }, aimAngle: angleTo(p.x, p.y, enemy.x, enemy.y), firing: true, dash: false, nova: false }
      : { move: { x: 0, y: 0 }, aimAngle: -Math.PI / 2, firing: false, dash: false, nova: false };
    const events = world.step(STEP, controls, silentSounds, false);
    if (events & EVENT_OVER) break;
  }
  return { screen: SCREEN_OVER, best: Math.max(1240, world.state.score) };
}
