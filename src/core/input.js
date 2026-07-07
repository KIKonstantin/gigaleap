// Keyboard state, pointer lock, and mouse look.
// Yaw/pitch update at event rate (not the fixed step) for low look latency.
const SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  jumpQueued: false, // set on Space keydown edge, consumed by the controller
  jumpHeld: false,
  dashQueued: false, // set on Ctrl keydown edge, consumed by the controller
  yaw: 0,
  pitch: 0,
  locked: false,
};

export function initInput(canvas, onLockChange) {
  // document-level: the start overlay covers the canvas, and its click
  // must also lock the pointer
  document.addEventListener('click', () => {
    if (!input.locked) canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) {
      input.forward = input.back = input.left = input.right = false;
      input.sprint = input.jumpHeld = false;
    }
    if (onLockChange) onLockChange(input.locked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.yaw -= e.movementX * SENSITIVITY;
    input.pitch -= e.movementY * SENSITIVITY;
    input.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, input.pitch));
  });

  window.addEventListener('keydown', (e) => {
    if (input.locked) e.preventDefault(); // keep Space/Ctrl from browser actions
    if (e.code === 'Space' && !e.repeat) {
      input.jumpQueued = true;
      input.jumpHeld = true;
    }
    if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) {
      input.dashQueued = true;
    }
    setKey(e.code, true);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') input.jumpHeld = false;
    setKey(e.code, false);
  });
}

function setKey(code, down) {
  switch (code) {
    case 'KeyW': case 'ArrowUp': input.forward = down; break;
    case 'KeyS': case 'ArrowDown': input.back = down; break;
    case 'KeyA': case 'ArrowLeft': input.left = down; break;
    case 'KeyD': case 'ArrowRight': input.right = down; break;
    case 'ShiftLeft': case 'ShiftRight': input.sprint = down; break;
  }
}
