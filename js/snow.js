// Marine snow (sea mode): soft particles slowly sinking and swaying behind
// the page. Nearer flakes are bigger, softer, faster, and shift more as you
// scroll. Only runs in dark mode; CSS crossfades it with the paper grain.
(function () {
  var root = document.documentElement;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'marine-snow';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  var ctx = canvas.getContext('2d');

  var DENSITY = 9000;       // one flake per this many px² of screen
  var MAX_FLAKES = 260;
  var COLOR = '225, 236, 242';
  var FADE_MS = 900;        // keep drawing while the CSS fade-out runs

  var W = 0, H = 0, dpr = 1;
  var flakes = [];
  var sprites = [];
  var running = false, last = 0, stopAt = 0;

  function isSea() { return root.dataset.theme === 'dark'; }

  // Pre-render soft round flakes once; drawing images is much cheaper than blurs.
  function makeSprite(radius, softness) {
    var size = Math.ceil(radius * 2 * dpr) + 2;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var mid = size / 2;
    var grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
    grad.addColorStop(0, 'rgba(' + COLOR + ', 1)');
    grad.addColorStop(1 - softness, 'rgba(' + COLOR + ', .6)');
    grad.addColorStop(1, 'rgba(' + COLOR + ', 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return { canvas: c, size: size / dpr };
  }

  function flake(randomY) {
    var z = 0.25 + Math.random() * 0.75;            // depth: 1 = closest
    return {
      x: Math.random() * W,
      y: randomY ? Math.random() * H : -10,
      z: z,
      sprite: z > 0.85 ? 2 : z > 0.55 ? 1 : 0,
      alpha: 0.15 + Math.random() * 0.35 + (z > 0.85 ? -0.1 : 0),
      fall: 0.12 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
      sway: 0.1 + Math.random() * 0.25
    };
  }

  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sprites = [makeSprite(1.1, 0.5), makeSprite(2, 0.7), makeSprite(4, 0.9)];
    var count = Math.min(Math.round(W * H / DENSITY), MAX_FLAKES);
    while (flakes.length < count) flakes.push(flake(true));
    flakes.length = count;
  }

  function step(dt) {
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.phase += 0.01 * dt;
      f.y += f.fall * f.z * dt;
      f.x += Math.sin(f.phase) * f.sway * f.z * dt;
      if (f.y > H + 10) { flakes[i] = flake(false); }
      if (f.x < -10) f.x += W + 20;
      if (f.x > W + 10) f.x -= W + 20;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var scroll = window.scrollY;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      var s = sprites[f.sprite];
      // Parallax: nearer flakes move more with the page.
      var y = ((f.y - scroll * 0.15 * f.z) % (H + 20) + H + 20) % (H + 20) - 10;
      ctx.globalAlpha = f.alpha;
      ctx.drawImage(s.canvas, f.x - s.size / 2, y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    if (!isSea() && now > stopAt) { running = false; return; }
    var dt = last ? Math.min((now - last) / 16.67, 3) : 1;
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function update() {
    if (reduceMotion) { if (isSea()) draw(); return; }   // still flakes, no motion
    if (!isSea()) stopAt = performance.now() + FADE_MS;
    var should = (isSea() || performance.now() < stopAt) && !document.hidden;
    if (should && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    if (!should) running = false;
  }

  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('resize', function () { measure(); if (!running && isSea()) draw(); });
  if (reduceMotion) window.addEventListener('scroll', function () { if (isSea()) draw(); }, { passive: true });

  measure();
  update();
})();
