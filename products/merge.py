"""Joins the unfoliated cover to the foliated body and sets the metadata.

    python3 merge.py out.pdf cover.pdf body.pdf "Title"

The two are printed separately because Chromium reserves the running-footer
strip on every page of a render, which stops a full-bleed cover reaching the
foot of the paper — and because a cover should not carry a page number.
"""
import sys

from pypdf import PdfWriter

out, cover, body, title = sys.argv[1:5]

writer = PdfWriter()
for path in (cover, body):
    writer.append(path)

writer.add_metadata({
    '/Title': title,
    '/Author': 'Ayden Rosemary Brown',
    '/Creator': 'FERAL FEMME',
    '/Subject': 'Environmental, welfare and sourcing claims reference',
})

with open(out, 'wb') as fh:
    writer.write(fh)
