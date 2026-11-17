// world.js: the whole simulation. A fixed-step world: the player (a lantern-keeper) moves
// inside the arena, aims with the mouse, fires embers; waves of ember-eaters spawn at the
// edges and grow in number and speed; pickups drop from kills; every 5th wave a Warden boss
// arrives. Score comes from kills times a combo multiplier, plus wave-clear and boss bonuses.
// The world emits events (hit / over / wave clear / boss) and keeps particles, floating score
// text and screen shake as pure presentation state.

import { ARENA, ENEMIES, PICKUPS, PLAYER, SCORING, STEP, VIEW, WAVES } from './config.js';
import { angleTo, clamp, distance } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_BOSS = 8;
export const EVENT_PICKUP = 16;
export const EVENT_NOVA = 32;

let nextId = 1;

function makeEnemy(kind, x, y, wave, rng) {
  const def = ENEMIES[kind];
  const speedBoost = 1 + (wave - 1) * 0.045;
  return {
    id: nextId += 1,
    kind,
    x, y,
    vx: 0, vy: 0,
    radius: def.radius,
    speed: def.speed * speedBoost * rng.range(0.92, 1.08),
    health: def.health + Math.floor((wave - 1) / 4),
    maxHealth: def.health + Math.floor((wave - 1) / 4),
    score: def.score,
    touch: def.touch,
    shotTimer: rng.range(1, def.shotInterval ?? 2),
    flash: 0,
    wobble: rng.range(0, Math.PI * 2),
    spawnAge: 0,
  };
}

function edgeSpawn(rng) {
  const side = rng.int(0, 3);
  const m = 24;
  if (side === 0) return { x: rng.range(ARENA.x + m, ARENA.x + ARENA.width - m), y: ARENA.y + m };
  if (side === 1) return { x: rng.range(ARENA.x + m, ARENA.x + ARENA.width - m), y: ARENA.y + ARENA.height - m };
  if (side === 2) return { x: ARENA.x + m, y: rng.range(ARENA.y + m, ARENA.y + ARENA.height - m) };
  return { x: ARENA.x + ARENA.width - m, y: rng.range(ARENA.y + m, ARENA.y + ARENA.height - m) };
}

export function createWorld(rng) {
  const state = {
    time: 0,
    wave: 0,
    score: 0,
    kills: 0,
    combo: 1,
    comboTimer: 0,
    bestCombo: 1,
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    particles: [],
    floaters: [],
    stars: [],
    waveState: 'idle',
    waveTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    shake: 0,
    novaCharges: 1,
    shotsFired: 0,
    bossSpawned: false,
  };

  for (let i = 0; i < 90; i += 1) {
    state.stars.push({
      x: rng.range(0, VIEW.width), y: rng.range(0, VIEW.height),
      r: rng.range(0.6, 2.2), tw: rng.range(0, Math.PI * 2), speed: rng.range(0.4, 1.4),
    });
  }

  function resetPlayer() {
    state.player = {
      x: VIEW.width / 2, y: VIEW.height / 2 + 80,
      vx: 0, vy: 0,
      radius: PLAYER.radius,
      health: PLAYER.maxHealth,
      aim: -Math.PI / 2,
      fireTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashX: 0, dashY: 0,
      invuln: 0,
      rapidTimer: 0,
      shieldTimer: 0,
      novaFlash: 0,
      alive: true,
    };
  }

  function burst(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.angle();
      const s = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(life * 0.5, life), maxLife: life,
        radius: rng.range(1.5, 3.5), color,
      });
    }
    if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.0 });
  }

  function dropPickup(x, y) {
    const roll = rng.next();
    if (roll > 0.22) return;
    const kind = roll < 0.07 ? 'heart' : roll < 0.12 ? 'shield' : roll < 0.17 ? 'nova' : 'rapid';
    state.pickups.push({ kind, x, y, life: PICKUPS[kind].seconds, bob: rng.range(0, Math.PI * 2) });
  }

  function planWave(wave) {
    const queue = [];
    const count = WAVES.baseCount + (wave - 1) * WAVES.perWave;
    for (let i = 0; i < count; i += 1) {
      let kind = 'mote';
      const roll = rng.next();
      if (wave >= 3 && roll < 0.22) kind = 'spitter';
      else if (wave >= 2 && roll < 0.45) kind = 'splitter';
      queue.push(kind);
    }
    if (wave % WAVES.bossEvery === 0) queue.push('warden');
    // Shuffle so kinds arrive mixed.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.next() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  function clearWave(sounds) {
    state.waveState = 'idle';
    state.waveTimer = WAVES.betweenSeconds;
    state.score += SCORING.waveClearBonus * state.wave;
    // The lantern is mended between waves: one heart back and the nova rekindled.
    state.player.health = Math.min(PLAYER.maxHealth, state.player.health + 1);
    state.novaCharges = Math.min(3, state.novaCharges + 1);
    addFloater(VIEW.width / 2, VIEW.height / 2 - 60, `WAVE ${state.wave} CLEAR  +${SCORING.waveClearBonus * state.wave}`, '#4dd8c3');
    addFloater(VIEW.width / 2, VIEW.height / 2 - 30, 'lantern mended  +1 heart  +1 nova', '#ffd166');
    sounds.waveClear();
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = planWave(wave);
    state.spawnTimer = 0.4;
    state.waveState = 'spawning';
    state.bossSpawned = state.spawnQueue.includes('warden');
    return state.bossSpawned;
  }

  function killEnemy(enemy, awardScore) {
    const def = ENEMIES[enemy.kind];
    burst(enemy.x, enemy.y, def.glow, enemy.kind === 'warden' ? 60 : 16, 260, 0.6);
    burst(enemy.x, enemy.y, def.color, 8, 140, 0.4);
    state.shake = Math.min(14, state.shake + (enemy.kind === 'warden' ? 12 : 3));
    state.kills += 1;
    if (awardScore) {
      const gained = Math.round(enemy.score * state.combo);
      state.score += gained;
      addFloater(enemy.x, enemy.y - 10, `+${gained}`, '#ffd166');
      state.combo = Math.min(SCORING.comboCap, state.combo + SCORING.comboStep);
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.comboTimer = SCORING.comboWindow;
    }
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < ENEMIES.splitter.children; i += 1) {
        const child = makeEnemy('mote', enemy.x + rng.range(-18, 18), enemy.y + rng.range(-18, 18), state.wave, rng);
        child.health = 1;
        child.maxHealth = 1;
        state.enemies.push(child);
      }
    }
    if (enemy.kind === 'warden') {
      state.score += SCORING.bossBonus;
      addFloater(enemy.x, enemy.y - 50, `WARDEN DOWN  +${SCORING.bossBonus}`, '#ffc857');
      burst(enemy.x, enemy.y, '#ffc857', 40, 380, 1.0);
      for (let i = 0; i < 3; i += 1) dropPickup(enemy.x + rng.range(-50, 50), enemy.y + rng.range(-40, 40));
    }
    dropPickup(enemy.x, enemy.y);
  }

  function damagePlayer(amount, fromX, fromY) {
    const p = state.player;
    if (!p.alive || p.invuln > 0 || p.dashTimer > 0) return false;
    if (p.shieldTimer > 0) {
      p.shieldTimer = 0;
      burst(p.x, p.y, '#4dd8c3', 24, 300, 0.5);
      addFloater(p.x, p.y - 26, 'AEGIS HELD', '#4dd8c3');
      p.invuln = 0.8;
      return true;
    }
    p.health -= amount;
    p.invuln = PLAYER.invulnTime;
    state.shake = Math.min(18, state.shake + 8);
    burst(p.x, p.y, '#ff4757', 22, 320, 0.6);
    state.combo = 1;
    state.comboTimer = 0;
    return true;
  }

  function detonateNova() {
    const p = state.player;
    if (!p.alive || state.novaCharges <= 0) return false;
    state.novaCharges -= 1;
    p.novaFlash = 0.5;
    state.shake = 18;
    burst(p.x, p.y, '#9b7bff', 50, 520, 0.9);
    burst(p.x, p.y, '#ffd166', 30, 420, 0.7);
    const victims = state.enemies.filter((e) => distance(p.x, p.y, e.x, e.y) < 340);
    for (const e of victims) {
      e.health -= 6;
      if (e.health <= 0) killEnemy(e, true);
    }
    state.enemies = state.enemies.filter((e) => e.health > 0);
    state.enemyBullets.length = 0;
    return true;
  }

  function stepPlayer(dt, move, aimAngle, firing, wantDash, wantNova, sounds) {
    const p = state.player;
    if (!p.alive) return EVENT_NONE;
    p.aim = aimAngle;
    p.fireTimer -= dt;
    p.dashCooldown -= dt;
    p.invuln -= dt;
    p.rapidTimer -= dt;
    p.shieldTimer -= dt;
    p.novaFlash -= dt;
    if (wantNova && detonateNova()) return EVENT_NOVA;
    if (wantDash && p.dashCooldown <= 0 && p.dashTimer <= 0 && (move.x !== 0 || move.y !== 0)) {
      p.dashTimer = PLAYER.dashTime;
      p.dashCooldown = PLAYER.dashCooldown;
      p.dashX = move.x;
      p.dashY = move.y;
      p.invuln = Math.max(p.invuln, PLAYER.dashTime + 0.08);
      sounds.dash();
    }
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vx = p.dashX * PLAYER.dashSpeed;
      p.vy = p.dashY * PLAYER.dashSpeed;
      if (Math.random() < 0.6) state.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.1, vy: -p.vy * 0.1, life: 0.3, maxLife: 0.3, radius: 3, color: '#4dd8c3' });
    } else {
      p.vx += move.x * PLAYER.accel * dt;
      p.vy += move.y * PLAYER.accel * dt;
      const drag = Math.exp(-PLAYER.friction * dt);
      p.vx *= drag;
      p.vy *= drag;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > PLAYER.speed) { p.vx = (p.vx / speed) * PLAYER.speed; p.vy = (p.vy / speed) * PLAYER.speed; }
    }
    p.x = clamp(p.x + p.vx * dt, ARENA.x + p.radius, ARENA.x + ARENA.width - p.radius);
    p.y = clamp(p.y + p.vy * dt, ARENA.y + p.radius, ARENA.y + ARENA.height - p.radius);
    if (firing && p.fireTimer <= 0) {
      const interval = p.rapidTimer > 0 ? PLAYER.fireInterval * 0.5 : PLAYER.fireInterval;
      p.fireTimer = interval;
      state.shotsFired += 1;
      const spread = p.rapidTimer > 0 ? 0.09 : 0.03;
      const a = p.aim + rng.range(-spread, spread);
      state.bullets.push({
        x: p.x + Math.cos(p.aim) * (p.radius + 6),
        y: p.y + Math.sin(p.aim) * (p.radius + 6),
        vx: Math.cos(a) * PLAYER.bulletSpeed,
        vy: Math.sin(a) * PLAYER.bulletSpeed,
        radius: PLAYER.bulletRadius, damage: PLAYER.bulletDamage, life: 1.1,
      });
      sounds.shoot();
    }
    return EVENT_NONE;
  }

  function stepEnemies(dt, sounds) {
    const p = state.player;
    let events = EVENT_NONE;
    for (const e of state.enemies) {
      e.flash -= dt;
      e.spawnAge += dt;
      e.wobble += dt * 3;
      const d = distance(e.x, e.y, p.x, p.y);
      const a = angleTo(e.x, e.y, p.x, p.y);
      if (e.kind === 'spitter' || e.kind === 'warden') {
        // Keep a preferred range, strafe sideways, and shoot on a timer.
        const want = e.kind === 'warden' ? 300 : 260;
        const radial = d > want + 40 ? 1 : d < want - 40 ? -0.6 : 0;
        const strafe = Math.sin(e.wobble) * 0.7;
        e.vx = (Math.cos(a) * radial - Math.sin(a) * strafe) * e.speed;
        e.vy = (Math.sin(a) * radial + Math.cos(a) * strafe) * e.speed;
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && d < 560 && p.alive) {
          e.shotTimer = ENEMIES[e.kind].shotInterval * rng.range(0.85, 1.2);
          const count = e.kind === 'warden' ? 5 : 1;
          for (let i = 0; i < count; i += 1) {
            const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.28;
            const sa = a + spread;
            state.enemyBullets.push({
              x: e.x + Math.cos(sa) * (e.radius + 4), y: e.y + Math.sin(sa) * (e.radius + 4),
              vx: Math.cos(sa) * ENEMIES[e.kind].shotSpeed, vy: Math.sin(sa) * ENEMIES[e.kind].shotSpeed,
              radius: e.kind === 'warden' ? 8 : 6, life: 4,
            });
          }
          if (e.kind === 'warden') sounds.shoot();
        }
      } else {
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
        if (e.kind === 'splitter') {
          e.vx += Math.cos(e.wobble) * 26;
          e.vy += Math.sin(e.wobble) * 26;
        }
      }
      e.x = clamp(e.x + e.vx * dt, ARENA.x + e.radius, ARENA.x + ARENA.width - e.radius);
      e.y = clamp(e.y + e.vy * dt, ARENA.y + e.radius, ARENA.y + ARENA.height - e.radius);
      if (p.alive && d < e.radius + p.radius - 2) {
        if (damagePlayer(e.touch, e.x, e.y)) {
          sounds.hurt();
          events |= EVENT_HIT;
          // The attacker bounces off so one touch is one hit.
          e.x -= Math.cos(a) * 26;
          e.y -= Math.sin(a) * 26;
          if (p.health <= 0) {
            p.alive = false;
            burst(p.x, p.y, '#ffc857', 60, 420, 1.1);
            burst(p.x, p.y, '#ff7a3c', 30, 300, 0.8);
            state.shake = 20;
            events |= EVENT_OVER;
          }
        }
      }
    }
    return events;
  }

  function stepBullets(dt, sounds) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of state.enemies) {
        if (e.health <= 0) continue;
        if (distance(b.x, b.y, e.x, e.y) < b.radius + e.radius) {
          e.health -= b.damage;
          e.flash = 0.12;
          b.life = 0;
          burst(b.x, b.y, '#ffd166', 4, 160, 0.3);
          if (e.health <= 0) { killEnemy(e, true); sounds.kill(); }
          else sounds.hit();
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > ARENA.x - 20 && b.x < ARENA.x + ARENA.width + 20 && b.y > ARENA.y - 20 && b.y < ARENA.y + ARENA.height + 20);
    state.enemies = state.enemies.filter((e) => e.health > 0);
  }

  function stepEnemyBullets(dt, sounds) {
    const p = state.player;
    let events = EVENT_NONE;
    for (const b of state.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (p.alive && distance(b.x, b.y, p.x, p.y) < b.radius + p.radius - 2) {
        b.life = 0;
        if (damagePlayer(1, b.x, b.y)) {
          sounds.hurt();
          events |= EVENT_HIT;
          if (p.health <= 0) {
            p.alive = false;
            burst(p.x, p.y, '#ffc857', 60, 420, 1.1);
            state.shake = 20;
            events |= EVENT_OVER;
          }
        }
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => b.life > 0 && b.x > ARENA.x - 30 && b.x < ARENA.x + ARENA.width + 30 && b.y > ARENA.y - 30 && b.y < ARENA.y + ARENA.height + 30);
    return events;
  }

  function stepPickups(dt, sounds) {
    const p = state.player;
    let events = EVENT_NONE;
    for (const pk of state.pickups) {
      pk.life -= dt;
      pk.bob += dt * 3;
      if (p.alive && distance(pk.x, pk.y, p.x, p.y) < PLAYER.pickupRadius + 8) {
        pk.life = 0;
        sounds.pickup();
        events |= EVENT_PICKUP;
        if (pk.kind === 'heart') {
          p.health = Math.min(PLAYER.maxHealth, p.health + 1);
          addFloater(p.x, p.y - 26, '+1 HEART', '#ff6b81');
        } else if (pk.kind === 'rapid') {
          p.rapidTimer = PICKUPS.rapid.seconds;
          addFloater(p.x, p.y - 26, 'RAPID FIRE!', '#ffd166');
        } else if (pk.kind === 'shield') {
          p.shieldTimer = PICKUPS.shield.seconds;
          addFloater(p.x, p.y - 26, 'AEGIS SHIELD!', '#4dd8c3');
        } else if (pk.kind === 'nova') {
          state.novaCharges = Math.min(3, state.novaCharges + 1);
          addFloater(p.x, p.y - 26, '+1 NOVA BOMB', '#9b7bff');
        }
        burst(pk.x, pk.y, PICKUPS[pk.kind].color, 14, 220, 0.5);
      }
    }
    state.pickups = state.pickups.filter((pk) => pk.life > 0);
    return events;
  }

  function stepParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2.2 * dt);
      pt.vy *= Math.exp(-2.2 * dt);
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const f of state.floaters) { f.y -= 34 * dt; f.life -= dt * 0.9; }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    for (const s of state.stars) { s.tw += dt * s.speed; }
    state.shake = Math.max(0, state.shake - dt * 26);
  }

  return {
    state,
    reset() {
      state.time = 0;
      state.wave = 0;
      state.score = 0;
      state.kills = 0;
      state.combo = 1;
      state.comboTimer = 0;
      state.bestCombo = 1;
      state.enemies = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.pickups = [];
      state.particles = [];
      state.floaters = [];
      state.waveState = 'idle';
      state.waveTimer = WAVES.betweenSeconds;
      state.spawnQueue = [];
      state.novaCharges = 1;
      state.shotsFired = 0;
      state.bossSpawned = false;
      state.shake = 0;
      resetPlayer();
    },
    startNextWave() {
      const isBoss = startWave(state.wave + 1);
      return isBoss;
    },
    // Advance the world one fixed step. `controls` carries move, aimAngle, firing, dash, nova.
    // `attract` runs the demo behind the title screen (no firing, no damage, no score).
    step(dt, controls, sounds, attract = false) {
      state.time += dt;
      let events = EVENT_NONE;
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) state.combo = 1;
      }
      if (state.waveState === 'idle') {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0 && !attract) {
          if (startWave(state.wave + 1)) events |= EVENT_BOSS;
        }
      } else if (state.waveState === 'spawning') {
        state.spawnTimer -= dt;
        if (state.spawnQueue.length > 0 && state.spawnTimer <= 0) {
          state.spawnTimer = Math.max(0.25, WAVES.spawnInterval - state.wave * 0.04);
          const kind = state.spawnQueue.shift();
          const pos = edgeSpawn(rng);
          state.enemies.push(makeEnemy(kind, pos.x, pos.y, state.wave, rng));
          if (kind === 'warden') { sounds.bossRoar(); events |= EVENT_BOSS; }
        }
        if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
          clearWave(sounds);
          events |= EVENT_WAVE_CLEAR;
        }
      }
      if (attract) {
        // Title demo: a few motes drift toward the keeper, the keeper idles at the lantern.
        if (state.enemies.length < 5 && state.time % 1 < dt) {
          const pos = edgeSpawn(rng);
          state.enemies.push(makeEnemy('mote', pos.x, pos.y, 1, rng));
        }
        const p = state.player;
        p.aim = Math.sin(state.time * 0.5) * 1.2 - Math.PI / 2;
        for (const e of state.enemies) {
          const a = angleTo(e.x, e.y, p.x, p.y);
          e.x = clamp(e.x + Math.cos(a) * e.speed * 0.45 * dt, ARENA.x + e.radius, ARENA.x + ARENA.width - e.radius);
          e.y = clamp(e.y + Math.sin(a) * e.speed * 0.45 * dt, ARENA.y + e.radius, ARENA.y + ARENA.height - e.radius);
          e.wobble += dt * 3;
          e.spawnAge += dt;
        }
      } else {
        events |= stepPlayer(dt, controls.move, controls.aimAngle, controls.firing, controls.dash, controls.nova, sounds);
        events |= stepEnemies(dt, sounds);
        stepBullets(dt, sounds);
        events |= stepEnemyBullets(dt, sounds);
        events |= stepPickups(dt, sounds);
        if (state.waveState === 'spawning' && state.spawnQueue.length === 0 && state.enemies.length === 0) {
          clearWave(sounds);
          events |= EVENT_WAVE_CLEAR;
        }
      }
      stepParticles(dt);
      return events;
    },
    // The arena is won when the player clears wave 10 (the second Warden falls).
    get won() { return state.wave >= 10 && state.waveState === 'idle' && state.enemies.length === 0 && state.player.alive; },
  };
}
