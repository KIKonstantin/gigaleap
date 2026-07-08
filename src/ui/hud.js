// DOM HUD: live height, persisted best height, start/win overlays.
const BEST_KEY = 'gigaleap-best';

export function createHUD() {
  const heightEl = document.getElementById('height');
  const bestEl = document.getElementById('best');
  const staresEl = document.getElementById('stares');
  let lastStares = -1;
  const startOverlay = document.getElementById('startOverlay');
  const winOverlay = document.getElementById('winOverlay');
  const winStats = document.getElementById('winStats');

  let best = parseFloat(localStorage.getItem(BEST_KEY)) || 0;
  let lastShown = -Infinity;
  bestEl.textContent = `${best.toFixed(1)} m`;

  function update(height) {
    const h = Math.max(height, 0);
    if (Math.abs(h - lastShown) >= 0.05) {
      heightEl.textContent = `${h.toFixed(1)} m`;
      lastShown = h;
    }
    if (h > best) {
      best = h;
      bestEl.textContent = `${best.toFixed(1)} m`;
      localStorage.setItem(BEST_KEY, best.toFixed(1));
    }
  }

  function showWin(height, time) {
    winStats.innerHTML =
      `SUMMIT — ${height.toFixed(1)} m<br />TIME — ${formatTime(time)}`;
    winOverlay.classList.remove('hidden');
    startOverlay.classList.add('hidden');
  }

  function setStares(n) {
    if (n === lastStares) return;
    lastStares = n;
    staresEl.textContent = String(n);
  }

  return {
    update,
    setStares,
    showWin,
    hideWin: () => winOverlay.classList.add('hidden'),
    isWinShown: () => !winOverlay.classList.contains('hidden'),
    showStart: () => startOverlay.classList.remove('hidden'),
    hideStart: () => startOverlay.classList.add('hidden'),
    resetBest: () => {
      best = 0;
      bestEl.textContent = '0.0 m';
      localStorage.removeItem(BEST_KEY);
    },
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
