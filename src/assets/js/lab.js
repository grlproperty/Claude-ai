/**
 * The tools a reader puts their own shopping through.
 *
 * The decoders are files to look things up in. These start from the other end:
 * from the label in somebody's hand, the copy on somebody's product page, the
 * claim somebody does not believe. Four instruments share one engine:
 *
 *   [data-lab]   the label scanner (mode "reader") and the claim checker
 *                (mode "brand") — one box, one report
 *   [data-spot]  the quiz
 *   [data-ask]   the message builder
 *
 * The engine knows nothing the site does not already publish. window.FF_LEX is
 * the four reviewed datasets, written out by the build; this file finds their
 * entries in a pasted label and prints what each entry already says. So a
 * correction to a dataset corrects the tools, and nothing here can say
 * something about a term or a scheme that its own page does not.
 *
 * Nothing typed here leaves the page. There is no request, no storage and no
 * account; the one hand-off between two tools travels in the address. A photograph is read on the device by a library served from this
 * domain, loaded only when the camera button is pressed.
 *
 * Every control starts hidden and is revealed here, so a reader without
 * JavaScript never sees a box that would not work.
 */
(function () {
  'use strict';

  var LEX = window.FF_LEX;
  var SINGLE = document.documentElement.hasAttribute('data-single');
  var path = function (p) {
    return SINGLE ? '#' + p : p;
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------------ engine

  /** Lower case, punctuation to spaces, one space between words, padded. */
  function norm(s) {
    return (
      ' ' +
      String(s)
        .toLowerCase()
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9%]+/g, ' ')
        .trim() +
      ' '
    ).replace(/\s+/g, ' ');
  }

  function reEsc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var compiled = null;

  /**
   * Three kinds of pattern. A plain phrase is matched on the normalised text
   * between spaces. "=RSPO" is an acronym, matched in capitals on the text as
   * typed, because "fsc" in lower case is somebody's typing and "FSC" is a
   * mark. "%down" is the one fibre whose name is also an ordinary word, so it
   * only counts with a percentage in front of it.
   */
  function compile() {
    if (compiled) return compiled;
    compiled = [];
    if (!LEX) return compiled;
    LEX.entries.forEach(function (e) {
      e.p.forEach(function (p) {
        if (p.charAt(0) === '=') {
          compiled.push({ e: e, raw: new RegExp('(^|[^A-Za-z0-9])' + reEsc(p.slice(1)) + '(?![A-Za-z0-9])', 'g') });
        } else if (p.charAt(0) === '%') {
          compiled.push({ e: e, re: new RegExp(' \\d+ ?% (?:\\w+ )?' + reEsc(p.slice(1)) + '(?= )', 'g'), len: p.length });
        } else {
          var n = norm(p).trim();
          if (n) compiled.push({ e: e, re: new RegExp(' ' + reEsc(n) + '(?= )', 'g'), len: n.length });
        }
      });
    });
    return compiled;
  }

  var NEGATED = /(?: no| without| free from| free of| zero| never| contains no| not contain| 0%)(?: \w+){0,2} $/;
  var FAUX = /(?: faux| vegan| fake| imitation| artificial| synthetic| plant based| pu| cactus| apple| mushroom| pineapple| cork) $/;
  // "Silk-smooth" is a simile, and "vegan leather" is not a vegan claim.
  var FIGURATIVE = /^ (?:smooth|soft|like|touch|feel|finish)\b/;
  var VEGAN_OF = /^ (?:leather|fur|suede|silk|wool|down|cashmere|shearling)\b/;
  var COMPARE = /\b(greener|greenest|kinder|cleaner|safer|better for|more sustainable|most sustainable|more eco|less plastic|less waste|less water|lower impact|lower carbon|lower emissions|fewer emissions|reduced (?:plastic|emissions|impact|carbon|packaging|waste))\b/;
  var BASELINE = /\bthan\b|compared (?:with|to)|\bversus\b|\bvs\b/;

  function scan(text) {
    var n = norm(text);
    var hits = [];

    compile().forEach(function (c) {
      var m;
      if (c.raw) {
        c.raw.lastIndex = 0;
        while ((m = c.raw.exec(text))) hits.push({ e: c.e, s: -1, x: -1, len: 99 });
        return;
      }
      c.re.lastIndex = 0;
      while ((m = c.re.exec(n))) {
        hits.push({ e: c.e, s: m.index + 1, x: m.index + m[0].length, len: m[0].length - 1 });
      }
    });

    // Longest first, so "organic cotton" is one fibre and not a fibre and a
    // claim, and "peace silk" is not also "silk".
    hits.sort(function (a, b) {
      return b.len - a.len || a.s - b.s;
    });
    var kept = [];
    hits.forEach(function (h) {
      if (h.s < 0) return kept.push(h);
      for (var i = 0; i < kept.length; i++) {
        if (kept[i].s >= 0 && h.s >= kept[i].s && h.x <= kept[i].x) return;
      }
      kept.push(h);
    });
    kept.sort(function (a, b) {
      return a.s - b.s;
    });

    var by = {};
    var order = [];
    kept.forEach(function (h) {
      var key = h.e.k + ':' + h.e.n;
      var rec = by[key];
      if (!rec) {
        rec = by[key] = { e: h.e, present: false, absent: false, faux: '' };
        order.push(rec);
      }
      var after = h.s < 0 ? '' : n.slice(h.x, h.x + 12);
      if (h.e.k === 't' && h.e.n === 'Vegan' && VEGAN_OF.test(after)) return;
      if (h.s < 0 || h.e.k === 't' || h.e.k === 's') {
        rec.present = true;
        return;
      }
      var before = n.slice(Math.max(0, h.s - 28), h.s);
      if (h.e.k === 'm' && FIGURATIVE.test(after)) return;
      if (h.e.k === 'm' && h.e.c === 'animal' && FAUX.test(before)) {
        rec.faux = (FAUX.exec(before)[0] + n.slice(h.s, h.x)).trim();
      } else if (NEGATED.test(before) || /^ free /.test(after)) {
        rec.absent = true;
      } else {
        rec.present = true;
      }
    });

    var out = {
      animal: [], ask: [], terms: [], schemes: [], other: [], faux: [], absent: [],
      compare: [], numbers: [], unknown: [],
    };
    order.forEach(function (r) {
      var e = r.e;
      if (!r.present) {
        if (r.faux) out.faux.push(r.faux);
        else if (r.absent) out.absent.push(e);
        return;
      }
      if (e.k === 't') out.terms.push(e);
      else if (e.k === 's') out.schemes.push(e);
      else if (e.k === 'i' && e.c === 'Animal') out.animal.push(e);
      else if (e.k === 'm' && e.c === 'animal') out.animal.push(e);
      else if (e.k === 'i' && e.c === 'Varies') out.ask.push(e);
      else out.other.push(e);
    });

    text.split(/[.!?\n]+/).forEach(function (s) {
      var low = s.toLowerCase();
      if (COMPARE.test(low) && !BASELINE.test(low)) {
        var t = s.replace(/\s+/g, ' ').trim();
        if (t) out.compare.push(t.length > 150 ? t.slice(0, 147) + '…' : t);
      }
    });

    out.numbers = text.match(/\d+(?:[.,]\d+)?\s?%/g) || [];

    // If it reads like an ingredients list, say which names this file does not
    // hold. Silence about a name would look like a clean result.
    var segs = text
      .replace(/^[^:\n]{0,40}ingredients?\s*:/gim, '')
      .split(/[,;\n•·]+/)
      .map(function (s) {
        return s.replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();
      })
      .filter(function (s) {
        return s && s.length <= 40 && /[a-z]/i.test(s) && s.split(' ').length <= 4;
      });
    if (segs.length >= 5) {
      var seen = {};
      segs.forEach(function (s) {
        var ns = norm(s);
        var hit = compile().some(function (c) {
          if (c.raw) {
            c.raw.lastIndex = 0;
            return c.raw.test(s);
          }
          c.re.lastIndex = 0;
          return c.re.test(ns);
        });
        if (!hit && !seen[ns] && out.unknown.length < 40) {
          seen[ns] = true;
          out.unknown.push(s);
        }
      });
    }

    return out;
  }

  // ------------------------------------------------------------------ report

  var KIND = { i: 'Ingredient', m: 'Material', t: 'Claim', s: 'Certification' };

  function item(e, rows, tag, warn) {
    return (
      '<div class="lab-item' + (warn ? ' lab-item--warn' : '') + '">' +
      '<div class="lab-item__head"><span class="lab-item__name"><a href="' + esc(path(e.u)) + '">' + esc(e.n) + '</a></span>' +
      '<span class="inci-origin' + (warn ? ' inci-origin--animal' : '') + '">' + esc(tag || KIND[e.k]) + '</span></div>' +
      rows
        .filter(function (r) { return r[1]; })
        .map(function (r) {
          return '<p class="lab-row"><span class="lab-row__k">' + esc(r[0]) + '</span><span class="lab-row__v">' + esc(r[1]) + '</span></p>';
        })
        .join('') +
      (e._ask ? '<p class="lab-row"><span class="lab-row__k"></span><span class="lab-row__v"><button type="button" class="lab-link" data-ask-go="' + esc(e.n) + '">Write the question for me</button></span></p>' : '') +
      '</div>'
    );
  }

  function section(h, title, lede, inner, cls) {
    return (
      '<section class="lab-sec' + (cls ? ' ' + cls : '') + '"><' + h + ' class="lab-sec__title">' + esc(title) + '</' + h + '>' +
      (lede ? '<p class="lab-sec__lede">' + esc(lede) + '</p>' : '') + inner + '</section>'
    );
  }

  function tally(cells) {
    return (
      '<div class="lab-tally">' +
      cells
        .map(function (c) {
          return '<div class="lab-tally__cell' + (c[2] && c[0] ? ' lab-tally__cell--warn' : '') + '"><span class="lab-tally__n">' + c[0] + '</span><span class="lab-tally__l">' + esc(c[1]) + '</span></div>';
        })
        .join('') +
      '</div>'
    );
  }

  function names(list) {
    return list.map(function (e) { return esc(typeof e === 'string' ? e : e.n); }).join(' · ');
  }

  function reportReader(r, h) {
    var total = r.animal.length + r.ask.length + r.terms.length + r.schemes.length + r.other.length + r.faux.length + r.absent.length;
    if (!total && !r.unknown.length && !r.compare.length) {
      return '<p class="lab-empty">Nothing in that matched this file. Try the ingredients list off the back, the fibre label, or the wording on the front of the pack.</p>';
    }
    var html = tally([
      [r.animal.length, 'from an animal', true],
      [r.ask.length, 'to ask about'],
      [r.terms.length, r.terms.length === 1 ? 'marketing word' : 'marketing words'],
      [r.schemes.length, r.schemes.length === 1 ? 'certification' : 'certifications'],
    ]);

    if (r.animal.length) {
      html += section(h, 'Comes from an animal', '', r.animal.map(function (e) {
        return item(e, [['What it is', e.a], [e.k === 'm' ? 'Welfare' : 'Note', e.b], ['Instead', e.alt]], KIND[e.k], true);
      }).join(''), 'lab-sec--warn');
    }
    if (r.ask.length) {
      html += section(h, 'Ask the brand', 'These can come from an animal, a plant or a laboratory. The name on the label is the same whichever it is.', r.ask.map(function (e) {
        e._ask = true;
        var s = item(e, [['What it is', e.a], ['Ask', e.b]], 'Origin varies');
        e._ask = false;
        return s;
      }).join(''));
    }
    if (r.terms.length) {
      html += section(h, 'Words doing the work', 'What each one is meant to make you think, and what it tells you.', r.terms.map(function (e) {
        return item(e, [['You’ll think', e.a], ['It means', e.b]], 'Claim');
      }).join(''));
    }
    if (r.compare.length) {
      html += section(h, 'A comparison with no baseline', 'Better than what, and since when? Without that it cannot be checked.', r.compare.map(function (s) {
        return '<p class="lab-quote">“' + esc(s) + '”</p>';
      }).join(''));
    }
    if (r.schemes.length) {
      html += section(h, 'Certifications named', 'A named scheme is the strongest thing a label can carry, and it is always narrower than it looks.', r.schemes.map(function (e) {
        return item(e, [['Run by', e.r], ['Verifies', e.a], ['Does not', e.b]], 'Certification');
      }).join(''));
    }
    if (r.faux.length) {
      html += section(h, '“Vegan” and “faux”', 'The label says ' + r.faux.map(function (f) { return '“' + f + '”'; }).join(', ') + '. That says what it is not. Look for the actual fibre in the composition.', '');
    }
    if (r.absent.length) {
      html += section(h, 'Said to be absent', 'The label says it has none of these. This file can tell you what they are; it cannot confirm they are not there.', '<p class="lab-names">' + names(r.absent) + '</p>');
    }
    if (r.other.length) {
      html += section(h, 'Also recognised', 'Plant, mineral and synthetic names, so an unfamiliar word is not mistaken for an animal one.', '<p class="lab-names">' + r.other.map(function (e) {
        return '<a href="' + esc(path(e.u)) + '">' + esc(e.n) + '</a> <span class="lab-names__o">' + esc(e.c) + '</span>';
      }).join(' · ') + '</p>');
    }
    if (r.unknown.length) {
      html += section(h, 'Not in this file', 'An absence here is a gap in this file, not a clean bill of health.', '<p class="lab-names">' + names(r.unknown) + '</p>');
    }
    html += '<p class="lab-foot">' +
      (r.numbers.length ? 'Numbers on the label: ' + esc(r.numbers.slice(0, 6).join(', ')) + '. ' : 'No number anywhere on it. A claim with no number in it is usually an adjective. ') +
      esc(LEX.originNote) + '</p>' +
      '<p class="lab-foot">This reads the words you gave it against a published reference. It is not advice about any product, and the label in your hand is the authority on what it contains.</p>';
    return html;
  }

  function reportBrand(r, h) {
    var vague = r.terms.filter(function (e) { return e.v; }).length;
    if (!r.terms.length && !r.schemes.length && !r.compare.length && !r.animal.length && !r.other.length) {
      return '<p class="lab-empty">No claim in that matched the register. Paste the copy as it appears: the pack, the product page, the caption.</p>';
    }
    var html = tally([
      [r.terms.length, r.terms.length === 1 ? 'claim found' : 'claims found'],
      [vague, 'with no agreed meaning', true],
      [r.compare.length, r.compare.length === 1 ? 'comparison, no baseline' : 'comparisons, no baseline', true],
      [r.schemes.length, r.schemes.length === 1 ? 'certification' : 'certifications'],
    ]);
    if (r.terms.length) {
      html += section(h, 'Claims in this copy', 'For each: what a buyer infers, what it actually means, and what to have ready before you use it.', r.terms.map(function (e) {
        return item(e, [['Implies', e.a], ['Actually means', e.b], ['Have ready', e.x]], e.v ? 'No agreed meaning' : 'Needs evidence', e.v);
      }).join(''));
    }
    if (r.compare.length) {
      html += section(h, 'Comparisons with no baseline', 'Name what it is compared with, and when. Or delete the comparison.', r.compare.map(function (s) {
        return '<p class="lab-quote">“' + esc(s) + '”</p>';
      }).join(''));
    }
    if (r.schemes.length) {
      html += section(h, 'Certifications named', 'Read your wording against the published scope. The gap between what a logo suggests and what the standard supports is where claims break.', r.schemes.map(function (e) {
        return item(e, [['Verifies', e.a], ['Does not', e.b]], 'Check the scope');
      }).join(''));
    }
    var mats = r.animal.concat(r.other).filter(function (e) { return e.k === 'm'; });
    if (mats.length) {
      html += section(h, 'Materials named', 'What the reference says about each, for when a claim rests on what something is made of.', mats.map(function (e) {
        return item(e, [['What it is', e.a], ['Welfare', e.b]], e.c === 'animal' ? 'Animal-derived' : 'Material', e.c === 'animal');
      }).join(''));
    }
    html += '<p class="lab-foot">' +
      (r.numbers.length ? '' : 'There is no number anywhere in this copy. A claim with no number in it is usually an adjective. ') +
      'A claim made by a picture, a colour or a product name is still a claim, and this cannot see those.</p>' +
      '<p class="lab-foot">This describes what published guidance asks for. It is not legal advice, it does not approve a claim, and a clean result here does not make copy compliant. The full register, with the working documents, is <a href="' + path('/shop/') + '">The Claims Desk</a>.</p>';
    return html;
  }

  // ------------------------------------------------------------- image cards

  var INK = '#12100f', CRIMSON = '#8e0b14', BLUSH = '#f6dfe2', WHITE = '#fdfcfc', DIM = '#4a3c3e';

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('600 80px "Bodoni Moda"'),
      document.fonts.load('500 30px "Bodoni Moda"'),
      document.fonts.load('400 40px "Cormorant Garamond"'),
      document.fonts.load('400 24px "Space Mono"'),
      document.fonts.load('300 30px "Jost"'),
    ]).catch(function () {});
  }

  function wrap(ctx, text, x, y, max, lh, limit) {
    var words = String(text).split(/\s+/), line = '', lines = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > max && line) {
        lines++;
        if (limit && lines === limit) {
          ctx.fillText(line.replace(/[ ,·]+$/, '') + '…', x, y);
          return y + lh;
        }
        ctx.fillText(line, x, y);
        y += lh;
        line = words[i];
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  function spaced(ctx, text, x, y, gap) {
    // letter-spacing on canvas is not in every browser yet
    var s = String(text).toUpperCase();
    for (var i = 0; i < s.length; i++) {
      ctx.fillText(s[i], x, y);
      x += ctx.measureText(s[i]).width + gap;
    }
    return x;
  }

  function masthead(ctx, W, M, ink, accent) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 30px "Bodoni Moda", Georgia, serif';
    ctx.fillStyle = accent;
    var x = spaced(ctx, 'Feral', M, M + 26, 10);
    ctx.fillStyle = ink;
    x = spaced(ctx, ' Femme', x, M + 26, 10);
    ctx.fillStyle = accent;
    ctx.fillText('.', x - 6, M + 26);
  }

  function save(canvas, name, status) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        navigator.share({ files: [file], title: 'FERAL FEMME' }).catch(function () {});
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      if (status) { status.textContent = 'Saved as ' + name + '.'; status.hidden = false; }
    }, 'image/png');
  }

  /**
   * The scanner's card carries counts and the names of what was found. It does
   * not carry anything the reader typed — no product name, no brand — because
   * a card is made to be posted, and a posted card that named a brand would be
   * a statement about it that this site has not checked.
   */
  function cardScan(r, mode) {
    var W = 1080, H = 1350, M = 84;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = BLUSH; ctx.fillRect(0, 0, W, H);
    masthead(ctx, W, M, INK, CRIMSON);
    ctx.font = '400 20px "Space Mono", monospace';
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText(mode === 'brand' ? 'CLAIM CHECK' : 'LABEL CHECK', W - M, M + 24);
    ctx.textAlign = 'left';

    ctx.fillStyle = INK;
    ctx.font = '600 92px "Bodoni Moda", Georgia, serif';
    var y = wrap(ctx, mode === 'brand' ? 'What this copy claims' : 'What this label says', M, 300, W - M * 2, 96);

    var cells = mode === 'brand'
      ? [[r.terms.length, r.terms.length === 1 ? 'claim found' : 'claims found'], [r.terms.filter(function (e) { return e.v; }).length, 'with no agreed meaning'], [r.compare.length, r.compare.length === 1 ? 'comparison, no baseline' : 'comparisons, no baseline'], [r.schemes.length, r.schemes.length === 1 ? 'certification named' : 'certifications named']]
      : [[r.animal.length, 'from an animal'], [r.ask.length, 'to ask the brand about'], [r.terms.length, r.terms.length === 1 ? 'marketing word' : 'marketing words'], [r.schemes.length, r.schemes.length === 1 ? 'certification named' : 'certifications named']];
    y += 30;
    cells.forEach(function (cell, i) {
      var cy = y + i * 150;
      ctx.fillStyle = CRIMSON; ctx.globalAlpha = 0.32;
      ctx.fillRect(M, cy, W - M * 2, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = i < (mode === 'brand' ? 0 : 1) && cell[0] ? CRIMSON : (mode === 'brand' && (i === 1 || i === 2) && cell[0] ? CRIMSON : INK);
      ctx.font = '600 104px "Bodoni Moda", Georgia, serif';
      ctx.fillText(String(cell[0]), M, cy + 112);
      ctx.fillStyle = INK;
      ctx.font = '400 44px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(cell[1], M + 190, cy + 96);
    });
    y += cells.length * 150 + 20;
    ctx.fillStyle = CRIMSON; ctx.globalAlpha = 0.32; ctx.fillRect(M, y - 20, W - M * 2, 2); ctx.globalAlpha = 1;

    var list = mode === 'brand' ? r.terms : r.animal.concat(r.ask);
    if (list.length) {
      ctx.font = '400 20px "Space Mono", monospace';
      ctx.fillStyle = CRIMSON;
      ctx.fillText(mode === 'brand' ? 'THE WORDS' : 'THE NAMES', M, y + 34);
      ctx.font = '300 30px "Jost", Arial, sans-serif';
      ctx.fillStyle = INK;
      wrap(ctx, list.map(function (e) { return e.n; }).join(' · '), M, y + 82, W - M * 2, 42, 3);
    }

    ctx.fillStyle = CRIMSON; ctx.fillRect(M, H - 150, W - M * 2, 3);
    ctx.font = '400 19px "Space Mono", monospace';
    ctx.fillStyle = DIM;
    ctx.fillText('CHECKED AGAINST A PUBLISHED REFERENCE · NOT ADVICE', M, H - 104);
    ctx.fillStyle = INK;
    ctx.fillText('FERAL-FEMME.CO/TOOLS', M, H - 70);
    return c;
  }

  function cardScore(score, total, band) {
    var W = 1080, H = 1920, M = 96;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = CRIMSON; ctx.fillRect(0, 0, W, H);
    masthead(ctx, W, M, WHITE, BLUSH);
    ctx.font = '400 22px "Space Mono", monospace';
    ctx.fillStyle = BLUSH;
    ctx.textAlign = 'right';
    ctx.fillText('SPOT THE GREENWASH', W - M, M + 24);
    ctx.textAlign = 'left';

    ctx.fillStyle = WHITE;
    ctx.font = '400 60px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('I read ten labels and got', M, 560);
    ctx.font = '600 380px "Bodoni Moda", Georgia, serif';
    ctx.fillText(score + '/' + total, M - 8, 900);
    ctx.fillStyle = BLUSH; ctx.fillRect(M, 1012, 220, 4);
    ctx.fillStyle = WHITE;
    ctx.font = '600 96px "Bodoni Moda", Georgia, serif';
    var y = wrap(ctx, band + '.', M, 1150, W - M * 2, 104);
    ctx.fillStyle = BLUSH;
    ctx.font = '400 54px "Cormorant Garamond", Georgia, serif';
    wrap(ctx, 'Ten claims off the kind of packaging you buy every week. Which ones tell you anything?', M, y + 50, W - M * 2 - 40, 68);

    ctx.fillStyle = WHITE; ctx.fillRect(M, H - 250, W - M * 2, 3);
    ctx.font = '400 26px "Space Mono", monospace';
    ctx.fillText('PLAY IT:', M, H - 190);
    ctx.font = '700 30px "Space Mono", monospace';
    ctx.fillText('FERAL-FEMME.CO/TOOLS/SPOT', M, H - 144);
    return c;
  }

  // ----------------------------------------------------------------- the box

  var ocr = null;

  function loadOcr() {
    if (ocr) return ocr;
    ocr = new Promise(function (resolve, reject) {
      if (window.Tesseract) return resolve(window.Tesseract);
      var s = document.createElement('script');
      s.src = (SINGLE ? '' : '/') + 'vendor/ocr/tesseract.min.js';
      s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('library')); };
      s.onerror = function () { ocr = null; reject(new Error('network')); };
      document.head.appendChild(s);
    });
    return ocr;
  }

  /** Phone photographs are twelve megapixels; the reader wants about two. */
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2000, k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function readPhoto(file, say) {
    var base = new URL((SINGLE ? '' : '/') + 'vendor/ocr/', location.href).href;
    say('Loading the reader…');
    return Promise.all([loadOcr(), shrink(file)]).then(function (got) {
      var T = got[0];
      return T.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base,
        logger: function (m) {
          if (m.status === 'recognizing text') say('Reading the label… ' + Math.round(m.progress * 100) + '%');
          else if (/loading|initializ/.test(m.status)) say('Loading the reader…');
        },
      }).then(function (worker) {
        return worker.recognize(got[1]).then(function (res) {
          worker.terminate();
          return res.data.text;
        });
      });
    });
  }

  function initLab() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-lab]'), function (box) {
      if (box.getAttribute('data-ready') || !LEX) return;
      box.setAttribute('data-ready', '1');
      var mode = box.getAttribute('data-mode') || 'reader';
      var h = box.getAttribute('data-h') || 'h2';
      var input = box.querySelector('[data-lab-input]');
      var out = box.querySelector('[data-lab-out]');
      var status = box.querySelector('[data-lab-status]');
      var file = box.querySelector('[data-lab-file]');
      var after = box.querySelector('[data-lab-after]');
      var last = null;
      box.hidden = false;

      function say(t) {
        status.textContent = t || '';
        status.hidden = !t;
      }

      function run() {
        say('');
        if (!input.value.trim()) {
          out.hidden = true;
          if (after) after.hidden = true;
          say(mode === 'brand' ? 'Paste the copy first.' : 'Type, paste or photograph the label first.');
          input.focus();
          return;
        }
        last = scan(input.value);
        out.innerHTML = mode === 'brand' ? reportBrand(last, h) : reportReader(last, h);
        out.hidden = false;
        if (after) after.hidden = false;
        if (out.getBoundingClientRect().top > window.innerHeight * 0.75) {
          out.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }
      }

      box.querySelector('[data-lab-run]').addEventListener('click', run);
      input.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
      });
      box.querySelector('[data-lab-sample]').addEventListener('click', function () {
        input.value = box.getAttribute('data-sample') || '';
        run();
      });
      box.querySelector('[data-lab-clear]').addEventListener('click', function () {
        input.value = '';
        out.hidden = true;
        if (after) after.hidden = true;
        say('');
        input.focus();
      });

      var photo = box.querySelector('[data-lab-photo]');
      if (photo && file) {
        photo.addEventListener('click', function () {
          // A browser will not start the reader from a file opened off a disk.
          if (location.protocol === 'file:') {
            say('Reading a photograph works on the website, not from a file opened on your computer. You can type or paste the label here instead.');
            return;
          }
          file.click();
        });
        file.addEventListener('change', function () {
          var f = file.files && file.files[0];
          if (!f) return;
          photo.disabled = true;
          readPhoto(f, say)
            .then(function (text) {
              text = String(text || '').replace(/[ \t]+\n/g, '\n').trim();
              if (!text) {
                say('No words could be read in that photograph. Try closer, flatter and in better light, or type it in.');
                return;
              }
              input.value = (input.value.trim() ? input.value.trim() + '\n' : '') + text;
              say('Read from the photograph. Check the words above, correct anything it misread, then check it.');
              run();
              say('Read from the photograph. A camera misreads small print: correct anything wrong above and check it again.');
            })
            .catch(function (err) {
              say(err && err.message === 'network'
                ? 'The photograph reader could not be loaded. It needs a connection the first time. You can type or paste the label instead.'
                : 'That photograph could not be read here. You can type or paste the label instead.');
            })
            .then(function () {
              photo.disabled = false;
              file.value = '';
            });
        });
      }

      out.addEventListener('click', function (e) {
        var go = e.target.closest && e.target.closest('[data-ask-go]');
        if (!go) return;
        // Handed over in the address, or in memory where there is only one
        // document. Nothing is written to storage for it.
        var name = go.getAttribute('data-ask-go');
        if (SINGLE) {
          window.FF.askWith = { kind: 'ingredient', ingredient: name };
          location.href = '#/tools/ask/';
        } else {
          location.href = '/tools/ask/?kind=ingredient&ingredient=' + encodeURIComponent(name);
        }
      });

      var img = box.querySelector('[data-lab-image]');
      if (img) {
        img.addEventListener('click', function () {
          if (!last) return;
          fontsReady().then(function () {
            save(cardScan(last, mode), mode === 'brand' ? 'feral-femme-claim-check.png' : 'feral-femme-label-check.png', status);
          });
        });
      }
    });
  }

  // -------------------------------------------------------------------- quiz

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function initSpot() {
    var root = document.querySelector('[data-spot]');
    if (!root || root.getAttribute('data-ready') || !LEX) return;
    root.setAttribute('data-ready', '1');
    var data;
    try { data = JSON.parse(root.querySelector('[data-spot-items]').textContent); } catch (e) { return; }
    var stage = root.querySelector('[data-spot-stage]');
    var ROUND = 10;
    var deck, at, score;
    root.hidden = false;

    function entry(ref) {
      for (var i = 0; i < LEX.entries.length; i++) {
        if (LEX.entries[i].k === ref[0] && LEX.entries[i].n === ref[1]) return LEX.entries[i];
      }
      return null;
    }

    function pack(q) {
      return '<div class="spot-pack"><p class="spot-pack__kind">' + esc(q.kind) + '</p><p class="spot-pack__claim">' + esc(q.claim) + '</p>' +
        (q.fine ? '<p class="spot-pack__fine">' + esc(q.fine) + '</p>' : '') + '</div>';
    }

    function ask() {
      var q = deck[at];
      stage.innerHTML =
        '<p class="spot-count">' + (at + 1) + ' of ' + deck.length + ' · ' + score + ' right so far</p>' + pack(q) +
        '<p class="spot-q">Does this tell you something you could check?</p>' +
        '<div class="spot-answers"><button type="button" class="btn" data-a="says">It tells me something</button>' +
        '<button type="button" class="btn btn--ghost" data-a="nothing">It tells me nothing</button></div>';
    }

    function reveal(guess) {
      var q = deck[at], right = guess === q.answer, e = entry(q.ref);
      if (right) score++;
      stage.innerHTML =
        '<p class="spot-count">' + (at + 1) + ' of ' + deck.length + ' · ' + score + ' right so far</p>' + pack(q) +
        '<div class="spot-verdict' + (right ? ' spot-verdict--right' : '') + '" role="status"><p class="spot-verdict__mark">' + (right ? 'Right.' : 'Not quite.') +
        ' ' + (q.answer === 'says' ? 'It tells you something.' : 'It tells you nothing.') + '</p>' +
        '<p class="spot-verdict__why">' + esc(q.why) + '</p>' +
        (e ? '<p class="lab-row"><span class="lab-row__k">' + (e.k === 's' ? 'Does not' : 'It means') + '</span><span class="lab-row__v">' + esc(e.b) +
          ' <a href="' + esc(path(e.u)) + '">The entry</a></span></p>' : '') + '</div>' +
        '<div class="spot-answers"><button type="button" class="btn" data-next>' + (at + 1 < deck.length ? 'Next label' : 'See my score') + '</button></div>';
      var n = stage.querySelector('[data-next]');
      if (n) n.focus();
    }

    function end() {
      var bands = data.bands, band = bands[bands.length - 1][1];
      for (var i = 0; i < bands.length; i++) { if (score >= bands[i][0]) { band = bands[i][1]; break; } }
      stage.innerHTML =
        '<div class="spot-end"><p class="spot-end__n">' + score + '<span>/' + deck.length + '</span></p>' +
        '<p class="spot-end__band">' + esc(band) + '.</p>' +
        '<p class="spot-end__note">Every answer came from an entry in the decoders. The claims were written for this quiz and are not any real product’s.</p>' +
        '<div class="spot-answers"><button type="button" class="btn" data-card>Save my score card</button>' +
        '<button type="button" class="btn btn--ghost" data-again>Play again</button>' +
        '<a class="btn btn--quiet" href="' + path('/tools/scan/') + '">Scan a real label</a></div>' +
        '<p class="lab-status" data-spot-status role="status" hidden></p></div>';
      stage.querySelector('[data-card]').addEventListener('click', function () {
        fontsReady().then(function () {
          save(cardScore(score, deck.length, band), 'feral-femme-spot-the-greenwash.png', stage.querySelector('[data-spot-status]'));
        });
      });
    }

    function start() {
      deck = shuffle(data.items).slice(0, ROUND);
      at = 0; score = 0;
      ask();
    }

    stage.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-a')) reveal(b.getAttribute('data-a'));
      else if (b.hasAttribute('data-next')) { at++; at < deck.length ? ask() : end(); }
      else if (b.hasAttribute('data-again')) start();
    });

    start();
  }

  // ------------------------------------------------------------ the messages

  function initAsk() {
    var root = document.querySelector('[data-ask]');
    if (!root || root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    var letters;
    try { letters = JSON.parse(root.querySelector('[data-ask-letters]').textContent); } catch (e) { return; }
    var kind = root.querySelector('[data-ask-kind]');
    var fields = root.querySelector('[data-ask-fields]');
    var name = root.querySelector('[data-ask-name]');
    var subj = root.querySelector('[data-ask-subject]');
    var body = root.querySelector('[data-ask-body]');
    var status = root.querySelector('[data-ask-status]');
    var mail = root.querySelector('[data-ask-mail]');
    var values = {};
    root.hidden = false;

    function fmt(d) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    var today = new Date();
    var due = new Date(today.getTime() + 14 * 864e5);

    function current() {
      for (var i = 0; i < letters.length; i++) if (letters[i].id === kind.value) return letters[i];
      return letters[0];
    }

    function fill(s, l) {
      return s.replace(/\{(\w+)\}/g, function (m, k) {
        if (k === 'date') return fmt(today);
        if (k === 'due') return fmt(due);
        if (k === 'name') return name.value.trim() || '[Your name]';
        var v = (values[k] || '').trim();
        if (v) return v;
        for (var i = 0; i < l.fields.length; i++) if (l.fields[i][0] === k) return '[' + l.fields[i][1].toLowerCase() + ']';
        return '[' + k + ']';
      });
    }

    function paint() {
      var l = current();
      var s = fill(l.subject, l);
      var b = l.body.map(function (p) { return fill(p, l); }).join('\n\n');
      subj.textContent = s;
      body.textContent = b;
      mail.href = 'mailto:?subject=' + encodeURIComponent(s) + '&body=' + encodeURIComponent(b);
      status.hidden = true;
    }

    function build() {
      var l = current();
      fields.innerHTML = l.fields.map(function (f) {
        return '<label class="ask-field"><span>' + esc(f[1]) + '</span><input type="text" data-k="' + esc(f[0]) + '" placeholder="' + esc(f[2]) + '" value="' + esc(values[f[0]] || '') + '" autocomplete="off"></label>';
      }).join('');
      paint();
    }

    var pre = window.FF && window.FF.askWith;
    if (pre) window.FF.askWith = null;
    else if (location.search) {
      pre = {};
      location.search.slice(1).split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) {
          try { pre[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) {}
        }
      });
    }
    if (pre) {
      if (pre.kind && letters.some(function (l) { return l.id === pre.kind; })) kind.value = pre.kind;
      ['claim', 'where', 'product', 'ingredient', 'fibre'].forEach(function (k) {
        if (pre[k]) values[k] = String(pre[k]).slice(0, 200);
      });
    }

    kind.addEventListener('change', build);
    name.addEventListener('input', paint);
    fields.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k');
      if (k) { values[k] = e.target.value; paint(); }
    });
    root.querySelector('[data-ask-copy]').addEventListener('click', function () {
      var text = 'Subject: ' + subj.textContent + '\n\n' + body.textContent;
      var done = function () { status.textContent = 'Copied. Paste it into an email to the brand.'; status.hidden = false; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          status.textContent = 'Could not copy from here. Select the message and copy it by hand.'; status.hidden = false;
        });
      } else {
        var r = document.createRange();
        r.selectNodeContents(body);
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    });

    build();
  }

  /** "Check a label" on the front page puts the reader in the box below it. */
  function initJump() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-scan-jump]'), function (a) {
      if (a.getAttribute('data-ready')) return;
      a.setAttribute('data-ready', '1');
      a.addEventListener('click', function (e) {
        var input = document.querySelector('#scan [data-lab-input]');
        if (!input || input.closest('[hidden]')) return;
        e.preventDefault();
        var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('scan').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        input.focus({ preventScroll: true });
      });
    });
  }

  /**
   * A link to a section of the page it is on. Scrolled by hand rather than
   * left to a #fragment, because in the single-file build the fragment is the
   * router's, and "#free" there is a page that does not exist. The href is a
   * real page, for when this has not run.
   */
  function initSkip() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-jump]'), function (a) {
      if (a.getAttribute('data-ready')) return;
      a.setAttribute('data-ready', '1');
      a.addEventListener('click', function (e) {
        var to = document.getElementById(a.getAttribute('data-jump'));
        if (!to) return;
        e.preventDefault();
        var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        to.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  function init() {
    initJump();
    initSkip();
    initLab();
    initSpot();
    initAsk();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // The single-file build swaps page content without reloading.
  window.FF = window.FF || {};
  window.FF.initLab = init;
  // For the build's own tests: the engine, with no page around it.
  window.FF.scan = scan;
})();
