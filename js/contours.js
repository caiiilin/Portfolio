// Map lines behind the page: topography (land) / bathymetry (sea).
// Contour lines traced through a slowly shifting noise "terrain". The cursor
// raises a small hill on land and presses a small basin at sea. Lines are
// hidden over the hero's creature area and ease in from the 01 label down.
(function () {
  var root = document.documentElement;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'contours';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  var ctx = canvas.getContext('2d');

  // Look per mode. Land: tighter, busier relief. Sea: broad, calm basins.
  // Every 5th line is an "index contour", drawn a touch stronger, like on real maps.
  var MODES = {
    light: { color: [84, 110, 115],  alpha: 0.13, indexAlpha: 0.22, scale: 1 / 420, spacing: 0.08, speed: 0.000035, bump: 0.42 },
    dark:  { color: [116, 158, 184], alpha: 0.12, indexAlpha: 0.2,  scale: 1 / 680, spacing: 0.1,  speed: 0.000022, bump: -0.42 }
  };
  var KEYS = ['alpha', 'indexAlpha', 'scale', 'spacing', 'speed', 'bump'];
  var MORPH_MS = 1200;
  var FADE_RAMP = 450;      // px over which lines ease in below the start point
  var BUMP_RADIUS = 160;    // size of the cursor hill / basin
  var IDLE_MS = 4000;
  var FRAME_MS = 33;        // redraw ~30fps; the motion is slow

  var W = 0, H = 0, cell = 14;
  var theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
  var morph = null;
  var time = Math.random() * 100;
  var mouse = { x: -9999, y: -9999, moved: -Infinity };      // page coordinates
  var bump = { x: 0, y: 0, strength: 0 };
  var fadeStart = 0;
  var running = false, last = 0, sinceDraw = FRAME_MS;
  var grid = new Float32Array(0);

  // ---------- Noise (classic Perlin, 3D: x, y, time) ----------

  var perm = new Uint8Array(512);
  (function () {
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function grad(h, x, y, z) {
    h &= 15;
    var u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  function noise(x, y, z) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    var u = fade(x), v = fade(y), w = fade(z);
    var A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    var B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z),         grad(perm[BA], x - 1, y, z), u),
           lerp(grad(perm[AB], x, y - 1, z),     grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
           lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  function terrain(x, y, t) {
    return noise(x, y, t) * 0.6 + noise(x * 2.1 + 5.2, y * 2.1 + 1.3, t * 1.3) * 0.3 + noise(x * 4.3 + 9.1, y * 4.3 + 3.7, t * 1.7) * 0.1;
  }

  // ---------- Mode blending ----------

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function params(now) {
    if (!morph) return MODES[theme];
    var t = easeInOut(Math.min((now - morph.start) / MORPH_MS, 1));
    var from = MODES[morph.from], to = MODES[morph.to], p = { color: [] };
    KEYS.forEach(function (k) { p[k] = lerp(from[k], to[k], t); });
    for (var i = 0; i < 3; i++) p.color[i] = Math.round(lerp(from.color[i], to.color[i], t));
    return p;
  }

  // ---------- Layout ----------

  // Lines start at the first section label (the 01 row on the homepage, the
  // 02 row on inner pages), so the creature area and header stay clean.
  function measureStart() {
    var label = document.querySelector('main .label-row');
    fadeStart = label ? label.getBoundingClientRect().top + window.scrollY : 300;
  }

  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    cell = W < 700 ? 18 : 14;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureStart();
  }

  // ---------- Drawing (marching squares) ----------

  // Edge pairs per cell case. Edges: 0 top, 1 right, 2 bottom, 3 left.
  var SEGMENTS = [[], [3, 2], [2, 1], [3, 1], [0, 1], [0, 3, 2, 1], [0, 2], [0, 3],
                  [0, 3], [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2], []];

  function draw(now) {
    var scrollY = window.scrollY;
    ctx.clearRect(0, 0, W, H);

    // Nothing to draw while the visible area is above where the lines begin.
    var top = Math.max(scrollY, fadeStart);
    if (top >= scrollY + H) return;

    var p = params(now);
    var gy0 = Math.floor(top / cell) * cell;                  // grid aligned to the page, so lines scroll with it
    var cols = Math.ceil(W / cell) + 1;
    var rows = Math.ceil((scrollY + H - gy0) / cell) + 1;
    if (grid.length < cols * rows) grid = new Float32Array(cols * rows);

    var r2 = 2 * BUMP_RADIUS * BUMP_RADIUS;
    var amp = p.bump * bump.strength;
    for (var r = 0; r < rows; r++) {
      var py = gy0 + r * cell;
      for (var c = 0; c < cols; c++) {
        var px = c * cell;
        var v = terrain(px * p.scale, py * p.scale, time);
        if (amp) {
          var dx = px - bump.x, dy = py - bump.y;
          v += amp * Math.exp(-(dx * dx + dy * dy) / r2);
        }
        grid[r * cols + c] = v;
      }
    }

    var color = p.color.join(', ');
    var minLevel = Math.ceil(-1.2 / p.spacing), maxLevel = Math.floor(1.2 / p.spacing);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (var k = minLevel; k <= maxLevel; k++) {
      var level = k * p.spacing;
      var isIndex = k % 5 === 0;
      ctx.beginPath();
      for (r = 0; r < rows - 1; r++) {
        var y0 = gy0 + r * cell - scrollY;
        for (c = 0; c < cols - 1; c++) {
          var i = r * cols + c;
          var v0 = grid[i], v1 = grid[i + 1], v2 = grid[i + cols + 1], v3 = grid[i + cols];
          var idx = (v0 > level ? 8 : 0) | (v1 > level ? 4 : 0) | (v2 > level ? 2 : 0) | (v3 > level ? 1 : 0);
          var seg = SEGMENTS[idx];
          if (!seg.length) continue;
          var x0 = c * cell;
          for (var s = 0; s < seg.length; s += 2) {
            for (var e = 0; e < 2; e++) {
              var edge = seg[s + e], ex, ey;
              if (edge === 0)      { ex = x0 + cell * (level - v0) / (v1 - v0); ey = y0; }
              else if (edge === 1) { ex = x0 + cell; ey = y0 + cell * (level - v1) / (v2 - v1); }
              else if (edge === 2) { ex = x0 + cell * (level - v3) / (v2 - v3); ey = y0 + cell; }
              else                 { ex = x0; ey = y0 + cell * (level - v0) / (v3 - v0); }
              if (e === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
            }
          }
        }
      }
      ctx.strokeStyle = 'rgba(' + color + ', ' + (isIndex ? p.indexAlpha : p.alpha) + ')';
      ctx.lineWidth = isIndex ? 1.4 : 1;
      ctx.stroke();
    }

    // Ease the lines in below the start point.
    var fadeTop = fadeStart - scrollY;
    if (fadeTop + FADE_RAMP > 0) {
      var g = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + FADE_RAMP);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- Loop ----------

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    var p = params(now);
    time += dt * p.speed;

    // Cursor hill/basin follows smoothly and fades out when the mouse rests.
    var active = now - mouse.moved < IDLE_MS;
    bump.strength += ((active ? 1 : 0) - bump.strength) * 0.04;
    bump.x += (mouse.x - bump.x) * 0.08;
    bump.y += (mouse.y - bump.y) * 0.08;

    sinceDraw += dt;
    if (sinceDraw >= FRAME_MS) { sinceDraw = 0; draw(now); }
    if (morph && now - morph.start >= MORPH_MS) morph = null;
    requestAnimationFrame(frame);
  }

  function setRunning() {
    if (reduceMotion) { draw(performance.now()); return; }    // still map, redrawn on scroll
    var should = !document.hidden;
    if (should && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    if (!should) running = false;
  }

  // ---------- Input ----------

  if (finePointer && !reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var first = mouse.moved === -Infinity;
      mouse.x = e.clientX;
      mouse.y = e.clientY + window.scrollY;
      mouse.moved = performance.now();
      if (first) { bump.x = mouse.x; bump.y = mouse.y; }
    }, { passive: true });
  }

  window.addEventListener('scroll', function () {
    if (reduceMotion) draw(performance.now());
  }, { passive: true });

  new MutationObserver(function () {
    var next = root.dataset.theme === 'dark' ? 'dark' : 'light';
    if (next === theme) return;
    morph = reduceMotion ? null : { from: theme, to: next, start: performance.now() };
    theme = next;
    if (reduceMotion) draw(performance.now());
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  document.addEventListener('visibilitychange', setRunning);
  window.addEventListener('resize', function () { measure(); draw(performance.now()); });
  window.addEventListener('load', measureStart);               // images can shift the start point
  new ResizeObserver(measureStart).observe(document.body);

  measure();
  setRunning();
})();
