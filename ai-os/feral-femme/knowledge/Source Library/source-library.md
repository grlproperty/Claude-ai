---
title: Source library
owner: Editorial Director
version: 1
updated: 2026-11-15
status: verified
source: content/data/sources.json, library.json and record.json in the site repository
access: all
---

# Source library

The standing sources live in the site's own data files, which this system reads directly and never copies:

- **Standing list of cited authorities** — `content/data/sources.json` (54 publishers and bodies). The Source Verification agent checks each new source against it; a publisher not on the list is flagged for a person to vet.
- **Library** — `content/data/library.json` (42 investigations and databases, linked to their originals).
- **Record Checker** — `content/data/record.json` (21 documented findings against named companies, each with a named source). It holds only what the public record shows; absence of a record is not evidence of good practice.
