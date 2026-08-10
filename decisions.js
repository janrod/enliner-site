/* ============================================================================
   Enliner — decisions overlay
   Fetches decisions.md, renders a readable subset of Markdown, and builds a
   heading-based table of contents with a live filter. No dependencies.
   Progressive enhancement: the trigger is a normal link to decisions.md, so
   with JS off it just downloads the file.
   ============================================================================ */
(function () {
  'use strict';

  var overlay = document.getElementById('decisions');
  if (!overlay) return;

  var tocEl     = overlay.querySelector('.dz-toc-list');
  var bodyEl    = overlay.querySelector('.dz-body');
  var filterEl  = overlay.querySelector('.dz-filter');
  var closeEls  = overlay.querySelectorAll('[data-dz-close]');
  var openEls   = document.querySelectorAll('[data-dz-open]');
  var scrollEl  = overlay.querySelector('.dz-content');
  var loaded    = false;
  var lastFocus = null;

  /* ── tiny Markdown renderer (heading / list / code / quote / hr / inline) ── */
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    // order matters: escape first, then re-introduce safe inline tags
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      var safe = /^(https?:|mailto:|#|\/)/.test(u) ? u : '#';
      return '<a href="' + safe + '" rel="noopener">' + t + '</a>';
    });
    return s;
  }

  function render(md, headings) {
    var lines = md.split('\n');
    var out = [], i = 0, hid = 0;

    function flushList(buf, ordered) {
      if (!buf.length) return;
      out.push('<' + (ordered ? 'ol' : 'ul') + '>');
      buf.forEach(function (item) { out.push('<li>' + inline(item) + '</li>'); });
      out.push('</' + (ordered ? 'ol' : 'ul') + '>');
    }

    while (i < lines.length) {
      var line = lines[i];

      // Any line starting with ``` is consumed here, so it can never stall the
      // loop. It becomes a code block only when it is a valid opener (bare ``` or
      // ```lang, no spaces) AND a closing fence exists; otherwise it is plain text
      // (e.g. prose that merely starts with ``` — which would otherwise swallow
      // the rest of the document or hang the parser).
      if (/^```/.test(line)) {
        if (/^```[^\s`]*\s*$/.test(line)) {
          var j = i + 1;
          while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
          if (j < lines.length) {
            out.push('<pre><code>' + esc(lines.slice(i + 1, j).join('\n')) + '</code></pre>');
            i = j + 1;
            continue;
          }
        }
        out.push('<p>' + inline(line) + '</p>');
        i++;
        continue;
      }

      // heading
      var h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        var level = h[1].length;
        var id = 'dz-h-' + (hid++);
        out.push('<h' + level + ' id="' + id + '">' + inline(h[2]) + '</h' + level + '>');
        if (level === 2 || level === 3) {
          headings.push({ id: id, text: h[2].replace(/[*`]/g, ''), level: level });
        }
        i++;
        continue;
      }

      // horizontal rule
      if (/^(---|\*\*\*|___)\s*$/.test(line)) { out.push('<hr />'); i++; continue; }

      // blockquote (collapse consecutive)
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + inline(q.join(' ')) + '</blockquote>');
        continue;
      }

      // unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++;
        }
        flushList(ul, false);
        continue;
      }

      // ordered list
      if (/^\s*\d+[.)]\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          ol.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++;
        }
        flushList(ol, true);
        continue;
      }

      // blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // paragraph (gather until blank / block start)
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|```|(---|\*\*\*|___)\s*$)/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return out.join('\n');
  }

  function buildToc(headings) {
    tocEl.innerHTML = headings.map(function (h) {
      return '<li class="dz-toc-item dz-l' + h.level + '" data-target="' + h.id + '">' +
             esc(h.text) + '</li>';
    }).join('');
  }

  function load() {
    if (loaded) return;
    loaded = true;
    bodyEl.innerHTML = '<p class="dz-note">Loading the decision log…</p>';
    fetch('decisions.md').then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (md) {
      var headings = [];
      bodyEl.innerHTML = render(md, headings);
      buildToc(headings);
      var countEl = overlay.querySelector('.dz-count');
      if (countEl) {
        var entries = headings.filter(function (h) { return h.level === 2; }).length;
        countEl.textContent = entries + ' entries';
      }
    }).catch(function () {
      bodyEl.innerHTML = '<p class="dz-note">Could not load the decision log. ' +
        'You can read it directly at <a href="decisions.md">decisions.md</a>.</p>';
    });
  }

  /* ── open / close ── */
  function open(ev) {
    if (ev) ev.preventDefault();
    lastFocus = document.activeElement;
    load();
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      overlay.classList.add('open');
      if (filterEl) filterEl.focus();
    });
  }
  function close() {
    overlay.classList.remove('open');
    document.documentElement.style.overflow = '';
    var done = function () {
      overlay.hidden = true;
      overlay.removeEventListener('transitionend', done);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    overlay.addEventListener('transitionend', done);
  }

  openEls.forEach(function (el) { el.addEventListener('click', open); });
  closeEls.forEach(function (el) { el.addEventListener('click', close); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  /* ── TOC navigation ── */
  tocEl.addEventListener('click', function (e) {
    var item = e.target.closest('.dz-toc-item');
    if (!item) return;
    var target = document.getElementById(item.dataset.target);
    if (target && scrollEl) {
      scrollEl.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
    }
  });

  /* ── filter ── */
  if (filterEl) {
    filterEl.addEventListener('input', function () {
      var q = filterEl.value.trim().toLowerCase();
      tocEl.querySelectorAll('.dz-toc-item').forEach(function (item) {
        item.style.display = (!q || item.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
      });
    });
  }
})();
