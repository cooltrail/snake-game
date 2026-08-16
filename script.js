(function () {
  'use strict';

  var SPEEDS = { slow: 260, normal: 180, fast: 120 };
  var GRID_SIZES = { small: 8, medium: 12, large: 16 };
  var SKINS = { pixel: 1, smooth: 1 };
  // Color themes are independent of the shape skin (Pixel/Smooth). Each
  // theme defines a head -> body gradient along the snake, plus eyes.
  // Softer head/body spans so neighboring segments don't jump as hard.
  var COLOR_THEMES = {
    default: { head: '#7cb342', body: '#2e7d32', eye: '#0b1f0e' },
    frost: { head: '#90caf9', body: '#1565c0', eye: '#0d2b45' },
    scorch: { head: '#ff6b35', body: '#c43e00', eye: '#1a0800' },
  };
  // Checkerboard cell tints for the board (independent of snake color).
  var GRID_COLORS = {
    default: { a: 'rgba(255,255,255,0.02)', b: 'rgba(0,0,0,0)' },
    red: { a: '#ff8a8a', b: '#ffbaba' },
    blue: { a: '#b3d4ff', b: '#d9eaff' },
    green: { a: '#7ddb8e', b: '#a8e8b4' },
  };
  var BEST_KEY = 'snake-best-score';
  var SPEED_KEY = 'snake-speed';
  var GRID_KEY = 'snake-grid';
  var SKIN_KEY = 'snake-skin';
  var COLOR_KEY = 'snake-color';
  var GRID_COLOR_KEY = 'snake-grid-color';
  var COUNTDOWN_KEY = 'snake-countdown';
  var EZ_KEY = 'snake-ez';
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
  var ezToggle = document.getElementById('ez-toggle');

  var speedKey = localStorage.getItem(SPEED_KEY) || 'fast';
  var gridKey = localStorage.getItem(GRID_KEY) || 'medium';
  var skinKey = localStorage.getItem(SKIN_KEY) || 'pixel';
  var colorKey = localStorage.getItem(COLOR_KEY) || 'default';
  var gridColorKey = localStorage.getItem(GRID_COLOR_KEY) || 'default';
  if (!SPEEDS[speedKey]) speedKey = 'fast';
  if (!GRID_SIZES[gridKey]) gridKey = 'medium';
  if (!SKINS[skinKey]) skinKey = 'pixel';
  if (!COLOR_THEMES[colorKey]) colorKey = 'default';
  if (!GRID_COLORS[gridColorKey]) gridColorKey = 'default';

  var GRID_SIZE = GRID_SIZES[gridKey];
  var TICK_MS = SPEEDS[speedKey];

  countdownToggle.checked = localStorage.getItem(COUNTDOWN_KEY) === '1';
  countdownToggle.addEventListener('change', function () {
    localStorage.setItem(COUNTDOWN_KEY, countdownToggle.checked ? '1' : '0');
  });

  ezToggle.checked = localStorage.getItem(EZ_KEY) === '1';
  ezToggle.addEventListener('change', function () {
    localStorage.setItem(EZ_KEY, ezToggle.checked ? '1' : '0');
  });

  var cellPx = 0;
  var countdownTimer = null;
  var snake = [];
  var previousSnake = [];
  var lastTickTime = 0;
  var direction = { x: 1, y: 0 };
  var pendingDirection = { x: 1, y: 0 };
  var food = { x: 0, y: 0 };
  var score = 0;
  var best = Number(localStorage.getItem(BEST_KEY)) || 0;
  var running = false;
  var paused = false;
  var loopHandle = null;

  // --- Arcade Sound Effects (Web Audio API, no files needed) ---
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playEatSound() {
    var ctx = getAudioCtx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  function playDieSound() {
    var ctx = getAudioCtx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  function playWinSound() {
    var ctx = getAudioCtx();
    var notes = [523, 659, 784, 1047];
    notes.forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.2);
    });
  }

  function playCountdownBeep(final) {
    var ctx = getAudioCtx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(final ? 880 : 440, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  function playTurnSound() {
    var ctx = getAudioCtx();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function wrapLerp(prev, cur, t) {
    var dx = cur - prev;
    if (Math.abs(dx) > 1) {
      var virtualPrev = cur - Math.sign(dx) * -1;
      return lerp(virtualPrev, cur, t);
    }
    return lerp(prev, cur, t);
  }

  function isWrapPair(ax, ay, bx, by) {
    return Math.abs(ax - bx) > 1 || Math.abs(ay - by) > 1;
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  function lerpColor(hexA, hexB, t) {
    var a = hexToRgb(hexA);
    var b = hexToRgb(hexB);
    return (
      'rgb(' +
      Math.round(lerp(a.r, b.r, t)) +
      ',' +
      Math.round(lerp(a.g, b.g, t)) +
      ',' +
      Math.round(lerp(a.b, b.b, t)) +
      ')'
    );
  }

  function shadeAt(theme, t, length) {
    // Short snakes only use a tiny slice of the head->body range so they
    // stay smooth (no harsh banding). Longer snakes open the range up
    // gradually - but the tip still never reaches the darkest body shade.
    var len = Math.max(1, length || snake.length);
    var maxBlend = Math.min(0.55, 0.12 + (len - 1) * 0.035);
    var x = Math.min(1, Math.max(0, t));
    var eased = x * x * (3 - 2 * x);
    return lerpColor(theme.head, theme.body, eased * maxBlend);
  }

  function currentTheme() {
    return COLOR_THEMES[colorKey] || COLOR_THEMES.default;
  }

  function cloneSnake(list) {
    return list.map(function (s) {
      return { x: s.x, y: s.y };
    });
  }

  bestScoreEl.textContent = best;

  var GROUP_VALUES = {
    speed: function () { return speedKey; },
    grid: function () { return gridKey; },
    skin: function () { return skinKey; },
    color: function () { return colorKey; },
    gridColor: function () { return gridColorKey; },
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
    // A resize (e.g. mobile address bar showing/hiding mid-game) rescales
    // every rendered coordinate uniformly. Cut any in-flight glide short so
    // there's nothing left interpolating across the rescale.
    previousSnake = cloneSnake(snake);
    lastTickTime = performance.now();
    draw();
  }

  function randomCell() {
    return {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  }

  function placeFood() {
    var occupied = {};
    snake.forEach(function (s) { occupied[s.x + ',' + s.y] = true; });
    var totalCells = GRID_SIZE * GRID_SIZE;
    if (Object.keys(occupied).length >= totalCells) {
      food = { x: -1, y: -1 };
      return;
    }
    var cell;
    do {
      cell = randomCell();
    } while (occupied[cell.x + ',' + cell.y]);
    food = cell;
  }

  function resetGame() {
    var mid = Math.floor(GRID_SIZE / 2);
    // The snake starts moving right immediately, so start it as close to
    // the left edge as the body allows instead of dead center - that
    // maximizes the runway before it's possible to run into the right
    // wall (e.g. ~2s instead of ~1.2s at Fast speed on the medium grid).
    var headX = 2;
    snake = [
      { x: headX, y: mid },
      { x: headX - 1, y: mid },
      { x: headX - 2, y: mid },
    ];
    previousSnake = cloneSnake(snake);
    lastTickTime = performance.now();
    direction = { x: 1, y: 0 };
    pendingDirection = { x: 1, y: 0 };
    score = 0;
    scoreEl.textContent = score;
    placeFood();
    draw();
  }

  function setDirection(x, y) {
    if (direction.x === -x && direction.y === -y) return;
    if (direction.x === x && direction.y === y) return;
    playTurnSound();
    pendingDirection = { x: x, y: y };
  }

  function step() {
    previousSnake = cloneSnake(snake);
    lastTickTime = performance.now();

    direction = pendingDirection;
    var head = snake[0];
    var newHead = { x: head.x + direction.x, y: head.y + direction.y };

    var ez = ezToggle.checked;

    if (ez) {
      if (newHead.x < 0) newHead.x = GRID_SIZE - 1;
      else if (newHead.x >= GRID_SIZE) newHead.x = 0;
      if (newHead.y < 0) newHead.y = GRID_SIZE - 1;
      else if (newHead.y >= GRID_SIZE) newHead.y = 0;
    } else {
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
    }

    snake.unshift(newHead);

    if (food.x >= 0 && newHead.x === food.x && newHead.y === food.y) {
      playEatSound();
      score += 10;
      scoreEl.textContent = score;
      if (!ez && score > best) {
        best = score;
        bestScoreEl.textContent = best;
        localStorage.setItem(BEST_KEY, String(best));
      }
      placeFood();
      if (food.x < 0) {
        gridWin();
        return;
      }
    } else {
      snake.pop();
    }
  }

  function draw() {
    renderFrame(1);
  }

  function renderFrame(t) {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    var gridTint = GRID_COLORS[gridColorKey] || GRID_COLORS.default;
    for (var i = 0; i < GRID_SIZE; i++) {
      for (var j = 0; j < GRID_SIZE; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? gridTint.a : gridTint.b;
        ctx.fillRect(i * cellPx, j * cellPx, cellPx, cellPx);
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
      drawSmoothSnake(t);
    } else {
      drawPixelSnake();
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    var t = TICK_MS > 0 ? Math.min(1, Math.max(0, (performance.now() - lastTickTime) / TICK_MS)) : 1;
    if (paused || !running) t = 1;
    renderFrame(t);
  }

  function drawPixelSnake() {
    var theme = currentTheme();
    var lastIdx = Math.max(1, snake.length - 1);
    snake.forEach(function (seg, idx) {
      var p = cellPx * 0.08;
      ctx.fillStyle = shadeAt(theme, idx / lastIdx, snake.length);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(seg.x * cellPx + p, seg.y * cellPx + p, cellPx - p * 2, cellPx - p * 2, 5);
      } else {
        ctx.rect(seg.x * cellPx + p, seg.y * cellPx + p, cellPx - p * 2, cellPx - p * 2);
      }
      ctx.fill();
    });

    var head = snake[0];
    var headCx = head.x * cellPx + cellPx / 2;
    var headCy = head.y * cellPx + cellPx / 2;
    var perpX = -direction.y;
    var perpY = direction.x;
    var eyeForwardX = direction.x * cellPx * 0.16;
    var eyeForwardY = direction.y * cellPx * 0.16;
    var eyeSide = cellPx * 0.18;
    var eyeR = cellPx * 0.09;
    ctx.fillStyle = theme.eye;
    [1, -1].forEach(function (side) {
      var ex = headCx + eyeForwardX + perpX * eyeSide * side;
      var ey = headCy + eyeForwardY + perpY * eyeSide * side;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(ex - eyeR, ey - eyeR, eyeR * 2, eyeR * 2, eyeR * 0.4);
      } else {
        ctx.rect(ex - eyeR, ey - eyeR, eyeR * 2, eyeR * 2);
      }
      ctx.fill();
    });
  }

  function drawSmoothSnake(t) {
    if (snake.length === 0) return;
    var prevLen = previousSnake.length;

    // A body cell's grid position is fixed the moment it's laid down -
    // only the head (advancing into a brand-new cell) and the tail
    // (retracting toward the cell the segment ahead of it just vacated)
    // actually travel within a tick. Every other segment is a static
    // footprint, so it's drawn at its resting grid cell with no lerp.
    var headPrev = previousSnake[0] || snake[0];
    var headGx = wrapLerp(headPrev.x, snake[0].x, t);
    var headGy = wrapLerp(headPrev.y, snake[0].y, t);

    var pts = [{ x: headGx * cellPx + cellPx / 2, y: headGy * cellPx + cellPx / 2, gx: headGx, gy: headGy }];
    for (var i = 1; i < snake.length; i++) {
      var seg = snake[i];
      if (i === snake.length - 1 && snake.length > 1) {
        var tailPrev = previousSnake[prevLen - 1] || seg;
        pts.push({ x: seg.x * cellPx + cellPx / 2, y: seg.y * cellPx + cellPx / 2, gx: seg.x, gy: seg.y });
        var tailGx = wrapLerp(tailPrev.x, seg.x, t);
        var tailGy = wrapLerp(tailPrev.y, seg.y, t);
        pts.push({ x: tailGx * cellPx + cellPx / 2, y: tailGy * cellPx + cellPx / 2, gx: tailGx, gy: tailGy });
      } else {
        pts.push({ x: seg.x * cellPx + cellPx / 2, y: seg.y * cellPx + cellPx / 2, gx: seg.x, gy: seg.y });
      }
    }

    ctx.save();
    ctx.lineCap = 'round';

    // Each body link is stroked as its own independent capsule (round
    // caps, no shared join) instead of one continuous multi-point path.
    // A single path with lineJoin would need to bend its joint at every
    // static point as the head/tail glide, which distorts (bulges or
    // pinches) as the angle sweeps mid-turn. Independent round-capped
    // segments overlap seamlessly at any angle since there's no join to
    // compute at all. Each capsule is colored along the theme's
    // head -> body gradient based on how far down the snake it is.
    var theme = currentTheme();
    var lastPt = Math.max(1, pts.length - 1);
    if (pts.length > 1) {
      ctx.lineWidth = cellPx * 0.72;
      for (var i = 0; i < pts.length - 1; i++) {
        if (isWrapPair(pts[i].gx, pts[i].gy, pts[i + 1].gx, pts[i + 1].gy)) continue;
        ctx.strokeStyle = shadeAt(theme, i / lastPt, snake.length);
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }
    }

    var tail = pts[pts.length - 1];
    ctx.fillStyle = shadeAt(theme, 1, snake.length);
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, cellPx * 0.36, 0, Math.PI * 2);
    ctx.fill();

    var head = pts[0];
    ctx.fillStyle = theme.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cellPx * 0.44, 0, Math.PI * 2);
    ctx.fill();

    var perpX = -direction.y;
    var perpY = direction.x;
    var eyeForwardX = direction.x * cellPx * 0.14;
    var eyeForwardY = direction.y * cellPx * 0.14;
    var eyeSide = cellPx * 0.17;
    ctx.fillStyle = theme.eye;
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
    if (!paused) {
      step();
      // Don't rely solely on requestAnimationFrame to get a frame on
      // screen - some browser/automation contexts throttle or fully
      // suspend rAF (backgrounded tabs, headless environments, battery
      // saver modes) while this setInterval keeps ticking regardless.
      // Without this, the game logic keeps advancing invisibly and the
      // board looks permanently frozen on its very first frame. Drawing
      // directly after every tick guarantees the board always reflects
      // the latest state at least once per tick, no matter what rAF does.
      draw();
    }
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
    playCountdownBeep(false);
    countdownTimer = setInterval(function () {
      i++;
      if (i < COUNTDOWN_STEPS.length) {
        overlayTitle.textContent = COUNTDOWN_STEPS[i];
        playCountdownBeep(i === COUNTDOWN_STEPS.length - 1);
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
    playDieSound();
    running = false;
    clearInterval(loopHandle);
    overlayTitle.textContent = 'Game Over';
    overlayMessage.textContent = 'Score: ' + score + (score >= best ? ' \u2014 new best!' : ' \u00b7 Best: ' + best);
    startBtn.textContent = 'Play Again';
    settingsEl.classList.remove('disabled');
    overlay.classList.remove('hidden');
  }

  function gridWin() {
    playWinSound();
    running = false;
    clearInterval(loopHandle);

    var particles = [];
    var theme = currentTheme();
    for (var i = 0; i < GRID_SIZE; i++) {
      for (var j = 0; j < GRID_SIZE; j++) {
        var t = (i * GRID_SIZE + j) / (GRID_SIZE * GRID_SIZE);
        particles.push({
          x: i * cellPx + cellPx / 2,
          y: j * cellPx + cellPx / 2,
          vx: (Math.random() - 0.5) * cellPx * 0.4,
          vy: (Math.random() - 0.5) * cellPx * 0.4,
          size: cellPx * 0.45,
          color: shadeAt(theme, t, GRID_SIZE * GRID_SIZE),
          alpha: 1,
        });
      }
    }

    var startTime = performance.now();
    var duration = 1200;

    function animateBlow(now) {
      var elapsed = now - startTime;
      var progress = Math.min(1, elapsed / duration);

      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      var gridTint = GRID_COLORS[gridColorKey] || GRID_COLORS.default;
      for (var i = 0; i < GRID_SIZE; i++) {
        for (var j = 0; j < GRID_SIZE; j++) {
          ctx.fillStyle = (i + j) % 2 === 0 ? gridTint.a : gridTint.b;
          ctx.fillRect(i * cellPx, j * cellPx, cellPx, cellPx);
        }
      }

      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 1.02;
        p.vy *= 1.02;
        p.alpha = 1 - progress;
        p.size *= 0.995;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;

      if (progress < 1) {
        requestAnimationFrame(animateBlow);
      } else {
        overlayTitle.textContent = 'You Win!';
        overlayMessage.textContent = 'Score: ' + score + ' \u2014 Grid Complete!';
        startBtn.textContent = 'Play Again';
        settingsEl.classList.remove('disabled');
        overlay.classList.remove('hidden');
      }
    }

    requestAnimationFrame(animateBlow);
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
      } else if (group === 'color') {
        colorKey = btn.dataset.value;
        localStorage.setItem(COLOR_KEY, colorKey);
      } else if (group === 'gridColor') {
        gridColorKey = btn.dataset.value;
        localStorage.setItem(GRID_COLOR_KEY, gridColorKey);
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
  requestAnimationFrame(animate);
})();
