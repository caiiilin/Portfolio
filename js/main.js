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
