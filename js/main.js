// Theme toggles: each label shows the current theme. Pages can rename the
// themes with data-label-light / data-label-dark (default "LIGHT" / "DARK").
// A page can have more than one toggle (e.g. the header and Rare Sightings).
(function () {
  var root = document.documentElement;
  var toggles = document.querySelectorAll('.theme-toggle');

  function render() {
    var theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
    toggles.forEach(function (toggle) {
      var label = toggle.querySelector('.theme-toggle__label');
      label.textContent = toggle.dataset['label' + (theme === 'dark' ? 'Dark' : 'Light')] || theme.toUpperCase();
      toggle.setAttribute('aria-pressed', theme === 'dark');
    });
  }

  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
      render();
    });
  });

  render();
})();

// Card videos: hold on the poster frame for visitors who prefer reduced motion.
(function () {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.card__media video').forEach(function (video) {
    video.removeAttribute('autoplay');
    video.pause();
  });
})();

// Hand-drawn filters for land-mode UI lines (section rules, nav underlines,
// pill outlines): smooth, low-frequency noise bends the edges into a gentle
// hand-drawn wobble, then a hair of blur smooths the displaced edges so they
// don't look stair-stepped. Referenced from CSS.
(function () {
  function inked(id, x, y, w, h, frequency, wobble) {
    return '<filter id="' + id + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + frequency + '" numOctaves="2" seed="2" result="warp"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="warp" scale="' + wobble + '" xChannelSelector="R" yChannelSelector="G" result="drawn"/>' +
      '<feGaussianBlur in="drawn" stdDeviation="0.35"/>' +
      '</filter>';
  }
  document.body.insertAdjacentHTML('afterbegin',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
    inked('pencil-line', '-2%', '-300%', '104%', '700%', '0.012 0.03', 3.5) +
    inked('pencil-box', '-4%', '-15%', '108%', '130%', '0.02', 4) +
    '</svg>');
})();

// Sea mode: the "depth" readout in the homepage status line follows the scroll,
// from 0m at the top down to the ocean floor at the footer. One passive scroll
// listener, at most one text update per frame.
(function () {
  var value = document.querySelector('[data-depth]');
  if (!value) return;
  var zone = document.querySelector('[data-depth-zone]');
  var FLOOR = 3800;                                   // average ocean depth, in metres
  var ZONES = [[0, 'surfacing soon'], [1, 'sunlight zone'], [200, 'twilight zone'], [1000, 'midnight zone'], [3000, 'abyssal zone']];
  var queued = false, shown = -1;

  function update() {
    queued = false;
    var room = document.documentElement.scrollHeight - innerHeight;
    var depth = room > 0 ? Math.round(Math.min(1, Math.max(0, scrollY / room)) * FLOOR) : 0;
    if (depth === shown) return;
    shown = depth;
    value.textContent = depth.toLocaleString('en-US');
    if (zone) {
      var label = ZONES[0][1];
      for (var i = 0; i < ZONES.length; i++) if (depth >= ZONES[i][0]) label = ZONES[i][1];
      if (zone.textContent !== label) zone.textContent = label;
    }
  }
  addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();

// Land mode: clicking the "last sighting" animal swaps in another one.
// The list is shuffled on every visit, and the same animal never shows twice in a row.
(function () {
  var btn = document.querySelector('.sighting');
  if (!btn) return;
  var ANIMALS = ['northern flicker', 'eastern phoebe', 'killdeer', 'pine siskin', 'gray fox', 'raccoon',
    'opossum', 'monkey and lindor! (my cats)', 'red-backed salamander', 'box turtle'];
  var order = [], i = 0;

  function reshuffle() {
    var last = order[order.length - 1];
    order = ANIMALS.slice();
    for (var j = order.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = order[j]; order[j] = order[k]; order[k] = t; }
    if (order[0] === last || order[0] === btn.textContent) order.push(order.shift());
    i = 0;
  }

  btn.addEventListener('click', function () {
    if (i >= order.length) reshuffle();
    btn.textContent = order[i++];
    btn.classList.remove('is-new');
    void btn.offsetWidth;                  // restart the fade-in
    btn.classList.add('is-new');
  });
  reshuffle();
})();
