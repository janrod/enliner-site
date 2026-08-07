/* ============================================================================
   Enliner — enliner.jp
   Progressive enhancement only: the page is fully readable with JS disabled.
   - parallax background layers (rAF-throttled)
   - reveal-on-scroll (IntersectionObserver)
   - nav border on scroll
   - early-access form (fetch → inline status; graceful native fallback)
   ============================================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Parallax background ─────────────────────────────────────────────── */
  var layers = Array.prototype.slice.call(document.querySelectorAll('.bg-layer'));
  var ticking = false;

  function applyParallax() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    for (var i = 0; i < layers.length; i++) {
      var depth = parseFloat(layers[i].getAttribute('data-depth')) || 0.15;
      layers[i].style.transform = 'translate3d(0,' + (y * depth).toFixed(2) + 'px,0)';
    }
    ticking = false;
  }
  function onScrollParallax() {
    if (!ticking) { window.requestAnimationFrame(applyParallax); ticking = true; }
  }
  if (!reduceMotion && layers.length) {
    window.addEventListener('scroll', onScrollParallax, { passive: true });
    applyParallax();
  }

  /* ── Nav border on scroll ────────────────────────────────────────────── */
  var nav = document.querySelector('.nav');
  function onScrollNav() {
    if (!nav) return;
    var scrolled = (window.pageYOffset || document.documentElement.scrollTop) > 8;
    nav.classList.toggle('scrolled', scrolled);
  }
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ── Reveal on scroll ────────────────────────────────────────────────── */
  function revealAll() {
    var els = document.querySelectorAll('.reveal');
    for (var i = 0; i < els.length; i++) els[i].classList.add('in');
  }
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

  /* Re-observe any reveal elements added later (e.g. injected essay). */
  window.__enlinerObserveReveals = function () {
    var els = document.querySelectorAll('.reveal:not(.in)');
    if (reduceMotion || !('IntersectionObserver' in window)) { revealAll(); return; }
    els.forEach(function (el) { io.observe(el); });
  };

  /* ── Early-access form ───────────────────────────────────────────────── */
  var form = document.getElementById('access-form');
  if (form) {
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button');
    var endpoint = form.getAttribute('data-endpoint') || form.action;
    var configured = endpoint && endpoint.indexOf('REPLACE_WITH_FORM_ID') === -1;

    form.addEventListener('submit', function (ev) {
      // If the endpoint isn't configured yet, let the browser POST normally
      // (Formspree shows its own confirmation) rather than silently failing.
      if (!configured || !window.fetch) return;

      ev.preventDefault();
      var email = form.querySelector('input[name="email"]').value.trim();
      if (!email) return;

      button.disabled = true;
      setStatus('', '');

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      }).then(function (res) {
        if (res.ok) {
          form.reset();
          setStatus("You're on the list. Talk soon.", 'ok');
        } else {
          setStatus('Something went wrong — try again, or email hello@enliner.jp.', 'err');
        }
      }).catch(function () {
        setStatus('Network hiccup — try again, or email hello@enliner.jp.', 'err');
      }).finally(function () {
        button.disabled = false;
      });
    });

    function setStatus(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.className = 'form-status' + (kind ? ' ' + kind : '');
    }
  }
})();
