/**
 * Progressive enhancement only. Every page renders complete without this file:
 * navigation is a plain list, the table of contents is anchor links, cards are
 * flat, and revealed sections are simply visible.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- masthead ----------------------------------------------------------
  var masthead = document.querySelector('.masthead');
  if (masthead) {
    var setScrolled = function () {
      masthead.setAttribute('data-scrolled', String(window.scrollY > 24));
    };
    setScrolled();
    window.addEventListener('scroll', setScrolled, { passive: true });
  }

  // ---- mobile navigation -------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.textContent = open ? 'Menu' : 'Close';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
        nav.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Menu';
        toggle.focus();
      }
    });
  }

  // ---- pointer tilt ------------------------------------------------------
  // Cards rotate a few degrees toward the pointer. Capped low deliberately:
  // this is an editorial platform, and a card that swings is a toy.
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var MAX = 5;
    Array.prototype.forEach.call(document.querySelectorAll('.tilt'), function (el) {
      el.addEventListener(
        'pointermove',
        function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty('--ry', (px * MAX).toFixed(2) + 'deg');
          el.style.setProperty('--rx', (-py * MAX).toFixed(2) + 'deg');
          el.style.setProperty('--tz', '6px');
          el.setAttribute('data-active', 'true');
        },
        { passive: true }
      );

      var reset = function () {
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--tz', '0px');
        el.removeAttribute('data-active');
      };
      el.addEventListener('pointerleave', reset);
      el.addEventListener('blur', reset, true);
    });
  }

  // ---- scroll reveal -----------------------------------------------------
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(reveals, function (el) {
        el.setAttribute('data-shown', 'true');
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.setAttribute('data-shown', 'true');
            io.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
      );
      Array.prototype.forEach.call(reveals, function (el) {
        io.observe(el);
      });
    }
  }

  // ---- subscribe form ----------------------------------------------------
  // Posts in the background so the reader stays on the page. Without this the
  // browser still submits natively to the provider, which is why the form is
  // marked up as a working form first and enhanced second.
  var subscribeForms = document.querySelectorAll('form[data-subscribe]');

  Array.prototype.forEach.call(subscribeForms, function (form) {
    var status = form.querySelector('.form__status');
    var button = form.querySelector('button[type="submit"]');
    if (!status || !window.fetch || !window.FormData) return;

    var say = function (message, ok) {
      status.textContent = message;
      status.setAttribute('data-state', ok ? 'ok' : 'error');
      status.hidden = false;
    };

    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) return;
      e.preventDefault();

      button.disabled = true;
      status.hidden = true;

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          say('Thank you — you are on the list.', true);
        })
        .catch(function () {
          // Never claim a subscription that did not happen: send them to a
          // route that reaches a person instead.
          say('That did not go through. Email info@feral-femme.co and we will add you.', false);
        })
        .then(function () {
          button.disabled = false;
        });
    });
  });

  // ---- table of contents -------------------------------------------------
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));

  if (tocLinks.length && 'IntersectionObserver' in window) {
    var targets = tocLinks
      .map(function (link) {
        return document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));
      })
      .filter(Boolean);

    var byId = {};
    tocLinks.forEach(function (link) {
      byId[decodeURIComponent(link.getAttribute('href').slice(1))] = link;
    });

    var visible = new Set();

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });

        // The topmost heading in view wins, so the marker tracks reading
        // position rather than whichever section fired last.
        var current = null;
        for (var i = 0; i < targets.length; i += 1) {
          if (visible.has(targets[i].id)) {
            current = targets[i].id;
            break;
          }
        }

        tocLinks.forEach(function (link) {
          link.removeAttribute('aria-current');
        });
        if (current && byId[current]) byId[current].setAttribute('aria-current', 'true');
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 }
    );

    targets.forEach(function (t) {
      observer.observe(t);
    });
  }
})();
