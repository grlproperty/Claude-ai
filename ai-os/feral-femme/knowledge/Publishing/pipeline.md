---
title: Publishing pipeline
owner: Editorial Director
version: 1
updated: 2026-11-15
status: verified
source: README.md, scripts/send-briefing.mjs and .github/workflows in the site repository
access: all
---

# Publishing pipeline

- **Site:** a static site generated from Markdown and JSON in this repository. `npm run build` writes the pages; `npm run check` fails the build on broken links, missing metadata or contrast failures. GitHub Actions deploys on every push to the main branch.
- **Publishing a note:** add the approved Markdown file to `content/field-notes/` and push. This system prepares the file; a person commits it.
- **The Research Briefing:** MailerLite. After a successful deploy, `scripts/send-briefing.mjs` creates one campaign per new note, named by the note's slug, and skips any that already exists. The briefing carries the note in full and nothing else.
- **Feed:** `/feed.xml`, driven by each note's `date`.
- **Dataset review:** a weekly workflow opens an issue when a dataset passes its review cycle.
- **Analytics:** off by default. Enabling it requires disclosure on the privacy page first.
