/* Playground: drag pieces around the desk, shuffle them, tidy them into a grid,
   highlight a category with the stickers, and click a piece to open its note.
   Phones always get the tidy grid. */
(function () {
  var page = document.querySelector('.playground');
  if (!page) return;

  var desk = page.querySelector('.desk');
  var pieces = Array.prototype.slice.call(page.querySelectorAll('.piece'));
  var narrow = matchMedia('(max-width: 700px)');
  var tidyBtn = page.querySelector('[data-action="tidy"]');
  var wantTidy = false;
  var topZ = pieces.length;

  // Sea mode: each piece bobs on its own schedule.
  pieces.forEach(function (p) { p.style.setProperty('--d', (-Math.random() * 6).toFixed(2) + 's'); });

  // ---------- Videos play while hovered ----------

  pieces.forEach(function (p) {
    var v = p.querySelector('video');
    if (!v) return;
    p.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') v.play().catch(function () {}); });
    p.addEventListener('pointerleave', function () { v.pause(); });
  });

  // ---------- Tidy / messy ----------

  function layout() {
    var tidy = wantTidy || narrow.matches;
    page.dataset.layout = tidy ? 'tidy' : 'messy';
    if (tidyBtn) tidyBtn.setAttribute('aria-pressed', tidy);
  }
  if (tidyBtn) tidyBtn.addEventListener('click', function () { wantTidy = !wantTidy; layout(); });
  narrow.addEventListener('change', layout);
  layout();

  // ---------- Shuffle: new spots, trying to keep overlaps small ----------

  function shuffle() {
    wantTidy = false;
    layout();
    var dw = desk.clientWidth, dh = desk.clientHeight, placed = [];
    pieces.forEach(function (p) {
      var w = p.offsetWidth, h = p.offsetHeight, best = null;
      for (var i = 0; i < 30; i++) {
        var x = Math.random() * Math.max(0, dw - w), y = Math.random() * Math.max(0, dh - h), overlap = 0;
        placed.forEach(function (o) {
          var ox = Math.max(0, Math.min(x + w, o.x + o.w) - Math.max(x, o.x));
          var oy = Math.max(0, Math.min(y + h, o.y + o.h) - Math.max(y, o.y));
          overlap += ox * oy;
        });
        if (!best || overlap < best.overlap) best = { x: x, y: y, overlap: overlap };
      }
      placed.push({ x: best.x, y: best.y, w: w, h: h });
      p.style.setProperty('--x', (best.x / dw * 100).toFixed(2) + '%');
      p.style.setProperty('--y', (best.y / dh * 100).toFixed(2) + '%');
      p.style.setProperty('--r', (Math.random() * 14 - 7).toFixed(1) + 'deg');
    });
  }
  var shuffleBtn = page.querySelector('[data-action="shuffle"]');
  if (shuffleBtn) shuffleBtn.addEventListener('click', shuffle);

  // ---------- Drag ----------

  pieces.forEach(function (p) {
    var start = null;

    p.addEventListener('pointerdown', function (e) {
      if (page.dataset.layout !== 'messy' || e.button !== 0) return;
      p.style.setProperty('--z', ++topZ);
      start = { x: e.clientX, y: e.clientY, left: p.offsetLeft, top: p.offsetTop, moved: false };
      p.setPointerCapture(e.pointerId);
    });

    p.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      start.moved = true;
      p.classList.add('is-dragging');
      var dw = desk.clientWidth, dh = desk.clientHeight;
      var x = Math.min(Math.max(start.left + dx, 0), dw - p.offsetWidth);
      var y = Math.min(Math.max(start.top + dy, 0), dh - p.offsetHeight);
      p.style.setProperty('--x', (x / dw * 100) + '%');
      p.style.setProperty('--y', (y / dh * 100) + '%');
    });

    function end() {
      if (!start) return;
      if (start.moved) p.dataset.dragged = '1';   // the click that follows a drag shouldn't open the note
      p.classList.remove('is-dragging');
      start = null;
    }
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
  });

  // ---------- Sticker filter ----------

  var stickers = page.querySelectorAll('.sticker');
  stickers.forEach(function (s) {
    s.addEventListener('click', function () {
      var f = s.dataset.filter;
      stickers.forEach(function (o) { o.setAttribute('aria-pressed', o === s); });
      desk.classList.toggle('is-filtering', f !== 'all');
      pieces.forEach(function (p) {
        var hit = f !== 'all' && p.dataset.type === f;
        p.classList.toggle('is-picked', hit);
        if (hit) p.style.setProperty('--z', ++topZ);
      });
    });
  });

  // ---------- Note card ----------

  var notes = document.getElementById('notes');
  if (!notes || !window.HTMLDialogElement) return;

  var dialog = document.createElement('dialog');
  dialog.className = 'note-card';
  document.body.appendChild(dialog);

  function cursor() { return document.querySelector('.cursor'); }

  function open(piece) {
    var key = piece.querySelector('.piece__card').dataset.note;
    var src = notes.content.querySelector('[data-note="' + key + '"]');
    if (!src) return;
    dialog.innerHTML =
      '<button type="button" class="note-card__close" aria-label="Close note">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
      '</button>';
    var media = piece.querySelector('.piece__media').cloneNode(true);
    dialog.appendChild(media);
    var vid = media.querySelector('video');
    if (vid) { vid.muted = true; vid.play().catch(function () {}); }   // videos loop in the note
    var type = document.createElement('p');
    type.className = 'note-card__type';
    type.textContent = src.dataset.typeLabel || '';
    dialog.appendChild(type);
    Array.prototype.forEach.call(src.children, function (c) { dialog.appendChild(c.cloneNode(true)); });
    if (src.dataset.link) {
      var a = document.createElement('a');
      a.className = 'pill-button';
      a.href = src.dataset.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<span class="pill-button__label">TRY IT</span><span class="pill-button__arrow" aria-hidden="true"><span class="icon icon--arrow"></span></span>';
      dialog.appendChild(a);
    }
    dialog.setAttribute('aria-label', src.querySelector('h2').textContent);
    dialog.querySelector('.note-card__close').addEventListener('click', function () { dialog.close(); });
    var c = cursor();
    if (c) dialog.appendChild(c);          // keep the custom cursor visible above the dialog
    document.documentElement.classList.add('has-lightbox');
    dialog.showModal();
  }

  dialog.addEventListener('click', function (e) {
    // Clicks on the dimmed area outside the card land on the dialog itself.
    var r = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
  });
  dialog.addEventListener('close', function () {
    var c = cursor();
    if (c) document.body.appendChild(c);
    document.documentElement.classList.remove('has-lightbox');
  });

  pieces.forEach(function (p) {
    p.querySelector('.piece__card').addEventListener('click', function () {
      if (p.dataset.dragged) { delete p.dataset.dragged; return; }
      open(p);
    });
  });
})();
