// About page "rare sightings": a small flock (land) / school (sea) in its own
// band, with six special creatures mixed in, one per interest. Clicking a
// special one identifies it and opens its field note below the band (copied
// from the "see all field notes" list, so the copy lives in the HTML).
// Shapes are placeholders like the hero flock: see drawBird / drawFish and
// the SPECIES table for each creature's colors and quirks.
(function () {
  var section = document.querySelector('.sightings');
  var arena = section && section.querySelector('.sightings__arena');
  var dock = section && section.querySelector('.sightings__dock');
  if (!arena || !dock) return;

  var root = document.documentElement;
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var counter = section.querySelector('[data-found]');
  var countLine = section.querySelector('.sightings__count');
  var notes = {};
  section.querySelectorAll('.field-notes .field-note').forEach(function (note) {
    notes[note.dataset.species] = note;
  });

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  arena.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  // Same feel as the hero flock, a little calmer since it's mid-page.
  var MODES = {
    light: { maxSpeed: 2.8, maxForce: 0.07, view: 80, space: 38, align: 0.9, cohere: 0.4, separate: 1.6, follow: 0.45, orbit: 0, size: 9, stray: 0.5 },
    dark:  { maxSpeed: 3.2, maxForce: 0.11, view: 52, space: 22, align: 1.4, cohere: 0.8, separate: 1.7, follow: 0.7, orbit: 0.8, size: 7, stray: 1 }
  };
  var KEYS = Object.keys(MODES.light);

  // The six special creatures: [body, accent] colors per mode. Their quirks
  // are in special() (movement) and drawSpecial() (looks).
  var SPECIES = {
    mets:   { light: ['#002d72', '#ff5910'], dark: ['#ff5910', '#002d72'] },   // rounds the bases
    knicks: { light: ['#006bb6', '#f58426'], dark: ['#006bb6', '#f58426'] },   // dribbles
    rothko: { light: ['#a3342b', '#e8873a'], dark: ['#e0604f', '#f2a05a'] },   // slow color field
    drama:  { light: ['#d9467c', '#f2b8cc'], dark: ['#ff6fa3', '#ffd0e0'] },   // storms off
    rock:   { light: ['#1f1f24', '#d62828'], dark: ['#e63946', '#ffb3b3'] },   // headbangs, glows on the beat
    hike:   { light: ['#3f7d4e', '#c9853f'], dark: ['#6fcf8a', '#e0a35f'] }    // climbs high (land) / dives deep (sea)
  };
  var ORDER = Object.keys(notes).filter(function (id) { return SPECIES[id]; });

  var COUNT = 46;           // ordinary creatures at full width
  var SPECIAL_SIZE = 1.7;   // special creatures are drawn this much bigger
  var HIT = 30;             // px around a special creature that counts as a click
  var MORPH_MS = 1400;
  var SCATTER_MS = 700;
  var IDLE_MS = 4000;
  var SPREAD = 2.5;
  var BEAT_MS = 520;        // rock creature's tempo
  var FEATHER_X = 72, FEATHER_Y = 56;
  var STORE = 'sightings';

  var W = 0, H = 0;
  var agents = [];
  var pointer = { x: 0, y: 0, inside: false, moved: 0, touch: false };
  var hovered = null;
  var scatterUntil = 0;
  var theme = currentTheme();
  var colors = {};
  colors[theme] = navColor();
  var morph = null;
  var running = false, visible = false, last = 0;
  var found = loadFound();
  var cursorEl = null;

  function currentTheme() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }
  function navColor() { return getComputedStyle(root).getPropertyValue('--c-nav').trim() || '#546e73'; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function morphT(now) { return morph ? ease(Math.min((now - morph.start) / MORPH_MS, 1)) : 1; }

  function params(now) {
    if (!morph) return MODES[theme];
    var t = morphT(now), from = MODES[morph.from], to = MODES[morph.to], p = {};
    KEYS.forEach(function (k) { p[k] = lerp(from[k], to[k], t); });
    return p;
  }

  // ---------- Life list ----------

  function loadFound() {
    try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; }
  }
  function saveFound() {
    try { localStorage.setItem(STORE, JSON.stringify(found)); } catch (e) {}
  }

  function renderCount() {
    counter.textContent = found.length;
    countLine.classList.toggle('is-complete', found.length >= ORDER.length);
  }

  function showNote(id) {
    var note = notes[id];
    if (!note) return;
    var copy = note.cloneNode(true);
    copy.classList.add('is-new');
    dock.replaceChildren(copy);
  }

  function identify(a) {
    if (found.indexOf(a.species) < 0) { found.push(a.species); saveFound(); }
    renderCount();
    showNote(a.species);
    // The rest of the group startles a little; the spotted one holds still.
    agents.forEach(function (b) {
      if (b === a) return;
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < 140) { b.vx += dx / d * 4 * (1 - d / 140); b.vy += dy / d * 4 * (1 - d / 140); }
    });
    a.vx *= 0.2; a.vy *= 0.2;
    if (reduceMotion) draw(0);
  }

  // ---------- Layout ----------

  function measure() {
    W = arena.clientWidth;
    H = arena.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    agents.forEach(function (a) {
      a.x = Math.min(a.x, W);
      a.y = Math.min(a.y, H);
    });
  }

  function makeAgent(species, x, y) {
    var angle = Math.random() * Math.PI * 2;
    return {
      x: x, y: y,
      vx: Math.cos(angle) * 2,
      vy: Math.sin(angle) * 2,
      phase: Math.random() * Math.PI * 2,
      loyal: species ? 0.45 : 1 - 0.8 * Math.pow(Math.random(), SPREAD),
      species: species,
      base: 0,                                    // mets: next base on the diamond
      nextDrama: performance.now() + 3000 + Math.random() * 5000,
      dramaUntil: 0, dramaX: 0, dramaY: 0,        // drama: where it's storming off to
      lift: 0                                     // knicks: drawn bounce height (also used for hit tests)
    };
  }

  function spawn() {
    agents = [];
    var count = Math.round(COUNT * Math.max(0.45, Math.min(W / 1770, 1)));
    for (var i = 0; i < count; i++) {
      agents.push(makeAgent(null, W * (0.2 + Math.random() * 0.6), H * (0.2 + Math.random() * 0.6)));
    }
    // Specials start spread out across the band so they're easy to spot.
    ORDER.forEach(function (id, i) {
      var x = W * (0.15 + 0.7 * (i + 0.5) / ORDER.length);
      agents.push(makeAgent(id, x, H * (0.3 + Math.random() * 0.4)));
    });
  }

  // ---------- Simulation ----------

  function clampX(x) { return Math.max(FEATHER_X, Math.min(W - FEATHER_X, x)); }
  function clampY(y) { return Math.max(FEATHER_Y, Math.min(H - FEATHER_Y, y)); }

  function target(now) {
    if (pointer.inside && now - pointer.moved < IDLE_MS) return { x: clampX(pointer.x), y: clampY(pointer.y), cursor: true };
    var t = now / 1000;
    return {
      x: clampX(W * (0.5 + 0.35 * Math.sin(t * 0.21))),
      y: clampY(H * (0.5 + 0.28 * Math.sin(t * 0.33 + 1))),
      cursor: false
    };
  }

  function limit(x, y, max) {
    var m = Math.hypot(x, y);
    return m > max ? [x / m * max, y / m * max] : [x, y];
  }

  function steer(a, dx, dy, p) {
    var m = Math.hypot(dx, dy);
    if (!m) return [0, 0];
    return limit(dx / m * p.maxSpeed - a.vx, dy / m * p.maxSpeed - a.vy, p.maxForce);
  }

  // Each special creature's own way of moving. Adds to the steering force
  // `acc` and returns { speed, follow } multipliers.
  function special(a, now, p, acc) {
    var out = { speed: 1, follow: 0.5 }, f;
    switch (a.species) {
      case 'mets': {
        // Rounds the bases: home → first → second → third, on a drifting diamond.
        var cx = W / 2 + W * 0.18 * Math.sin(now / 9000), cy = H / 2;
        var r = Math.min(W * 0.3, H * 0.32);
        var bx = cx + [0, r, 0, -r][a.base], by = cy + [r, 0, -r, 0][a.base];
        if (Math.hypot(bx - a.x, by - a.y) < 26) a.base = (a.base + 1) % 4;
        f = steer(a, bx - a.x, by - a.y, p);
        acc[0] += f[0] * 1.6; acc[1] += f[1] * 1.6;
        out.follow = 0;
        break;
      }
      case 'rothko':
        out.speed = 0.45;          // lingers
        break;
      case 'drama':
        // Every so often storms off to an edge, then rejoins the group.
        if (now > a.nextDrama) {
          a.dramaUntil = now + 1800;
          a.nextDrama = now + 7000 + Math.random() * 5000;
          var side = Math.random() < 0.5;
          a.dramaX = side ? (a.x < W / 2 ? W - FEATHER_X : FEATHER_X) : clampX(Math.random() * W);
          a.dramaY = side ? clampY(Math.random() * H) : (a.y < H / 2 ? H - FEATHER_Y : FEATHER_Y);
        }
        if (now < a.dramaUntil) {
          f = steer(a, a.dramaX - a.x, a.dramaY - a.y, p);
          acc[0] += f[0] * 2.2; acc[1] += f[1] * 2.2;
          out.speed = 1.6;
          out.follow = 0;
        }
        break;
      case 'hike': {
        // Heads for the high ground on land, the deep end at sea.
        var ty = theme === 'dark' ? H * 0.8 : H * 0.2;
        acc[1] += Math.max(-1, Math.min(1, (ty - a.y) / 100)) * p.maxForce * 0.9;
        break;
      }
    }
    if (a === hovered) out.speed *= 0.25;   // slows down under the cursor so it's easy to click
    return out;
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

      var acc = [0, 0], f;
      var l = 1 - (1 - a.loyal) * p.stray;
      if (n) {
        f = steer(a, aliX, aliY, p);                       acc[0] += f[0] * p.align;  acc[1] += f[1] * p.align;
        f = steer(a, cohX / n - a.x, cohY / n - a.y, p);   var c = (scattering ? 0.2 : p.cohere) * l;
                                                           acc[0] += f[0] * c;        acc[1] += f[1] * c;
      }
      if (sepX || sepY) { f = steer(a, sepX, sepY, p);     var s = p.separate * (2 - l);
                                                           acc[0] += f[0] * s;        acc[1] += f[1] * s; }
      acc[0] += (Math.random() - 0.5) * p.maxForce * (1 - l) * 1.5;
      acc[1] += (Math.random() - 0.5) * p.maxForce * (1 - l) * 1.5;

      var mod = a.species ? special(a, now, p, acc) : { speed: 1, follow: 1 };

      var gx = goal.x - a.x, gy = goal.y - a.y, gd = Math.hypot(gx, gy);
      if (!scattering && gd > 1 && mod.follow) {
        f = steer(a, gx, gy, p);
        var w = p.follow * l * mod.follow * Math.min(gd / 80, 1);
        acc[0] += f[0] * w; acc[1] += f[1] * w;
        if (goal.cursor && p.orbit && gd < Math.min(140 / l, 340)) {
          acc[0] += -gy / gd * p.maxForce * p.orbit;
          acc[1] +=  gx / gd * p.maxForce * p.orbit;
        }
      }

      if (a.x < FEATHER_X)     acc[0] += (FEATHER_X - a.x) / FEATHER_X * p.maxForce * 2.5;
      if (a.x > W - FEATHER_X) acc[0] -= (a.x - (W - FEATHER_X)) / FEATHER_X * p.maxForce * 2.5;
      if (a.y < FEATHER_Y)     acc[1] += (FEATHER_Y - a.y) / FEATHER_Y * p.maxForce * 2.5;
      if (a.y > H - FEATHER_Y) acc[1] -= (a.y - (H - FEATHER_Y)) / FEATHER_Y * p.maxForce * 2.5;

      a.vx += acc[0] * dt; a.vy += acc[1] * dt;
      var v = limit(a.vx, a.vy, p.maxSpeed * mod.speed * (scattering ? 2 : 1));
      a.vx = v[0]; a.vy = v[1];
      a.x = Math.max(0, Math.min(W, a.x + a.vx * dt));
      a.y = Math.max(0, Math.min(H, a.y + a.vy * dt));
      a.phase += (0.12 + Math.hypot(a.vx, a.vy) * 0.05) * dt;
    }
  }

  // ---------- Drawing (placeholder shapes) ----------

  function beat(now) { return Math.pow(1 - (now % BEAT_MS) / BEAT_MS, 3); }   // 1 on the beat, easing to 0

  function drawBird(a, size, alpha, color, width) {
    var lift = size * (0.35 + 0.35 * Math.sin(a.phase));
    var tilt = Math.atan2(a.vy, Math.abs(a.vx) + 0.001) * 0.4;
    ctx.rotate(a.vx < 0 ? -tilt : tilt);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-size, -lift);
    ctx.quadraticCurveTo(-size * 0.35, -lift * 0.15, 0, size * 0.2);
    ctx.quadraticCurveTo(size * 0.35, -lift * 0.15, size, -lift);
    ctx.stroke();
  }

  function drawFish(a, size, alpha, color, glow) {
    var tail = Math.sin(a.phase * 1.6) * 0.35;
    ctx.rotate(Math.atan2(a.vy, a.vx));
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow == null ? 6 : glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.8, 0);
    ctx.lineTo(-size * 1.5, -size * 0.45 + tail * size);
    ctx.lineTo(-size * 1.5,  size * 0.45 + tail * size);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Special creatures: the ordinary shape in their own colors, plus a quirk.
  function drawSpecial(mode, a, size, alpha, now) {
    var c = SPECIES[a.species][mode], body = c[0], accent = c[1];
    var sea = mode === 'dark';
    var drama = a.species === 'drama' && now < a.dramaUntil;

    if (drama) {                                       // "!" while storming off (drawn before any rotation)
      ctx.globalAlpha = alpha;
      ctx.fillStyle = body;
      ctx.font = '700 ' + Math.round(size * 1.3) + 'px "Hanken Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -size * 1.2);
    }

    if (a.species === 'rock') {                        // headbang on the beat
      var hit = beat(now);
      ctx.rotate((a.vx < 0 ? -1 : 1) * hit * 0.5);
    }

    if (sea) {
      var puff = drama ? 2.1 : 1;                      // the puffer puffs up when it storms off
      drawFish(a, size, alpha, body, a.species === 'rock' ? 4 + 14 * beat(now) : 6);
      ctx.globalAlpha = alpha;
      if (puff > 1) {
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, 0, size * 0.8, size * 0.32 * puff, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = accent;
      switch (a.species) {
        case 'mets':
        case 'knicks':                                  // racing stripe
          ctx.fillRect(-size * 0.15, -size * 0.32, size * 0.28, size * 0.64);
          break;
        case 'rothko':                                  // two soft color fields
          ctx.save();
          ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.32, 0, 0, Math.PI * 2); ctx.clip();
          ctx.filter = 'blur(1.5px)';
          ctx.fillRect(-size, 0, size * 2, size * 0.4);
          ctx.restore();
          break;
        case 'rock': {                                  // anglerfish lure, flashing on the beat
          ctx.strokeStyle = body;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(size * 0.6, -size * 0.25); ctx.quadraticCurveTo(size * 1.2, -size * 1.1, size * 1.5, -size * 0.6); ctx.stroke();
          ctx.shadowColor = accent;
          ctx.shadowBlur = 6 + 16 * beat(now);
          ctx.beginPath(); ctx.arc(size * 1.5, -size * 0.6, 2.2 + 1.5 * beat(now), 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
        case 'hike':                                    // tiny backpack
          ctx.fillRect(-size * 0.45, -size * 0.55, size * 0.5, size * 0.32);
          break;
        case 'drama':
          ctx.beginPath(); ctx.arc(size * 0.55, -size * 0.06, size * 0.1, 0, Math.PI * 2); ctx.fill();
          break;
      }
    } else {
      if (a.species === 'rothko') {                     // wings fade from one color field into the other
        var wash = ctx.createLinearGradient(-size, 0, size, 0);
        wash.addColorStop(0, body);
        wash.addColorStop(0.5, accent);
        wash.addColorStop(1, body);
        ctx.filter = 'blur(0.6px)';
        drawBird(a, size, alpha, wash, 3.5);
        ctx.filter = 'none';
      } else {
        if (a.species === 'rock') {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 14 * beat(now);
        }
        drawBird(a, size, alpha, body, 3);
        ctx.shadowBlur = 0;
        ctx.fillStyle = accent;
        ctx.globalAlpha = alpha;
        if (a.species === 'hike') {                     // tiny backpack
          ctx.fillRect(-size * 0.22, -size * 0.25, size * 0.44, size * 0.42);
        } else {                                        // accent-colored body
          ctx.beginPath(); ctx.arc(0, size * 0.15, size * 0.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function edgeFade(a) {
    var fx = Math.min(a.x, W - a.x) / FEATHER_X;
    var fy = Math.min(a.y, H - a.y) / FEATHER_Y;
    var f = Math.max(0, Math.min(fx, fy, 1));
    return f * f * (3 - 2 * f);
  }

  function drawAs(mode, a, size, alpha, now) {
    alpha *= edgeFade(a);
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(a.x, a.y - a.lift);
    if (a.species) drawSpecial(mode, a, size * SPECIAL_SIZE, alpha, now);
    else if (mode === 'dark') drawFish(a, size, alpha, colors[mode] || navColor());
    else drawBird(a, size, alpha, colors[mode] || navColor());
    ctx.restore();
  }

  // Small marks around special creatures: a ring under the cursor, and a
  // field tag ("01") once identified.
  function drawMarks(a, size, now) {
    var alpha = edgeFade(a);
    if (alpha <= 0.01) return;
    var y = a.y - a.lift;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colors[theme] || navColor();
    ctx.fillStyle = ctx.strokeStyle;
    if (a === hovered) {
      var pulse = (now % 1200) / 1200;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(a.x, y, size * 2.2 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
    }
    var n = found.indexOf(a.species);
    if (n >= 0) {
      ctx.font = '500 11px "Hanken Grotesk", sans-serif';
      ctx.fillText(String(ORDER.indexOf(a.species) + 1).padStart(2, '0'), a.x + size * 1.6, y - size * 1.4);
    }
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    var t = morph ? morphT(now) : 1;
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      a.lift = a.species === 'knicks' ? Math.abs(Math.sin(now / 230)) * MODES[theme].size * 1.6 : 0;
      if (morph && t < 1) {
        drawAs(morph.from, a, MODES[morph.from].size * (1 - 0.5 * t), 1 - t, now);
        drawAs(morph.to,   a, MODES[morph.to].size * (0.5 + 0.5 * t), t, now);
      } else {
        drawAs(theme, a, MODES[theme].size, 1, now);
      }
      if (a.species) drawMarks(a, MODES[theme].size, now);
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

  function specialAt(x, y, radius) {
    var best = null, bestD = radius;
    agents.forEach(function (a) {
      if (!a.species || edgeFade(a) < 0.3) return;
      var d = Math.hypot(a.x - x, a.y - a.lift - y);
      if (d < bestD) { best = a; bestD = d; }
    });
    return best;
  }

  function setHovered(a) {
    if (a === hovered) return;
    hovered = a;
    canvas.style.cursor = a ? 'pointer' : '';
    cursorEl = cursorEl || document.querySelector('.cursor');
    if (cursorEl) cursorEl.classList.toggle('is-target', !!a);
    if (reduceMotion) draw(0);
  }

  window.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    pointer.x = Math.max(0, Math.min(W, e.clientX - r.left));
    pointer.y = Math.max(0, Math.min(H, e.clientY - r.top));
    pointer.moved = performance.now();
    pointer.touch = e.pointerType !== 'mouse';
    setHovered(pointer.inside && !pointer.touch ? specialAt(pointer.x, pointer.y, HIT) : null);
  }, { passive: true });

  document.addEventListener('pointerleave', function () { pointer.inside = false; setHovered(null); });

  // Click a special creature to identify it; click anywhere else to scatter.
  arena.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    var hit = specialAt(cx, cy, e.pointerType === 'mouse' ? HIT : HIT * 1.5);
    if (hit) { identify(hit); return; }
    if (reduceMotion) return;
    agents.forEach(function (a) {
      var dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy) || 1;
      if (d < 220) {
        var push = (1 - d / 220) * 8;
        a.vx += dx / d * push;
        a.vy += dy / d * push;
      }
    });
    scatterUntil = performance.now() + SCATTER_MS;
  });

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
  }).observe(arena);

  measure();
  spawn();
  renderCount();
  if (found.length) showNote(found[found.length - 1]);
  draw(0);    // reduced motion: a still flock/school, still clickable
  setRunning();
})();
