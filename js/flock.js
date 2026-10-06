// Hero flock (land) / school (sea).
// Boids that follow the cursor in the open space between the nav and the
// 01 label. Birds in light mode, minnows in dark mode; switching the theme
// sends the birds diving into the water as fish (or the fish leaping up as
// birds). The shapes are simple placeholders — see drawBird / drawFish.
(function () {
  var hero = document.querySelector('.hero');
  var label = hero && hero.querySelector('.label-row');
  var header = document.querySelector('.site-header');
  if (!hero || !label || !header) return;

  var root = document.documentElement;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'flock';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  var ctx = canvas.getContext('2d');

  // Behaviour per mode. Birds: loose and swoopy. Fish: tight, quick, and
  // circling the cursor (a "bait ball"). `stray` sets how loosely the
  // outer stragglers hang around the group (0 = everyone stays tight).
  var MODES = {
    light: { maxSpeed: 3.2, maxForce: 0.08, view: 80, space: 36, align: 0.9, cohere: 0.45, separate: 1.6, follow: 0.5, orbit: 0, size: 9, stray: 0.5 },
    dark:  { maxSpeed: 3.8, maxForce: 0.13, view: 48, space: 19, align: 1.6, cohere: 0.95, separate: 1.7, follow: 0.8, orbit: 0.9, size: 7, stray: 1 }
  };
  var KEYS = Object.keys(MODES.light);
  var COUNT = 110;
  var MORPH_MS = 1400;      // bird ↔ fish transition
  var SCATTER_MS = 700;     // flock breaks apart after a click
  var IDLE_MS = 4000;       // cursor still this long → flock wanders
  var SPREAD = 2.5;         // higher = more of the group sticks to the core
  // Invisible boundary: creatures are steered back once they enter this band
  // along the canvas edges, and fade out across it, so nothing gets cut off.
  var FEATHER_X = 72, FEATHER_Y = 56;

  var W = 0, H = 0;
  var agents = [];
  var pointer = { x: 0, y: 0, inside: false, moved: 0 };
  var scatterUntil = 0;
  var theme = currentTheme();
  var colors = {};
  colors[theme] = navColor();
  var morph = null;         // { from, to, start }
  var running = false, visible = true, last = 0;

  function currentTheme() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }
  function navColor() { return getComputedStyle(root).getPropertyValue('--c-nav').trim() || '#546e73'; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function morphT(now) {
    return morph ? ease(Math.min((now - morph.start) / MORPH_MS, 1)) : 1;
  }

  // Tuning blends between modes while a transition is running.
  function params(now) {
    if (!morph) return MODES[theme];
    var t = morphT(now), from = MODES[morph.from], to = MODES[morph.to], p = {};
    KEYS.forEach(function (k) { p[k] = lerp(from[k], to[k], t); });
    return p;
  }

  // ---------- Layout ----------

  function measure() {
    var heroTop = hero.getBoundingClientRect().top;
    var top = header.getBoundingClientRect().bottom - heroTop + 4;
    var bottom = label.getBoundingClientRect().top - heroTop - 4;
    W = hero.clientWidth;
    H = Math.max(bottom - top, 0);
    canvas.style.top = top + 'px';
    canvas.style.height = H + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    agents.forEach(function (a) {
      a.x = Math.min(a.x, W);
      a.y = Math.min(a.y, H);
    });
  }

  function spawn() {
    agents = [];
    for (var i = 0; i < COUNT; i++) {
      var angle = Math.random() * Math.PI * 2;
      agents.push({
        x: W * (0.2 + Math.random() * 0.6),
        y: H * (0.2 + Math.random() * 0.6),
        vx: Math.cos(angle) * 2,
        vy: Math.sin(angle) * 2,
        phase: Math.random() * Math.PI * 2,
        // How closely this one sticks with the group (0.2–1). Most stay near
        // the core and the rest thin out gradually toward the edges.
        loyal: 1 - 0.8 * Math.pow(Math.random(), SPREAD)
      });
    }
  }

  // ---------- Simulation ----------

  function clampX(x) { return Math.max(FEATHER_X, Math.min(W - FEATHER_X, x)); }
  function clampY(y) { return Math.max(FEATHER_Y, Math.min(H - FEATHER_Y, y)); }

  function target(now) {
    if (pointer.inside && now - pointer.moved < IDLE_MS) return { x: clampX(pointer.x), y: clampY(pointer.y), cursor: true };
    var t = now / 1000;   // drift slowly around the space when idle
    return {
      x: clampX(W * (0.5 + 0.35 * Math.sin(t * 0.23))),
      y: clampY(H * (0.5 + 0.3 * Math.sin(t * 0.37 + 1))),
      cursor: false
    };
  }

  function limit(x, y, max) {
    var m = Math.hypot(x, y);
    return m > max ? [x / m * max, y / m * max] : [x, y];
  }

  // Steer toward a desired direction at full speed.
  function steer(a, dx, dy, p) {
    var m = Math.hypot(dx, dy);
    if (!m) return [0, 0];
    return limit(dx / m * p.maxSpeed - a.vx, dy / m * p.maxSpeed - a.vy, p.maxForce);
  }

  function step(now, dt) {
    var p = params(now);
    var goal = target(now);
    var scattering = now < scatterUntil;

    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      var sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, n = 0;

      for (var j = 0; j < agents.length; j++) {
        if (i === j) continue;
        var b = agents[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        if (d > p.view || d === 0) continue;
        n++;
        aliX += b.vx; aliY += b.vy;
        cohX += b.x; cohY += b.y;
        if (d < p.space) { sepX -= dx / d / d; sepY -= dy / d / d; }
      }

      var ax = 0, ay = 0, f;
      var l = 1 - (1 - a.loyal) * p.stray;   // 1 = core of the group, lower = straggler
      if (n) {
        f = steer(a, aliX, aliY, p);                       ax += f[0] * p.align;  ay += f[1] * p.align;
        f = steer(a, cohX / n - a.x, cohY / n - a.y, p);   var c = (scattering ? 0.2 : p.cohere) * l;
                                                           ax += f[0] * c;        ay += f[1] * c;
      }
      if (sepX || sepY) { f = steer(a, sepX, sepY, p);     var s = p.separate * (2 - l);
                                                           ax += f[0] * s;        ay += f[1] * s; }
      // Stragglers wander a little on their own.
      ax += (Math.random() - 0.5) * p.maxForce * (1 - l) * 1.5;
      ay += (Math.random() - 0.5) * p.maxForce * (1 - l) * 1.5;

      // Follow the cursor (or the idle drift point), easing in when close.
      var gx = goal.x - a.x, gy = goal.y - a.y, gd = Math.hypot(gx, gy);
      if (!scattering && gd > 1) {
        f = steer(a, gx, gy, p);
        var w = p.follow * l * Math.min(gd / 80, 1);
        ax += f[0] * w; ay += f[1] * w;
        // Fish circle the cursor instead of piling onto it; stragglers
        // circle on wider loops.
        if (goal.cursor && p.orbit && gd < Math.min(140 / l, 340)) {
          ax += -gy / gd * p.maxForce * p.orbit;
          ay +=  gx / gd * p.maxForce * p.orbit;
        }
      }

      // Invisible walls: turn back once inside the feathered edge band.
      if (a.x < FEATHER_X)     ax += (FEATHER_X - a.x) / FEATHER_X * p.maxForce * 2.5;
      if (a.x > W - FEATHER_X) ax -= (a.x - (W - FEATHER_X)) / FEATHER_X * p.maxForce * 2.5;
      if (a.y < FEATHER_Y)     ay += (FEATHER_Y - a.y) / FEATHER_Y * p.maxForce * 2.5;
      if (a.y > H - FEATHER_Y) ay -= (a.y - (H - FEATHER_Y)) / FEATHER_Y * p.maxForce * 2.5;

      a.vx += ax * dt; a.vy += ay * dt;
      var v = limit(a.vx, a.vy, p.maxSpeed * (scattering ? 2 : 1));
      a.vx = v[0]; a.vy = v[1];
      a.x = Math.max(0, Math.min(W, a.x + a.vx * dt));
      a.y = Math.max(0, Math.min(H, a.y + a.vy * dt));
      a.phase += (0.12 + Math.hypot(a.vx, a.vy) * 0.05) * dt;
    }
  }

  // ---------- Drawing (placeholder shapes) ----------

  // Sketchy gull "v", side view; wings flap with phase.
  function drawBird(a, size, alpha, color) {
    var lift = size * (0.35 + 0.35 * Math.sin(a.phase));
    var tilt = Math.atan2(a.vy, Math.abs(a.vx) + 0.001) * 0.4;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.vx < 0 ? -tilt : tilt);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size, -lift);
    ctx.quadraticCurveTo(-size * 0.35, -lift * 0.15, 0, size * 0.2);
    ctx.quadraticCurveTo(size * 0.35, -lift * 0.15, size, -lift);
    ctx.stroke();
    ctx.restore();
  }

  // Minnow, side view, pointing along its heading; tail wiggles.
  function drawFish(a, size, alpha, color) {
    var tail = Math.sin(a.phase * 1.6) * 0.35;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(a.vy, a.vx));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.8, 0);
    ctx.lineTo(-size * 1.5, -size * 0.45 + tail * size);
    ctx.lineTo(-size * 1.5,  size * 0.45 + tail * size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 1 inside the open space, easing to 0 at the canvas edges.
  function edgeFade(a) {
    var fx = Math.min(a.x, W - a.x) / FEATHER_X;
    var fy = Math.min(a.y, H - a.y) / FEATHER_Y;
    var f = Math.max(0, Math.min(fx, fy, 1));
    return f * f * (3 - 2 * f);
  }

  function drawAs(mode, a, size, alpha) {
    alpha *= edgeFade(a);
    if (alpha <= 0.01) return;
    (mode === 'dark' ? drawFish : drawBird)(a, size, alpha, colors[mode] || navColor());
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    var t = morph ? morphT(now) : 1;
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      if (morph && t < 1) {
        drawAs(morph.from, a, MODES[morph.from].size * (1 - 0.5 * t), 1 - t);
        drawAs(morph.to,   a, MODES[morph.to].size * (0.5 + 0.5 * t), t);
      } else {
        drawAs(theme, a, MODES[theme].size, 1);
      }
    }
  }

  // ---------- Loop ----------

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min((now - last) / 16.67, 3) : 1;
    last = now;
    step(now, dt);
    draw(now);
    if (morph && now - morph.start >= MORPH_MS) morph = null;
    requestAnimationFrame(frame);
  }

  function setRunning() {
    var should = !reduceMotion && visible && !document.hidden && H > 0;
    if (should && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    if (!should) running = false;
  }

  // ---------- Input ----------

  window.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    var heroBottom = hero.getBoundingClientRect().bottom;
    pointer.inside = e.clientY < heroBottom;
    pointer.x = Math.max(0, Math.min(W, e.clientX - r.left));
    pointer.y = Math.max(0, Math.min(H, e.clientY - r.top));
    pointer.moved = performance.now();
  }, { passive: true });

  document.addEventListener('pointerleave', function () { pointer.inside = false; });

  // Click: the flock scatters away from the click, then regroups.
  hero.addEventListener('pointerdown', function (e) {
    if (reduceMotion) return;
    var r = canvas.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    agents.forEach(function (a) {
      var dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy) || 1;
      if (d < 260) {
        var push = (1 - d / 260) * 9;
        a.vx += dx / d * push;
        a.vy += dy / d * push;
      }
    });
    scatterUntil = performance.now() + SCATTER_MS;
  });

  // Theme switch: birds dive down into fish, fish leap up into birds.
  new MutationObserver(function () {
    var next = currentTheme();
    if (next === theme) return;
    colors[next] = navColor();
    if (reduceMotion) { theme = next; draw(0); return; }
    morph = { from: theme, to: next, start: performance.now() };
    theme = next;
    var dir = next === 'dark' ? 1 : -1;
    agents.forEach(function (a) { a.vy += dir * (3 + Math.random() * 2); });
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    setRunning();
  }).observe(canvas);

  document.addEventListener('visibilitychange', setRunning);

  new ResizeObserver(function () {
    measure();
    if (!running) draw(0);
    setRunning();
  }).observe(hero);

  measure();
  spawn();
  draw(0);    // reduced motion: a still flock/school, no animation
  setRunning();
})();
