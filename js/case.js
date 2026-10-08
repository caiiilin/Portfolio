/* Case study page: full / condensed switch, version tabs, annotation pins. */
(function () {
  var article = document.querySelector('.case[data-case-view]');
  if (!article) return;

  // ---------- Full / condensed ----------

  var STORE = 'caseView';
  var viewButtons = article.querySelectorAll('.case-view__switch [data-view]');

  function setView(view, save) {
    article.dataset.caseView = view;
    viewButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.view === view);
    });
    if (save) { try { localStorage.setItem(STORE, view); } catch (e) {} }
  }

  var saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  if (saved === 'full' || saved === 'condensed') setView(saved, false);

  viewButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { setView(btn.dataset.view, true); });
  });

  // ---------- Version tabs ----------

  var tabs = Array.prototype.slice.call(article.querySelectorAll('.versions__tabs [role="tab"]'));

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  // ---------- Annotations: pin on the screen <-> note in the list ----------

  article.querySelectorAll('.annotated').forEach(function (block) {
    var pins = block.querySelectorAll('.pin');
    var notes = block.querySelectorAll('.note');

    function activate(id) {
      pins.forEach(function (pin) { pin.setAttribute('aria-pressed', pin.dataset.note === id); });
      notes.forEach(function (note) { note.classList.toggle('is-active', note.dataset.note === id); });
    }

    pins.forEach(function (pin) {
      pin.setAttribute('aria-pressed', 'false');
      pin.addEventListener('click', function () { activate(pin.dataset.note); });
    });
    notes.forEach(function (note) {
      note.querySelector('.note__btn').addEventListener('click', function () { activate(note.dataset.note); });
    });

    if (pins.length) activate(pins[0].dataset.note);
  });
})();
