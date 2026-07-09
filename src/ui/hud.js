// DOM HUD: current level, live height, run time, start/win overlays.
export function createHUD() {
  const levelEl = document.getElementById('level');
  const heightEl = document.getElementById('height');
  const timeEl = document.getElementById('time');
  const playersEl = document.getElementById('players');
  const startOverlay = document.getElementById('startOverlay');
  const winOverlay = document.getElementById('winOverlay');
  const winStats = document.getElementById('winStats');

  let lastHeight = -Infinity;
  let lastLevel = -1;
  let lastSecond = -1;
  let lastPlayers = -1;

  function update(height, level, time) {
    const h = Math.max(height, 0);
    if (Math.abs(h - lastHeight) >= 0.05) {
      heightEl.textContent = `${h.toFixed(1)} m`;
      lastHeight = h;
    }
    const lvl = Math.max(level, 1);
    if (lvl !== lastLevel) {
      levelEl.textContent = String(lvl);
      lastLevel = lvl;
    }
    const second = Math.floor(time);
    if (second !== lastSecond) {
      timeEl.textContent = formatTime(time);
      lastSecond = second;
    }
  }

  function showWin(height, time) {
    winStats.innerHTML =
      `SUMMIT — ${height.toFixed(1)} m<br />TIME — ${formatTime(time)}`;
    winOverlay.classList.remove('hidden');
    startOverlay.classList.add('hidden');
  }

  // set on network events (join/leave/states), not per frame like update()
  function setPlayers(n) {
    if (n !== lastPlayers) {
      playersEl.textContent = String(n);
      lastPlayers = n;
    }
  }

  return {
    update,
    setPlayers,
    showWin,
    hideWin: () => winOverlay.classList.add('hidden'),
    isWinShown: () => !winOverlay.classList.contains('hidden'),
    showStart: () => startOverlay.classList.remove('hidden'),
    hideStart: () => startOverlay.classList.add('hidden'),
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
