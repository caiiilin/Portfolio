// Custom cursor: an outlined circle that fills while the mouse is pressed.
// Mouse/trackpad only — touch devices keep their normal behaviour, and if
// this script doesn't run the regular cursor stays.
(function () {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var cursor = document.createElement('div');
  cursor.className = 'cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursor);
  document.documentElement.classList.add('has-custom-cursor');

  var x = 0, y = 0, queued = false;

  function place() {
    cursor.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    queued = false;
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    cursor.classList.add('is-visible');
    if (!queued) { queued = true; requestAnimationFrame(place); }
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') cursor.classList.add('is-pressed');
  });

  function release() { cursor.classList.remove('is-pressed'); }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  // Links with data-cursor-label turn the ring into a badge with that word;
  // data-cursor-label-dark swaps in a sea-mode word (e.g. TAKE FLIGHT / DIVE IN).
  document.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('[data-cursor-label]');
    if (!el) { delete cursor.dataset.label; return; }
    var sea = document.documentElement.dataset.theme === 'dark';
    cursor.dataset.label = (sea && el.dataset.cursorLabelDark) || el.dataset.cursorLabel;
  });

  // Hide when the mouse leaves the window.
  document.addEventListener('pointerout', function (e) {
    if (!e.relatedTarget) cursor.classList.remove('is-visible');
  });
})();
