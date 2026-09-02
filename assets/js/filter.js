/**
 * Client-side search and filtering for the archive, tracker, and glossary.
 *
 * Operates on markup that is already complete in the HTML: every item is
 * present and readable with JavaScript disabled, and this only hides items that
 * do not match. Nothing is fetched and nothing is rendered here.
 */
(function () {
  'use strict';

  var list = document.querySelector('[data-filter-list]');
  if (!list) return;

  var items = Array.prototype.slice.call(list.children);
  var input = document.querySelector('[data-search]');
  var count = document.querySelector('[data-search-count]');
  var empty = document.querySelector('[data-empty]');
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-filter-group]'));

  // One active value per filter dimension; 'all' means unfiltered.
  var active = { status: 'all', topic: 'all', category: 'all', region: 'all' };
  var query = '';

  function matches(item) {
    if (query) {
      var haystack = item.getAttribute('data-text') || item.textContent.toLowerCase();
      var terms = query.split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i += 1) {
        if (haystack.indexOf(terms[i]) === -1) return false;
      }
    }

    // Attributes hold a space-separated token list: a field note can sit under
    // several topics, and a library entry under several tags, so an exact
    // string comparison would drop every multi-tag item from every filter.
    for (var key in active) {
      if (active[key] === 'all') continue;
      var raw = item.getAttribute('data-' + key);
      if (!raw) return false;
      if (raw.split(/\s+/).indexOf(active[key]) === -1) return false;
    }

    return true;
  }

  function apply() {
    var shown = 0;
    items.forEach(function (item) {
      var ok = matches(item);
      item.hidden = !ok;
      if (ok) shown += 1;
    });

    if (empty) empty.hidden = shown !== 0;

    if (count) {
      var filtering = query || Object.keys(active).some(function (k) {
        return active[k] !== 'all';
      });
      count.hidden = !filtering;
      count.textContent = shown + (shown === 1 ? ' result' : ' results');
    }
  }

  if (input) {
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        query = input.value.trim().toLowerCase();
        apply();
      }, 120);
    });
  }

  groups.forEach(function (group) {
    var dimension = group.getAttribute('data-filter-group');
    var chips = Array.prototype.slice.call(group.querySelectorAll('button[data-filter], button[data-filter-region]'));

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var isRegion = chip.hasAttribute('data-filter-region');
        var key = isRegion ? 'region' : dimension;
        var value = isRegion ? chip.getAttribute('data-filter-region') : chip.getAttribute('data-filter');

        // Clicking the active chip clears that dimension rather than doing nothing.
        active[key] = active[key] === value ? 'all' : value;

        chips.forEach(function (other) {
          var otherIsRegion = other.hasAttribute('data-filter-region');
          var otherKey = otherIsRegion ? 'region' : dimension;
          var otherValue = otherIsRegion
            ? other.getAttribute('data-filter-region')
            : other.getAttribute('data-filter');

          var on =
            otherValue === active[otherKey] ||
            (otherValue === 'all' && active[otherKey] === 'all' && !otherIsRegion);
          other.setAttribute('aria-pressed', String(on));
        });

        apply();
      });
    });
  });

  // A ?q= parameter deep-links a search, so a filtered view can be shared.
  var initial = new URLSearchParams(window.location.search).get('q');
  if (initial && input) {
    input.value = initial;
    query = initial.trim().toLowerCase();
    apply();
  }
})();
