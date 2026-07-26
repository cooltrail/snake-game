(function () {
  'use strict';

  var SPEEDS = { slow: 260, normal: 180, fast: 120 };
  var GRID_SIZES = { small: 14, medium: 20, large: 26 };
  var SKINS = { pixel: 1, smooth: 1 };
  var BEST_KEY = 'snake-best-score';
  var SPEED_KEY = 'snake-speed';
  var GRID_KEY = 'snake-grid';
  var SKIN_KEY = 'snake-skin';
  var COUNTDOWN_KEY = 'snake-countdown';
  var COUNTDOWN_STEPS = ['3', '2', '1', 'Go!'];
  var COUNTDOWN_TICK_MS = 700;

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestScoreEl = document.getElementById('best-score');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayMessage = document.getElementById('overlay-message');
  var startBtn = document.getElementById('start-btn');
  var dpadBtns = document.querySelectorAll('.dpad-btn');
  var settingsEl = document.getElementById('settings');
  var settingBtns = document.querySelectorAll('.setting-btn');
  var countdownToggle = document.getElementById('countdown-toggle');

  var speedKey = localStorage.getItem(SPEED_KEY) || 'fast';
  var gridKey = localStorage.getItem(GRID_KEY) || 'medium';
  var skinKey = localStorage.getItem(SKIN_KEY) || 'pixel';
  if (!SPEEDS[speedKey]) speedKey = 'fast';
  if (!GRID_SIZES[gridKey]) gridKey = 'medium';
  if (!SKINS[skinKey]) skinKey = 'pixel';

  var GRID_SIZE = GRID_SIZES[gridKey];
  var TICK_MS = SPEEDS[speedKey];

  countdownToggle.checked = localStorage.getItem(COUNTDOWN_KEY) === '1';
  countdownToggle.addEventListener('change', function () {
    localStorage.setItem(COUNTDOWN_KEY, countdownToggle.checked ? '1' : '0');
  });

  var cellPx = 0;
  var countdownTimer = null;
  var snake = [];
  var direction = { x: 1, y: 0 };
  var pendingDirection = { x: 1, y: 0 };
  var food = { x: 0, y: 0 };
  var score = 0;
  var best = Number(localStorage.getItem(BEST_KEY)) || 0;
  var running = false;
  var paused = false;
  var loopHandle = null;

  bestScoreEl.textContent = best;

  var GROUP_VALUES = {
    speed: function () { return speedKey; },
    grid: function () { return gridKey; },
    skin: function () { return skinKey; },
  };

  function syncSettingButtons() {
    settingBtns.forEach(function (btn) {
      var group = btn.parentElement.dataset.setting;
      var value = GROUP_VALUES[group] ? GROUP_VALUES[group]() : null;
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }
  syncSettingButtons();

  function resizeCanvas() {
    var size = canvas.clientWidth;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellPx = size / GRID_SIZE;
    draw();
  }

  function randomCell() {
    return {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  }

  function placeFood() {
    var cell;
    do {
      cell = randomCell();
    } while (snake.some(function (s) { return s.x === cell.x && s.y === cell.y; }));
    food = cell;
  }

  function resetGame() {
    var mid = Math.floor(GRID_SIZE / 2);
    snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    direction = { x: 1, y: 0 };
    pendingDirection = { x: 1, y: 0 };
    score = 0;
    scoreEl.textContent = score;
    placeFood();
    draw();
  }

  function setDirection(x, y) {
    if (direction.x === -x && direction.y === -y) return;
    pendingDirection = { x: x, y: y };
  }

  function step() {
    direction = pendingDirection;
    var head = snake[0];
    var newHead = { x: head.x + direction.x, y: head.y + direction.y };

    if (
      newHead.x < 0 ||
      newHead.y < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y >= GRID_SIZE ||
      snake.some(function (s) { return s.x === newHead.x && s.y === newHead.y; })
    ) {
      gameOver();
      return;
    }

    snake.unshift(newHead);

    if (newHead.x === food.x && newHead.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestScoreEl.textContent = best;
        localStorage.setItem(BEST_KEY, String(best));
      }
      placeFood();
    } else {
      snake.pop();
    }

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    for (var i = 0; i < GRID_SIZE; i++) {
      for (var j = 0; j < GRID_SIZE; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.02)';
          ctx.fillRect(i * cellPx, j * cellPx, cellPx, cellPx);
        }
      }
    }

    ctx.fillStyle = '#f44336';
    var pad = cellPx * 0.15;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(food.x * cellPx + pad, food.y * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2, 6)
      : ctx.rect(food.x * cellPx + pad, food.y * cellPx + pad, cellPx - pad * 2, cellPx - pad * 2);
    ctx.fill();

    if (skinKey === 'smooth') {
      drawSmoothSnake();
    } else {
      drawPixelSnake();
    }
  }

  function drawPixelSnake() {
    snake.forEach(function (seg, idx) {
      var p = cellPx * 0.08;
      ctx.fillStyle = idx === 0 ? '#8bc34a' : '#4caf50';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(seg.x * cellPx + p, seg.y * cellPx + p, cellPx - p * 2, cellPx - p * 2, 5);
      } else {
        ctx.rect(seg.x * cellPx + p, seg.y * cellPx + p, cellPx - p * 2, cellPx - p * 2);
      }
      ctx.fill();
    });
  }

  function drawSmoothSnake() {
    if (snake.length === 0) return;

    var pts = snake.map(function (seg) {
      return { x: seg.x * cellPx + cellPx / 2, y: seg.y * cellPx + cellPx / 2 };
    });

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (pts.length > 1) {
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = cellPx * 0.72;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }

    var tail = pts[pts.length - 1];
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, cellPx * 0.36, 0, Math.PI * 2);
    ctx.fill();

    var head = pts[0];
    ctx.fillStyle = '#8bc34a';
    ctx.beginPath();
    ctx.arc(head.x, head.y, cellPx * 0.44, 0, Math.PI * 2);
    ctx.fill();

    var perpX = -direction.y;
    var perpY = direction.x;
    var eyeForwardX = direction.x * cellPx * 0.14;
    var eyeForwardY = direction.y * cellPx * 0.14;
    var eyeSide = cellPx * 0.17;
    ctx.fillStyle = '#0b1f0e';
    [1, -1].forEach(function (side) {
      var ex = head.x + eyeForwardX + perpX * eyeSide * side;
      var ey = head.y + eyeForwardY + perpY * eyeSide * side;
      ctx.beginPath();
      ctx.arc(ex, ey, cellPx * 0.075, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function loop() {
    if (!paused) step();
  }

  function startGame() {
    resetGame();
    running = true;
    paused = false;
    overlay.classList.add('hidden');
    settingsEl.classList.add('disabled');
    if (loopHandle) clearInterval(loopHandle);
    loopHandle = setInterval(loop, TICK_MS);
  }

  function beginPlay() {
    if (!countdownToggle.checked) {
      startGame();
      return;
    }

    if (countdownTimer) clearInterval(countdownTimer);
    settingsEl.classList.add('disabled');
    startBtn.classList.add('hidden-btn');
    overlayMessage.textContent = '';
    overlayTitle.classList.add('countdown');

    var i = 0;
    overlayTitle.textContent = COUNTDOWN_STEPS[i];
    countdownTimer = setInterval(function () {
      i++;
      if (i < COUNTDOWN_STEPS.length) {
        overlayTitle.textContent = COUNTDOWN_STEPS[i];
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        overlayTitle.classList.remove('countdown');
        startBtn.classList.remove('hidden-btn');
        startGame();
      }
    }, COUNTDOWN_TICK_MS);
  }

  function gameOver() {
    running = false;
    clearInterval(loopHandle);
    overlayTitle.textContent = 'Game Over';
    overlayMessage.textContent = 'Score: ' + score + (score >= best ? ' \u2014 new best!' : ' \u00b7 Best: ' + best);
    startBtn.textContent = 'Play Again';
    settingsEl.classList.remove('disabled');
    overlay.classList.remove('hidden');
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    overlayTitle.textContent = paused ? 'Paused' : '';
    overlayMessage.textContent = paused ? 'Press space or tap Resume to continue.' : '';
    startBtn.textContent = paused ? 'Resume' : 'Play';
    settingsEl.classList.toggle('disabled', paused);
    overlay.classList.toggle('hidden', !paused);
  }

  settingBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (running && !paused) return;
      var group = btn.parentElement.dataset.setting;
      if (group === 'speed') {
        speedKey = btn.dataset.value;
        TICK_MS = SPEEDS[speedKey];
        localStorage.setItem(SPEED_KEY, speedKey);
      } else if (group === 'grid') {
        gridKey = btn.dataset.value;
        GRID_SIZE = GRID_SIZES[gridKey];
        localStorage.setItem(GRID_KEY, gridKey);
        resizeCanvas();
      } else if (group === 'skin') {
        skinKey = btn.dataset.value;
        localStorage.setItem(SKIN_KEY, skinKey);
      }
      syncSettingButtons();
      resetGame();
    });
  });

  startBtn.addEventListener('click', function () {
    if (running && paused) {
      togglePause();
    } else {
      beginPlay();
    }
  });

  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        setDirection(0, -1);
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        setDirection(0, 1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        setDirection(-1, 0);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        setDirection(1, 0);
        e.preventDefault();
        break;
      case ' ':
        togglePause();
        e.preventDefault();
        break;
    }
  });

  var DIR_MAP = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  dpadBtns.forEach(function (btn) {
    var dir = DIR_MAP[btn.dataset.dir];
    var fire = function (e) {
      e.preventDefault();
      setDirection(dir.x, dir.y);
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('click', fire);
  });

  var touchStart = null;
  canvas.addEventListener(
    'touchstart',
    function (e) {
      var t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );

  canvas.addEventListener(
    'touchend',
    function (e) {
      if (!touchStart) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStart.x;
      var dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? 1 : -1, 0);
      } else {
        setDirection(0, dy > 0 ? 1 : -1);
      }
    },
    { passive: true }
  );

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('load', resizeCanvas);
  resizeCanvas();
  resetGame();
})();
