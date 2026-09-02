---
title: Accessibility
summary: What this platform commits to, what it currently meets, and how to report a barrier.
order: 7
---

An educational platform that cannot be read by everyone who needs it has failed at its stated purpose. This page sets out what we hold ourselves to.

## Commitment

We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA.

## What is in place

Every page is built as semantic HTML with a single main landmark, an ordered heading structure, and a skip link to the content.

Colour contrast for body text, headings, and interactive elements is tested against the WCAG AA thresholds. The brand palette is used in ways that keep text contrast above the required ratios rather than at the edge of them.

Colour is never the sole carrier of meaning. Category indicators across the decoders pair a colour with a text label.

All functionality is operable by keyboard, with a visible focus indicator on every interactive element.

Images that carry meaning have descriptive alternative text. Decorative campaign imagery is marked as decorative so that screen readers pass over it rather than announcing it.

Motion is minimal, and everything that moves respects the `prefers-reduced-motion` setting.

Text reflows to 320 pixels without horizontal scrolling. Wide content — tables and datasets — scrolls within its own container rather than moving the page.

The site is usable without JavaScript. Search, filtering, card tilt, scroll reveal, and the hero animation are all progressive enhancements; every page renders its full content in HTML without them.

## Known limitations

Many sources we link to are PDFs published by newsrooms, regulators, and NGOs. We do not control their accessibility and cannot remediate them. Where a document is central to a field note, we summarise its relevant content in the note itself so the argument never depends on opening the PDF.

The hero on the home page renders a WebGL animation. It is decorative, hidden from assistive technology, holds no information, renders a single static frame under `prefers-reduced-motion`, and falls back to a plain CSS pattern where WebGL is unavailable.

## Reporting a barrier

If any part of this platform is difficult or impossible to use, write to [info@feral-femme.co](mailto:info@feral-femme.co) describing the barrier and the assistive technology in use. We treat access barriers as defects and prioritise them accordingly.
