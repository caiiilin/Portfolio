/* Contact page: copy the email address, and turn the postcard note into an email
   draft in the visitor's own mail app (no form service needed). */
(function () {
  // ---------- Copy email ----------

  document.querySelectorAll('.copy-button').forEach(function (btn) {
    var label = btn.querySelector('.copy-button__label');
    var timer = null;

    function done(text) {
      label.textContent = text;
      btn.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = 'copy'; btn.classList.remove('is-done'); }, 1800);
    }

    btn.addEventListener('click', function () {
      var value = btn.dataset.copy;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(function () { done('copied!'); }, function () { done('press ⌘C'); });
      } else {
        // Older browsers / plain http: select a hidden copy and use the legacy command.
        var field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(field);
        field.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        field.remove();
        done(ok ? 'copied!' : 'press ⌘C');
      }
    });
  });

  // ---------- Postcard → email draft ----------

  var form = document.getElementById('note-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = form.elements.message.value.trim();
    var name = form.elements.name.value.trim();
    var subject = name ? 'Hello from ' + name : 'Hello from your portfolio';
    var body = message + (name ? '\n\n— ' + name : '');
    window.location.href = 'mailto:cailinmkuhn@gmail.com?subject=' + encodeURIComponent(subject) +
      (body.trim() ? '&body=' + encodeURIComponent(body) : '');
    form.classList.remove('is-sent');
    void form.offsetWidth;                 // restart the little "sent" animation
    form.classList.add('is-sent');
  });
})();
