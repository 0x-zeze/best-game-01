// EMBERFALL — Arena of the Last Lantern.
// main.js: boot and the one loop. Input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and victory
// (clearing wave 10). ?seed=N fixes the spawn pattern. ?shot=start|play|boss|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP, WAVES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOSS, EVENT_HIT, EVENT_NOVA, EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { angleTo } from './random.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* private windows */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, null, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = audio.isMuted();
  let accumulator = 0;
  let last = performance.now();
  let waveAnnounced = 0;
  let pendingActions = 0;
  world.reset();
  // Debug handle for play-testing (read-only view of the live state).
  window.__emberfall = { world, get screen() { return screen; }, get best() { return best; } };

  function announce(message) { status.textContent = message; }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    world.reset();
    accumulator = 0;
    waveAnnounced = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1 incoming. Keep the lantern burning.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) { best = world.state.score; saveBest(best); }
    audio.stopMusic();
    if (won) audio.win(); else audio.gameOver();
    announce(won
      ? `Victory. Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}. Press R to play again.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) { muted = audio.toggleMute(); }
    pendingActions |= actions & (ACTION_DASH | ACTION_NOVA);
    const click = input.takeClick();
    const hit = input.hitButton(click);
    if (hit === 'start' && screen === SCREEN_TITLE) { startGame(); return; }
    if (hit === 'restart' && (screen === SCREEN_OVER || screen === SCREEN_WIN)) { startGame(); return; }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
    // R restarts from pause, game over or victory.
    if ((screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN) && isRestartKey()) startGame();
  }

  // R is read straight from the keyboard state each frame (it is not an action bit).
  let restartPressed = false;
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r' && !event.repeat) restartPressed = true;
  });
  function isRestartKey() {
    const r = restartPressed;
    restartPressed = false;
    return r;
  }

  function controls() {
    const move = input.moveVector();
    const aim = input.aim();
    const p = world.state.player;
    const aimAngle = p ? angleTo(p.x, p.y, aim.x, aim.y) : -Math.PI / 2;
    const actions = pendingActions;
    pendingActions = 0;
    return {
      move,
      aimAngle,
      firing: input.firing(),
      dash: !!(actions & ACTION_DASH),
      nova: !!(actions & ACTION_NOVA),
    };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, aimAngle: -Math.PI / 2, firing: false, dash: false, nova: false }, audio, true);
      return;
    }
    const c = controls();
    const events = world.step(STEP, c, audio, false);
    audio.musicTick(STEP, world.state.wave);
    if (events & EVENT_BOSS && world.state.wave !== waveAnnounced) {
      waveAnnounced = world.state.wave;
      if (world.state.wave % WAVES.bossEvery === 0) {
        renderer.showBanner('THE WARDEN AWAKENS', 'a crowned ember-eater — break its crown, take its light');
        announce('The Warden awakens.');
      } else {
        renderer.showBanner(`WAVE ${world.state.wave}`, world.state.wave === 1 ? 'banish them all' : '');
      }
    }
    if (events & EVENT_WAVE_CLEAR && world.won) { endGame(true); return; }
    if (events & EVENT_HIT) {
      announce(world.state.player.health === 1 ? 'Hit. 1 heart left.' : `Hit. ${world.state.player.health} hearts left.`);
    }
    if (events & EVENT_NOVA) announce('Nova bomb!');
    if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    input.clearButtons();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, input, muted);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
  });

  announce('Emberfall. Press Enter or click to light the lantern.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
