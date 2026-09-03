"""Finds the page each section of a rendered product starts on.

The contents page has to cite page numbers, and a page number does not exist
until the document has been laid out. So the build renders once, asks this
which page each section heading landed on, and renders again with the answers.

Two things make naive matching fail. The section labels are set with wide
letter-spacing, which extracts as "S E C T I O N  O N E" rather than "Section
one", so every comparison is made with the spaces stripped out. And the
headings are set in a display face whose extracted text is less dependable
than the label above it, so titles are passed in from the build rather than
read back out — this only has to find page numbers.

    python3 pages.py file.pdf '[["Section one","How to ..."], ...]'
"""
import json
import sys

from pypdf import PdfReader


def flat(s):
    return ''.join(s.split()).upper()


reader = PdfReader(sys.argv[1])
wanted = json.loads(sys.argv[2])

# Each section opens a page, so its label is in the first few lines of the page
# it starts on. Searching in order stops a later mention matching an earlier
# section.
heads = []
for i, page in enumerate(reader.pages):
    lines = (page.extract_text() or '').strip().splitlines()[:3]
    heads.append((i + 1, [flat(l) for l in lines]))

out = []
at = 0
for label, title in wanted:
    key = flat(label)
    page = None
    for number, lines in heads[at:]:
        if any(l == key for l in lines):
            page = number
            at = number  # never look backwards for the next one
            break
    out.append({'n': label, 't': title, 'p': page or ''})

print(json.dumps(out))
