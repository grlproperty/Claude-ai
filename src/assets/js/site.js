/**
 * Progressive enhancement only. Every page renders complete without this file:
 * navigation is a plain list, the table of contents is anchor links, cards are
 * flat, and revealed sections are simply visible.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Everything below divides in two. The global half binds to the window and
  // the shell, and runs once. The content half attaches to markup inside
  // <main>, and has to be able to run again whenever that markup is replaced —
  // which is what the single-file build of this site does when it navigates.
  // Keeping the split explicit is what stops a second run from binding a
  // second copy of every window listener.

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

  // ---- reading progress --------------------------------------------------
  // How far through the page you are, on the rule the masthead already sits
  // on. No new furniture: the line is there either way, this only fills it.
  var progress = document.querySelector('[data-progress]');
  if (progress && !reduced) {
    var ticking = false;
    var setProgress = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, (window.scrollY || 0) / max)) : 0;
      progress.style.transform = 'scaleX(' + pct.toFixed(4) + ')';
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(setProgress);
      },
      { passive: true }
    );
    window.addEventListener('resize', setProgress, { passive: true });
    // Lazy images land after the first measurement and make the page taller,
    // which strands the bar short of full at the bottom. Remeasure when the
    // document actually changes size rather than only when it is scrolled.
    if ('ResizeObserver' in window) new ResizeObserver(setProgress).observe(document.body);
    window.addEventListener('load', setProgress);
    setProgress();
  }

  // ---- hero parallax -----------------------------------------------------
  // The plate holds back very slightly against the scroll, which separates it
  // from the type in front of it. Small on purpose: enough to feel, not enough
  // to notice, and it stops entirely once the hero is off screen.
  // The plate is looked up on every frame rather than captured once: in the
  // single-file build the hero is replaced whenever the reader navigates home,
  // and a held reference would keep moving an element no longer in the page.
  if (!reduced && window.matchMedia('(min-width: 68rem)').matches) {
    var plateTicking = false;
    var setParallax = function () {
      plateTicking = false;
      var plate = document.querySelector('.hero__plate');
      if (!plate) return;
      var hero = plate.closest('.hero');
      var y = window.scrollY || 0;
      var limit = hero ? hero.offsetHeight : 800;
      if (y < limit) plate.style.transform = 'translate3d(0,' + (y * 0.075).toFixed(2) + 'px,0)';
    };
    window.addEventListener(
      'scroll',
      function () {
        if (plateTicking) return;
        plateTicking = true;
        requestAnimationFrame(setParallax);
      },
      { passive: true }
    );
    setParallax();
  }


  // ------------------------------------------------ content-scoped
  // Re-runnable. Called once now, and again by the router in the
  // single-file build after it swaps the contents of <main>.
  function initContent() {
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

  // ---- reveal stagger ----------------------------------------------------
  // A row of cards that all arrive on the same frame reads as one block
  // sliding, which is the thing that makes a reveal look automated. Offsetting
  // siblings by a few tens of milliseconds reads as them settling instead.
  // Capped: past the fifth the delay is longer than anyone will wait for.
  if (!reduced) {
    // The count is parked on the parent node itself. An object keyed by the
    // node would stringify every parent to "[object HTMLDivElement]" and share
    // one counter across the whole page, so the first card in the second group
    // starts already delayed.
    var counted = [];
    Array.prototype.forEach.call(reveals, function (el) {
      var parent = el.parentNode;
      if (!parent) return;
      if (parent.revealIndex == null) {
        parent.revealIndex = 0;
        counted.push(parent);
      }
      el.style.transitionDelay = Math.min(parent.revealIndex, 5) * 65 + 'ms';
      parent.revealIndex += 1;
    });
    counted.forEach(function (parent) {
      delete parent.revealIndex;
    });
  }

  // ---- subscribe form ----------------------------------------------------
  // Posts in the background so the reader stays on the page. Without this the
  // browser still submits natively to the provider, which is why the form is
  // marked up as a working form first and enhanced second.
  var subscribeForms = document.querySelectorAll('form[data-subscribe]');

  // Providers nest validation messages differently; take the first string.
  var firstError = function (data) {
    var found = '';
    var walk = function (node) {
      if (found || node == null) return;
      if (typeof node === 'string') found = node;
      else if (typeof node === 'object') for (var k in node) walk(node[k]);
    };
    walk(data.errors || data.error || data.message);
    return found;
  };

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

      // Only a bot fills a field no human can see. Report success and post
      // nothing: a bot told it failed simply tries again.
      var trap = form.querySelector('input[name="_gotcha"]');
      if (trap && trap.value) {
        form.reset();
        say('Thank you — you are on the list.', true);
        return;
      }

      button.disabled = true;
      status.hidden = true;

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          // A 2xx is not agreement. MailerLite answers a rejected address with
          // HTTP 200 and {"success":false}, so trusting the status alone tells
          // a reader they subscribed when they did not.
          return res.text().then(function (body) {
            var data = null;
            try {
              data = JSON.parse(body);
            } catch (err) {
              data = null;
            }
            if (!res.ok) throw new Error(String(res.status));
            if (data && data.success === false) throw new Error(firstError(data) || 'rejected');
            form.reset();
            say(status.getAttribute('data-confirm') || 'Thank you — you are on the list.', true);
          });
        })
        .catch(function (err) {
          // Never claim a subscription that did not happen. Where the provider
          // said what was wrong with the address, that is more use than a
          // generic apology; otherwise send them to a route that reaches a
          // person.
          var reason = String((err && err.message) || '');
          say(
            reason && reason !== 'rejected' && !/^\d+$/.test(reason)
              ? reason
              : 'That did not go through. Email info@feral-femme.co and we will add you.',
            false
          );
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
  }

  initContent();
  window.FF = window.FF || {};
  window.FF.initContent = initContent;
})();
