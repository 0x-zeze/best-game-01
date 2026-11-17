// input.js: keyboard + mouse, in game coordinates. Movement is WASD/arrows, aim follows the
// mouse, hold the left button (or J) to fire, Space/Shift dashes, E detonates a nova bomb,
// P pauses, M mutes, Enter/Space confirms on menus. Buttons on the canvas are hit-tested here
// so the menus are clickable too.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_NOVA = 8;
export const ACTION_DASH = 16;

export function createInput(canvas) {
  const keys = new Set();
  const buttons = [];
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let queued = 0;
  let clicked = null;

  function toGame(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function keyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === 'Enter' || event.key === ' ') queued |= ACTION_CONFIRM;
    if (event.key.toLowerCase() === 'p' || event.key === 'Escape') queued |= ACTION_PAUSE;
    if (event.key.toLowerCase() === 'm') queued |= ACTION_MUTE;
    if (event.key.toLowerCase() === 'e') queued |= ACTION_NOVA;
    if (event.key === 'Shift' || event.key === ' ') queued |= ACTION_DASH;
  }

  function mouseMove(event) {
    const p = toGame(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
  }

  function mouseDownHandler(event) {
    const p = toGame(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
    if (event.button === 0) {
      mouseDown = true;
      clicked = { x: p.x, y: p.y };
    }
    if (event.button === 2) queued |= ACTION_NOVA;
  }

  function mouseUpHandler(event) {
    if (event.button === 0) mouseDown = false;
  }

  window.addEventListener('keydown', keyDown);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('mousedown', mouseDownHandler);
  window.addEventListener('mouseup', mouseUpHandler);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    // Normalized movement vector from WASD / arrows.
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    aim() { return { x: mouseX, y: mouseY }; },
    firing() { return mouseDown || keys.has('j'); },
    takeActions() { const a = queued; queued = 0; return a; },
    takeClick() { const c = clicked; clicked = null; return c; },
    // Buttons are registered by the renderer each frame; a click inside one returns its id.
    registerButton(id, x, y, w, h) { buttons.push({ id, x, y, w, h }); },
    clearButtons() { buttons.length = 0; },
    hitButton(point) {
      if (!point) return null;
      for (const b of buttons) {
        if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return b.id;
      }
      return null;
    },
    destroy() {
      window.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('mousemove', mouseMove);
      canvas.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
    },
  };
}
