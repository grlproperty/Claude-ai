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
  var mastheadRepaint = null;
  var masthead = document.querySelector('.masthead');
  if (masthead) {
    // The bar is opaque, so it has to answer for what it covers: a pink slab
    // laid across an ink section looks like a mistake. Read which band sits
    // under the bar's lower edge and let the bar take that band's colours.
    // Rects are read once per frame, never per scroll event.
    var queued = false;

    var paint = function () {
      queued = false;
      masthead.setAttribute('data-scrolled', String(window.scrollY > 24));

      var edge = masthead.getBoundingClientRect().bottom - 1;
      var dark = false;
      var bands = document.querySelectorAll('.on-dark, .colophon');
      for (var i = 0; i < bands.length; i++) {
        var r = bands[i].getBoundingClientRect();
        if (r.top <= edge && r.bottom >= edge) {
          dark = true;
          break;
        }
      }
      if (dark) masthead.setAttribute('data-over', 'dark');
      else masthead.removeAttribute('data-over');
    };

    var onScroll = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    // The single-file build swaps <main> under a masthead that survives, so the
    // bands the bar has to answer for change without a scroll happening.
    mastheadRepaint = paint;
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
  if (!reduced) {
    var plateTicking = false;
    var setParallax = function () {
      plateTicking = false;
      var plate = document.querySelector('.hero__plate');
      if (!plate) return;
      var hero = plate.closest('.hero');
      var y = window.scrollY || 0;
      var limit = hero ? hero.offsetHeight : 800;
      // Gentler on a narrow screen, where the plate has less room above it
      // before it meets what follows — but present, rather than absent.
      var rate = window.innerWidth >= 1088 ? 0.075 : 0.04;
      if (y < limit) plate.style.transform = 'translate3d(0,' + (y * rate).toFixed(2) + 'px,0)';
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
    if (mastheadRepaint) mastheadRepaint();
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

  // ---- touch press -------------------------------------------------------
  // The tilt above needs a pointer, so on a touch screen the cards had no
  // response at all. A press gives the same acknowledgement in the language
  // that device has, and it lifts on release rather than snapping.
  if (!reduced && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var press = function (el, on) {
      el.style.transition = 'transform .28s cubic-bezier(.2,.8,.3,1)';
      el.style.transform = on ? 'scale(.985)' : '';
    };
    Array.prototype.forEach.call(document.querySelectorAll('.tilt'), function (el) {
      el.addEventListener('touchstart', function () { press(el, true); }, { passive: true });
      ['touchend', 'touchcancel', 'touchmove'].forEach(function (ev) {
        el.addEventListener(ev, function () { press(el, false); }, { passive: true });
      });
    });
  }

  // ---- counting figures --------------------------------------------------
  // The stat band counts real things — notes written, entries filed — so the
  // figures run up to their value when they arrive. Read from the rendered
  // text, so nothing has to be duplicated into an attribute, and left exactly
  // as written if it is not a plain number.
  if (!reduced && 'IntersectionObserver' in window) {
    var figures = document.querySelectorAll('.stat__figure');
    if (figures.length) {
      var counter = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            counter.unobserve(entry.target);
            var el = entry.target;
            var target = parseInt(el.textContent, 10);
            if (!isFinite(target) || String(target) !== el.textContent.trim()) return;
            var started = null;
            var tick = function (now) {
              if (started === null) started = now;
              var k = Math.min(1, (now - started) / 900);
              el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
              if (k < 1) requestAnimationFrame(tick);
            };
            el.textContent = '0';
            requestAnimationFrame(tick);
          });
        },
        { threshold: 0.6 }
      );
      Array.prototype.forEach.call(figures, function (el) { counter.observe(el); });
    }
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

  // ---- currency -----------------------------------------------------------
  // Every price on the site is charged in US dollars, because that is what the
  // PayPal links are issued in. This converts the *displayed* figure so a
  // reader in Johannesburg or Berlin knows roughly what they are agreeing to
  // before they reach a checkout that will only speak dollars to them.
  //
  // Three things this deliberately does not do. It does not change what is
  // charged — it cannot, and the page says so. It does not hide the dollar
  // figure, which stays alongside, because the dollar figure is the only one
  // that is true at the till. And it does not silently use a stale rate: the
  // date the rates were published is on the page, so an old number is visible
  // rather than merely wrong.
  function initCurrency() {
    var root = document.querySelector('[data-currency]');
    if (!root) return;

    var data;
    try {
      data = JSON.parse(root.getAttribute('data-currency'));
    } catch (e) {
      return;
    }
    if (!data || !data.currencies) return;

    var select = root.querySelector('select');
    var stamp = root.querySelector('[data-currency-date]');
    if (!select) return;

    // Rebuilt on every call: in the single-file build initContent() runs again
    // after a page swap, against a select that is new each time.
    if (!select.options.length) {
      var usd = document.createElement('option');
      usd.value = 'USD';
      usd.textContent = 'US dollar — as charged';
      select.appendChild(usd);
      data.currencies.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.code;
        o.textContent = c.name + ' (' + c.code + ')';
        select.appendChild(o);
      });
    }

    function find(code) {
      for (var i = 0; i < data.currencies.length; i++) {
        if (data.currencies[i].code === code) return data.currencies[i];
      }
      return null;
    }

    // Round to something a person would say. Under ten, keep the cents;
    // above, drop them — nobody needs R2,325.41 to decide whether to buy.
    function show(c, usdValue) {
      var v = usdValue * c.rate;
      var decimals = v < 10 ? 2 : 0;
      return (
        c.symbol +
        v.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      );
    }

    // Both figures are rendered, but as two elements rather than one string.
    // A 2.8rem display face cannot fit "R1,604 · $100" inside a card sized for
    // "$100", and letting CSS place the dollar figure — under the converted one
    // on a tier card, in brackets after it in a button — is the only way the
    // same markup works in both.
    function apply(code) {
      var c = code === 'USD' ? null : find(code);
      Array.prototype.forEach.call(document.querySelectorAll('[data-usd]'), function (el) {
        var usdValue = parseFloat(el.getAttribute('data-usd'));
        if (isNaN(usdValue)) return;
        if (!el.hasAttribute('data-usd-text')) {
          el.setAttribute('data-usd-text', el.textContent.trim());
        }
        var original = el.getAttribute('data-usd-text');

        while (el.firstChild) el.removeChild(el.firstChild);
        if (!c) {
          el.appendChild(document.createTextNode(original));
          el.removeAttribute('data-converted');
          return;
        }
        el.appendChild(document.createTextNode(show(c, usdValue)));
        var sub = document.createElement('span');
        sub.className = 'conv-usd';
        sub.textContent = original;
        el.appendChild(sub);
        el.setAttribute('data-converted', '');
      });
      root.setAttribute('data-currency-active', code);
      try {
        localStorage.setItem('ff-currency', code);
      } catch (e) {}
    }

    var saved = 'USD';
    try {
      saved = localStorage.getItem('ff-currency') || 'USD';
    } catch (e) {}
    if (saved !== 'USD' && !find(saved)) saved = 'USD';

    select.value = saved;
    apply(saved);
    if (stamp && data.date) stamp.textContent = data.date;

    select.addEventListener('change', function () {
      apply(select.value);
    });

    // No live refresh, deliberately. Fetching today's rate from an exchange
    // API would disclose every visitor's IP address to that provider on every
    // page view, and /privacy/ promises that every asset on every page is
    // served from this domain. An indicative conversion does not need to be
    // today's rate to do its job, so the rates baked in at build time are what
    // renders — `npm run rates` refreshes them, and `npm run check` warns once
    // they are more than thirty days old.
  }

  initContent();
  initCurrency();
  window.FF = window.FF || {};
  window.FF.initContent = initContent;
  window.FF.initCurrency = initCurrency;
})();
