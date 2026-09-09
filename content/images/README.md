# Images kept in the repository

## hero.jpg — the photograph under the wordmark on the home page

Put a file named `hero.jpg`, `hero.jpeg`, `hero.png` or `hero.webp` in this
folder and the home page uses it instead of the Instagram frame. Remove the
file and the pulled frame comes back — nothing else has to change.

The build resizes it to 640px and 1200px webp and does nothing else to it. The
Instagram pull desaturates and lifts what it fetches, to bring a feed shot on
different days into one palette; a hero chosen by hand has already been graded
by whoever chose it, so it goes in as supplied.

Use an original without the burnt-in FERAL FEMME wordmark. The frames on
Instagram carry one, which is right in a feed and a duplicate directly under a
page already headed FERAL FEMME.

Portrait suits the slot best — the plate is set to 3:4 and crops to it.

## Cut-outs

A file with a genuinely transparent background — a figure cut out of its
ground, saved as PNG or WebP — is detected at build time and shown differently:
unframed, uncropped, standing directly on the page at its own proportions,
with the caption centred under it. Nothing has to be set for this; the build
reads the pixels, and says so in its output when it fires:

    Hero image: hero.png (1585x1965) — cut-out, shown unframed

A PNG whose alpha channel exists but is fully opaque is treated as an ordinary
photograph, which is what it is. So exporting with transparency turned on by
habit does not change the layout — only actually cutting the figure out does.
