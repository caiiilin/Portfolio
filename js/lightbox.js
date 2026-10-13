/* Lightbox: click any [data-zoom] image (or a video's enlarge button) to view it
   larger over a darkened page. Close with the X, a click on the dark
   background, or Escape. */
(function () {
  var items = document.querySelectorAll('img[data-zoom], video[data-zoom]');
  if (!items.length || !window.HTMLDialogElement) return;

  var dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Enlarged view');
  dialog.innerHTML =
    '<button type="button" class="lightbox__close" aria-label="Close enlarged view">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
    '</button>' +
    '<div class="lightbox__stage"></div>';
  document.body.appendChild(dialog);

  var stage = dialog.querySelector('.lightbox__stage');
  var source = null;   // the on-page video, so playback can carry over and back
  var clone = null;

  function cursor() { return document.querySelector('.cursor'); }

  function open(el) {
    stage.textContent = '';
    if (el.tagName === 'VIDEO') {
      source = el;
      clone = document.createElement('video');
      clone.src = el.currentSrc || el.src;
      clone.controls = true;
      clone.playsInline = true;
      clone.setAttribute('aria-label', el.getAttribute('aria-label') || '');
      clone.currentTime = el.currentTime;
      var wasPlaying = !el.paused;
      el.pause();
      if (wasPlaying || el.currentTime === 0) clone.play().catch(function () {});
    } else {
      clone = document.createElement('img');
      clone.src = el.currentSrc || el.src;
      clone.alt = el.alt;
    }
    clone.className = 'lightbox__media';
    stage.appendChild(clone);

    // The custom cursor lives under the page; bring it into the dialog's top layer.
    var c = cursor();
    if (c) { c.classList.remove('is-target'); dialog.appendChild(c); }

    document.documentElement.classList.add('has-lightbox');
    dialog.showModal();
  }

  function close() { if (dialog.open) dialog.close(); }

  dialog.addEventListener('close', function () {
    if (source && clone) {
      source.currentTime = clone.currentTime;
      clone.pause();
    }
    source = clone = null;
    stage.textContent = '';
    var c = cursor();
    if (c) document.body.appendChild(c);
    document.documentElement.classList.remove('has-lightbox');
  });

  dialog.querySelector('.lightbox__close').addEventListener('click', close);
  // Anywhere outside the media itself counts as the background.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog || e.target === stage) close();
  });

  function hoverRing(el) {
    el.addEventListener('mouseenter', function () { var c = cursor(); if (c) c.classList.add('is-target'); });
    el.addEventListener('mouseleave', function () { var c = cursor(); if (c) c.classList.remove('is-target'); });
  }

  items.forEach(function (el) {
    var trigger = document.createElement('button');
    trigger.type = 'button';

    if (el.tagName === 'VIDEO') {
      // Clicking a video plays it, so videos get a separate enlarge button.
      trigger.className = 'zoom-button';
      trigger.setAttribute('aria-label', 'Enlarge video');
      trigger.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
      el.parentNode.appendChild(trigger);
      trigger.addEventListener('click', function () { open(el); });
    } else {
      // Wrap the image in a button so it works from the keyboard too.
      trigger.className = 'zoom-trigger';
      trigger.setAttribute('aria-label', 'Enlarge image: ' + el.alt);
      if (el.classList.contains('case-grid__full')) {
        el.classList.remove('case-grid__full');
        trigger.classList.add('case-grid__full');
      }
      el.parentNode.insertBefore(trigger, el);
      trigger.appendChild(el);
      trigger.addEventListener('click', function () { open(el); });
    }
    hoverRing(trigger);
  });
})();
