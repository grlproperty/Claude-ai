/**
 * The paste box on the ingredient decoder.
 *
 * An INCI list is unreadable by design — the names are Latin or chemical, the
 * order is regulated but uninformative, and nobody reads one entry at a time
 * standing in a shop. So this takes the whole list at once and says which
 * substances in it this file holds.
 *
 * The index is read out of the page rather than shipped again: every entry is
 * already in the HTML with its name, origin, aliases and description, so there
 * is no second copy of the file to drift. The box itself starts hidden and is
 * revealed here, which means a reader without JavaScript gets the full list
 * below and never sees a control that would not work.
 */
(function () {
  'use strict';

  var SAMPLE =
    'Aqua, Glycerin, Cera Alba, Cetearyl Alcohol, Lanolin, Carmine, ' +
    'Squalane, Tocopherol, Parfum, Hyaluronic Acid, Guanine, Stearic Acid';

  // "Aqua (Water)" and "CI 75470." are the same token as far as matching goes.
  function normalise(s) {
    return s
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function build() {
    var list = document.querySelector('[data-filter-list]');
    if (!list) return null;
    var index = {};
    var entries = Array.prototype.slice.call(list.children);

    entries.forEach(function (el) {
      var nameEl = el.querySelector('.entry__name');
      if (!nameEl) return;
      var record = {
        name: nameEl.textContent.trim(),
        href: nameEl.querySelector('a') ? nameEl.querySelector('a').getAttribute('href') : '',
        origin: el.querySelector('.tag') ? el.querySelector('.tag').textContent.trim() : '',
        what: el.querySelector('.entry__runby') ? el.querySelector('.entry__runby').textContent.trim() : '',
      };

      var keys = [record.name];
      var also = el.querySelector('.src-note');
      if (also) {
        // "Also listed as — CI 75470 · Cochineal Extract"
        var tail = also.textContent.split('—')[1];
        if (tail) {
          tail.split('·').forEach(function (a) {
            keys.push(a.trim());
          });
        }
      }

      keys.forEach(function (k) {
        var n = normalise(k);
        if (n && !index[n]) index[n] = record;
      });
    });

    return index;
  }

  function render(out, found, unknown) {
    var html = '';

    if (found.length) {
      var animals = found.filter(function (r) {
        return r.origin === 'Animal';
      }).length;

      html +=
        '<p class="inci-tally">' +
        found.length +
        (found.length === 1 ? ' substance' : ' substances') +
        ' recognised' +
        (animals ? ' · ' + animals + ' animal-derived' : '') +
        '</p>';

      found.forEach(function (r) {
        html +=
          '<div class="inci-result">' +
          '<span class="inci-origin' +
          (r.origin === 'Animal' ? ' inci-origin--animal' : '') +
          '">' +
          r.origin +
          '</span>' +
          '<span class="inci-result__name">' +
          (r.href ? '<a href="' + r.href + '">' + r.name + '</a>' : r.name) +
          '</span>' +
          '<span class="inci-result__what">' +
          r.what +
          '</span>' +
          '</div>';
      });
    }

    if (unknown.length) {
      html +=
        '<p class="inci-tally">Not in this file — ' +
        unknown.length +
        '</p><p class="inci-result__what">' +
        unknown.join(', ') +
        '</p>';
    }

    if (!found.length && !unknown.length) {
      html = '<p class="inci-tally">Nothing to read in that.</p>';
    } else {
      // The honest caveat belongs with the answer, not at the foot of the page.
      html +=
        '<p class="inci-result__what" style="margin-top:1.1rem;">An absence here is a gap in this file, ' +
        'not a clean bill of health.</p>';
    }

    out.innerHTML = html;
    out.hidden = false;
  }

  function init() {
    var box = document.querySelector('[data-inci]');
    if (!box) return;

    var index = build();
    if (!index) return;

    var input = box.querySelector('[data-inci-input]');
    var out = box.querySelector('[data-inci-out]');
    if (!input || !out) return;

    box.hidden = false; // only now is the control real

    function run() {
      var raw = input.value.split(/[,;\n\r•]+/);
      var found = [];
      var unknown = [];
      var seen = {};

      raw.forEach(function (part) {
        var n = normalise(part);
        if (!n) return;
        if (index[n]) {
          // key on the substance, not the word used for it: an alias and the
          // common name are the same entry and must not both be listed
          var key = index[n].name;
          if (!seen[key]) {
            seen[key] = true;
            found.push(index[n]);
          }
        } else {
          unknown.push(part.trim());
        }
      });

      render(out, found, unknown);
    }

    box.querySelector('[data-inci-run]').addEventListener('click', run);

    box.querySelector('[data-inci-sample]').addEventListener('click', function () {
      input.value = SAMPLE;
      run();
    });

    box.querySelector('[data-inci-clear]').addEventListener('click', function () {
      input.value = '';
      out.hidden = true;
      input.focus();
    });

    input.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // The single-file build swaps page content without reloading.
  window.FF = window.FF || {};
  window.FF.initInci = init;
})();
