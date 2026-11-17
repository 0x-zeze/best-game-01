// render.js: everything the player sees, drawn on one canvas. A starfield and a vignette
// frame the arena; the keeper is a little lantern with a flame, enemies are drawn as distinct
// shapes (spiky mote, horned spitter, ringed splitter, crowned Warden); particles, floating
// score text, a wave banner, the HUD (score, wave, hearts, combo, nova charges, dash) and the
// four screens (title, play, paused, game over / victory) all live here.

import { ARENA, ENEMIES, PALETTE, PICKUPS, PLAYER, VIEW, WAVES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx, x, y, size, color, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 16, size / 16);
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.bezierCurveTo(-11, -4, -6, -12, 0, -6);
  ctx.bezierCurveTo(6, -12, 11, -4, 0, 5);
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

function drawLantern(ctx, x, y, radius, aim, flame, shield, invuln, dashing) {
  ctx.save();
  ctx.translate(x, y);
  if (shield > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10 + Math.sin(flame * 4) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(77,216,195,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  // Glow halo.
  const glow = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 3.2);
  glow.addColorStop(0, 'rgba(255,200,87,0.45)');
  glow.addColorStop(1, 'rgba(255,200,87,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 3.2, 0, Math.PI * 2);
  ctx.fill();
  // Body: brass lantern.
  ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = '#8a6d2f';
  ctx.fillRect(-radius * 0.55, -radius * 1.05, radius * 1.1, radius * 0.35);
  ctx.fillStyle = '#ffd166';
  roundRect(ctx, -radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4, 5);
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  roundRect(ctx, -radius * 0.42, -radius * 0.45, radius * 0.84, radius * 0.9, 3);
  ctx.fill();
  // Flame flicker inside.
  ctx.fillStyle = flame % 2 < 1 ? '#ff7a3c' : '#ff9e57';
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.1, radius * 0.2, radius * 0.32 + Math.sin(flame * 9) * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a6d2f';
  ctx.fillRect(-radius * 0.55, radius * 0.7, radius * 1.1, radius * 0.3);
  ctx.restore();
  if (invuln > 0 && Math.floor(flame * 10) % 2 === 0) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#f2ead8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (dashing) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#4dd8c3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(ctx, e, time) {
  const def = ENEMIES[e.kind];
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.spawnAge < 0.4) {
    ctx.globalAlpha = e.spawnAge / 0.4;
    ctx.strokeStyle = def.glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 14 * (1 - e.spawnAge / 0.4), 0, Math.PI * 2);
    ctx.stroke();
  }
  const flash = e.flash > 0;
  ctx.fillStyle = flash ? '#ffffff' : def.color;
  ctx.strokeStyle = def.glow;
  ctx.lineWidth = 2;
  if (e.kind === 'mote') {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + time * 0.8;
      const r = i % 2 === 0 ? e.radius + 5 : e.radius - 3;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a0b12';
    ctx.beginPath();
    ctx.arc(-4, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(4, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'spitter') {
    ctx.beginPath();
    ctx.moveTo(0, -e.radius - 8);
    ctx.lineTo(e.radius * 0.8, e.radius * 0.6);
    ctx.lineTo(-e.radius * 0.8, e.radius * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a0b1e';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'splitter') {
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = def.glow;
    ctx.stroke();
    ctx.fillStyle = '#0b1a16';
    ctx.beginPath();
    ctx.arc(-5, -3, 2.5, 0, Math.PI * 2);
    ctx.arc(5, -3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Warden: big crowned lantern-eater.
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 12 - 6, -e.radius + 4);
      ctx.lineTo(i * 12, -e.radius - 14);
      ctx.lineTo(i * 12 + 6, -e.radius + 4);
      ctx.closePath();
      ctx.fillStyle = def.glow;
      ctx.fill();
    }
    ctx.fillStyle = '#1a1206';
    ctx.beginPath();
    ctx.arc(-12, -4, 4, 0, Math.PI * 2);
    ctx.arc(12, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Angry brows and a frown: this one is not smiling.
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-17, -13);
    ctx.lineTo(-7, -9);
    ctx.moveTo(17, -13);
    ctx.lineTo(7, -9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 16, 11, 1.2 * Math.PI, 1.8 * Math.PI);
    ctx.stroke();
  }
  // Health bar for tough enemies.
  if (e.maxHealth > 3) {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-w / 2, -e.radius - 12, w, 5);
    ctx.fillStyle = def.glow;
    ctx.fillRect(-w / 2, -e.radius - 12, w * Math.max(0, e.health / e.maxHealth), 5);
  }
  ctx.restore();
}

function drawPickup(ctx, pk) {
  const def = PICKUPS[pk.kind];
  const bob = Math.sin(pk.bob) * 4;
  const blink = pk.life < 3 ? (Math.floor(pk.life * 6) % 2 === 0 ? 0.35 : 1) : 1;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.translate(pk.x, pk.y + bob);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, def.color + '66');
  glow.addColorStop(1, def.color + '00');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0a18';
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (pk.kind === 'heart') drawHeart(ctx, 0, 2, 14, def.color, true);
  else {
    ctx.fillStyle = def.color;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pk.kind === 'rapid' ? '»' : pk.kind === 'shield' ? '◈' : '✦', 0, 1);
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  let banner = null;
  let bannerTimer = 0;

  function showBanner(text, sub) {
    banner = { text, sub };
    bannerTimer = 2.4;
  }

  function drawBackground(state) {
    ctx.fillStyle = PALETTE.bgDeep;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const grad = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 80, VIEW.width / 2, VIEW.height / 2, 700);
    grad.addColorStop(0, PALETTE.bgGlow);
    grad.addColorStop(1, PALETTE.bgDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    for (const s of state.stars) {
      const a = 0.25 + 0.55 * Math.abs(Math.sin(s.tw));
      ctx.fillStyle = `rgba(242,234,216,${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Arena floor.
    ctx.fillStyle = PALETTE.arenaFill;
    roundRect(ctx, ARENA.x, ARENA.y, ARENA.width, ARENA.height, 18);
    ctx.fill();
    ctx.strokeStyle = PALETTE.arenaLine;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(58,53,96,0.5)';
    ctx.lineWidth = 1;
    for (let x = ARENA.x + 148; x < ARENA.x + ARENA.width; x += 148) {
      ctx.beginPath(); ctx.moveTo(x, ARENA.y); ctx.lineTo(x, ARENA.y + ARENA.height); ctx.stroke();
    }
    for (let y = ARENA.y + 144; y < ARENA.y + ARENA.height; y += 144) {
      ctx.beginPath(); ctx.moveTo(ARENA.x, y); ctx.lineTo(ARENA.x + ARENA.width, y); ctx.stroke();
    }
    // A faint lantern glow at the arena centre.
    const cg = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 10, VIEW.width / 2, VIEW.height / 2, 260);
    cg.addColorStop(0, 'rgba(255,200,87,0.07)');
    cg.addColorStop(1, 'rgba(255,200,87,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
  }

  function drawHud(state, best, muted) {
    const p = state.player;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Title bar.
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EMBERFALL', 48, 34);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '14px monospace';
    ctx.fillText('arena of the last lantern', 200, 36);
    // Score block, right side.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.bone;
    ctx.font = 'bold 26px monospace';
    ctx.fillText(String(state.score).padStart(6, '0'), VIEW.width - 48, 34);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '13px monospace';
    ctx.fillText(`BEST ${best}`, VIEW.width - 48, 58);
    // Wave + kills.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.bone;
    ctx.font = 'bold 18px monospace';
    const waveLabel = state.wave === 0 ? 'GET READY' : state.waveState === 'idle' ? `WAVE ${state.wave} CLEAR` : `WAVE ${state.wave}`;
    ctx.fillText(waveLabel, VIEW.width / 2, 30);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '13px monospace';
    ctx.fillText(`${state.kills} banished   •   x${state.combo.toFixed(2)} combo`, VIEW.width / 2, 54);
    // Hearts.
    for (let i = 0; i < PLAYER.maxHealth; i += 1) {
      drawHeart(ctx, 62 + i * 30, 76, 15, i < p.health ? PALETTE.heart : '#3a3560', i < p.health);
    }
    // Nova charges.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.violet;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`NOVA ${'✦'.repeat(state.novaCharges)}${'·'.repeat(Math.max(0, 3 - state.novaCharges))}  [E]`, 48, 106);
    // Dash + rapid + shield timers.
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '13px monospace';
    const dashReady = p.dashCooldown <= 0;
    ctx.fillText(dashReady ? 'DASH ready [Space]' : `DASH ${Math.max(0, p.dashCooldown).toFixed(1)}s`, 48, 128);
    if (p.rapidTimer > 0) { ctx.fillStyle = PALETTE.gold; ctx.fillText(`RAPID ${p.rapidTimer.toFixed(0)}s`, 220, 128); }
    if (p.shieldTimer > 0) { ctx.fillStyle = PALETTE.teal; ctx.fillText(`AEGIS ${p.shieldTimer.toFixed(0)}s`, 320, 128); }
    // Combo bar.
    if (state.combo > 1) {
      const w = 160;
      ctx.fillStyle = 'rgba(255,200,87,0.25)';
      ctx.fillRect(VIEW.width / 2 - w / 2, 66, w, 5);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(VIEW.width / 2 - w / 2, 66, w * (state.comboTimer / 3), 5);
    }
    // Controls hint + mute, bottom.
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WASD move  •  mouse aim  •  hold click to fire  •  Space dash  •  E nova  •  P pause', 48, VIEW.height - 16);
    ctx.textAlign = 'right';
    ctx.fillText(muted ? 'M: sound OFF' : 'M: sound on', VIEW.width - 48, VIEW.height - 16);
    ctx.restore();
  }

  function drawWorld(state) {
    // Enemy bullets (under everything else that moves).
    for (const b of state.enemyBullets) {
      ctx.fillStyle = '#c3aaff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pk of state.pickups) drawPickup(ctx, pk);
    for (const e of state.enemies) drawEnemy(ctx, e, state.time);
    // Player bullets: glowing embers.
    for (const b of state.bullets) {
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.radius * 2.4);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, '#ff7a3c');
      g.addColorStop(1, 'rgba(255,122,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    if (p.alive) {
      drawLantern(ctx, p.x, p.y, p.radius, p.aim, state.time, p.shieldTimer, p.invuln, p.dashTimer > 0);
      // Aim tick.
      ctx.strokeStyle = 'rgba(242,234,216,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.aim) * (p.radius + 8), p.y + Math.sin(p.aim) * (p.radius + 8));
      ctx.lineTo(p.x + Math.cos(p.aim) * (p.radius + 18), p.y + Math.sin(p.aim) * (p.radius + 18));
      ctx.stroke();
    }
    if (p.novaFlash > 0) {
      ctx.fillStyle = `rgba(155,123,255,${(p.novaFlash * 0.7).toFixed(2)})`;
      ctx.fillRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
    }
    // Particles and floating score text.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,10,24,0.88)';
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = PALETTE.arenaLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function bigButton(id, x, y, w, h, label, input) {
    ctx.fillStyle = PALETTE.gold;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#1a1206';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    if (input) input.registerButton(id, x, y, w, h);
  }

  function drawTitle(state, best, input) {
    ctx.fillStyle = 'rgba(5,5,16,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 360, 130, 720, 440);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 64px monospace';
    ctx.fillText('EMBERFALL', VIEW.width / 2, 205);
    ctx.fillStyle = PALETTE.bone;
    ctx.font = '20px monospace';
    ctx.fillText('— arena of the last lantern —', VIEW.width / 2, 248);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '16px monospace';
    ctx.fillText('The dark is eating the light. Keep your lantern burning.', VIEW.width / 2, 292);
    ctx.fillText('Banish the ember-eaters, chain combos, fell the Warden.', VIEW.width / 2, 318);
    ctx.fillStyle = PALETTE.bone;
    ctx.font = '15px monospace';
    ctx.fillText('WASD / arrows — move      Mouse — aim      Hold click — fire', VIEW.width / 2, 368);
    ctx.fillText('Space — dash      E — nova bomb      P — pause      M — mute', VIEW.width / 2, 392);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '14px monospace';
    ctx.fillText('Clear wave 10 to win. Survive. The lantern must not go out.', VIEW.width / 2, 424);
    bigButton('start', VIEW.width / 2 - 180, 452, 360, 56, '▶  LIGHT THE LANTERN', input);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '14px monospace';
    ctx.fillText(best > 0 ? `Best score: ${best}   •   press Enter or click to start` : 'Press Enter or click to start', VIEW.width / 2, 536);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(5,5,16,0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 220, 250, 440, 190);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.bone;
    ctx.font = 'bold 40px monospace';
    ctx.fillText('PAUSED', VIEW.width / 2, 310);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '16px monospace';
    ctx.fillText('Press P or Enter to keep playing', VIEW.width / 2, 356);
    ctx.fillText('M — mute    •    R — restart run', VIEW.width / 2, 384);
  }

  function drawOver(state, best, isWin, input) {
    ctx.fillStyle = 'rgba(5,5,16,0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(VIEW.width / 2 - 330, 140, 660, 420);
    ctx.textAlign = 'center';
    ctx.fillStyle = isWin ? PALETTE.gold : PALETTE.rose;
    ctx.font = 'bold 52px monospace';
    ctx.fillText(isWin ? 'THE LIGHT ENDURES' : 'THE LANTERN GOES OUT', VIEW.width / 2, 210);
    ctx.fillStyle = PALETTE.bone;
    ctx.font = '18px monospace';
    ctx.fillText(isWin ? 'Wave 10 cleared — the Warden is banished and dawn returns.' : 'The ember-eaters close in as the last flame gutters.', VIEW.width / 2, 256);
    const rows = [
      ['SCORE', String(state.score)],
      ['BEST', String(Math.max(best, state.score))],
      ['WAVE REACHED', String(Math.max(1, state.wave))],
      ['BANISHED', String(state.kills)],
      ['BEST COMBO', `x${state.bestCombo.toFixed(2)}`],
      ['SHOTS FIRED', String(state.shotsFired)],
    ];
    ctx.font = '17px monospace';
    let y = 300;
    for (const [label, value] of rows) {
      ctx.fillStyle = PALETTE.dim;
      ctx.textAlign = 'right';
      ctx.fillText(label, VIEW.width / 2 - 20, y);
      ctx.fillStyle = PALETTE.bone;
      ctx.textAlign = 'left';
      ctx.fillText(value, VIEW.width / 2 + 20, y);
      y += 28;
    }
    if (state.score >= best && state.score > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★ NEW BEST SCORE ★', VIEW.width / 2, y + 4);
    }
    bigButton('restart', VIEW.width / 2 - 170, 486, 340, 52, '↻  PLAY AGAIN  (R)', input);
  }

  return {
    showBanner,
    draw(state, screen, best, input, muted) {
      ctx.save();
      if (state.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(state);
      drawWorld(state);
      if (bannerTimer > 0) {
        bannerTimer -= 1 / 60;
        const a = Math.min(1, bannerTimer);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.gold;
        ctx.font = 'bold 44px monospace';
        ctx.fillText(banner.text, VIEW.width / 2, 250);
        if (banner.sub) {
          ctx.fillStyle = PALETTE.bone;
          ctx.font = '18px monospace';
          ctx.fillText(banner.sub, VIEW.width / 2, 288);
        }
        ctx.restore();
      }
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, best, muted);
      if (screen === SCREEN_TITLE) drawTitle(state, best, input);
      if (screen === SCREEN_PAUSED) drawPaused();
      if (screen === SCREEN_OVER) drawOver(state, best, false, input);
      if (screen === SCREEN_WIN) drawOver(state, best, true, input);
      ctx.restore();
      // Vignette.
      const vg = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 320, VIEW.width / 2, VIEW.height / 2, 760);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    },
  };
}
