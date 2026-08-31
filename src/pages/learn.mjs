import { layout } from '../templates/layout.mjs';
import { label, sectionHead, supportBanner, note } from '../templates/components.mjs';
import { esc, typo, isoDate } from '../lib/util.mjs';

export function renderLearnIndex({ site, modules }) {
  const total = modules.reduce((n, m) => n + (m.readingTime ?? 0), 0);

  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Curriculum',
      title: 'Learn',
      level: 1,
      lede: `Five modules, roughly ${total} minutes in total, taking you from the architecture of cosmetics regulation to a repeatable method for assessing any claim on any label. Work through them in order — each assumes the one before it.`,
      wide: true,
    })}

    <div class="grid grid--2">
      ${modules
        .map(
          (m, i) => `<article class="card card--linked">
            <div class="card__meta">
              <span class="is-crimson">Module ${String(i + 1).padStart(2, '0')}</span>
              <span>${m.readingTime} min</span>
            </div>
            <h3><a class="stretch" href="${esc(m.url)}">${typo(m.title)}</a></h3>
            <p>${typo(m.summary)}</p>
            ${
              m.outcomes?.length
                ? `<div class="card__foot"><p class="label label--dim label--plain" style="margin-bottom:0.75rem;">You will be able to</p>
                   <ul style="margin:0;padding-left:1.1rem;font-size:0.8125rem;line-height:1.6;color:var(--ink-secondary);">
                     ${m.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}
                   </ul></div>`
                : '<div class="card__foot"><span class="arrow">Open module</span></div>'
            }
          </article>`
        )
        .join('')}
    </div>

    <div style="margin-top:3rem;">
      ${note(
        'For educators',
        `<p class="mb-0">These modules are licensed for non-commercial educational use with attribution. Editable slide decks, lesson plans with learning outcomes, and printable source packs are available through <a href="/licensing/">educational licensing</a> — institutional licences are what keep the archive free for everyone else.</p>`
      )}
    </div>
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: 'Learn',
    description:
      'A five-module curriculum on cosmetics regulation, animal testing, and the non-animal methods that replace it. Free to read, licensed for teaching.',
    path: '/learn/',
    body,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: `${site.name} — Curriculum`,
      description:
        'A five-module curriculum on cosmetics regulation, animal testing, and non-animal safety assessment.',
      provider: { '@type': 'Organization', name: site.name, url: site.url },
      isAccessibleForFree: true,
      hasCourseInstance: modules.map((m) => ({
        '@type': 'CourseInstance',
        name: m.title,
        courseMode: 'online',
        description: m.summary,
      })),
    },
  });
}

export function renderModule({ site, module: mod, prev, next, all }) {
  const index = all.indexOf(mod) + 1;

  const progress = `<nav class="tracker-controls" aria-label="Curriculum" style="margin-bottom:0;border-bottom:0;padding-bottom:0;">
    ${all
      .map(
        (m, i) =>
          `<a class="chip" href="${esc(m.url)}"${m === mod ? ' aria-pressed="true" aria-current="page"' : ''}>${String(
            i + 1
          ).padStart(2, '0')}</a>`
      )
      .join('')}
  </nav>`;

  const outcomes = mod.outcomes?.length
    ? `<aside class="panel" style="margin-bottom:2.5rem;">
        <h4>Learning outcomes</h4>
        <ul>${mod.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      </aside>`
    : '';

  const pager = `<nav class="section--tight" aria-label="Module navigation">
    <div class="wrap">
      <div class="grid grid--2" style="gap:1.5rem;">
        ${
          prev
            ? `<a class="card" href="${esc(prev.url)}" style="text-decoration:none;">
                 <div class="card__meta"><span class="is-crimson">← Previous</span></div>
                 <h3 style="margin-bottom:0;">${typo(prev.title)}</h3>
               </a>`
            : `<a class="card" href="/learn/" style="text-decoration:none;">
                 <div class="card__meta"><span class="is-crimson">← Curriculum</span></div>
                 <h3 style="margin-bottom:0;">All modules</h3>
               </a>`
        }
        ${
          next
            ? `<a class="card" href="${esc(next.url)}" style="text-decoration:none;text-align:right;">
                 <div class="card__meta" style="justify-content:flex-end;"><span class="is-crimson">Next →</span></div>
                 <h3 style="margin-bottom:0;">${typo(next.title)}</h3>
               </a>`
            : `<a class="card" href="/research/" style="text-decoration:none;text-align:right;">
                 <div class="card__meta" style="justify-content:flex-end;"><span class="is-crimson">Next →</span></div>
                 <h3 style="margin-bottom:0;">The research archive</h3>
               </a>`
        }
      </div>
    </div>
  </nav>`;

  const body = `
<article>
  <header class="article-head">
    <div class="wrap">
      ${label(`Module ${String(index).padStart(2, '0')} of ${all.length}`)}
      <h1>${typo(mod.title)}</h1>
      <p class="lede">${typo(mod.summary)}</p>
      <div class="article-meta" style="margin-top:2rem;">
        <span><strong>${mod.readingTime} min</strong></span>
        <span>Part of the <a href="/learn/">curriculum</a></span>
      </div>
      <div style="margin-top:2rem;">${progress}</div>
    </div>
  </header>

  <div class="wrap article-layout">
    <div>
      ${
        mod.headings.length >= 3
          ? `<nav class="toc" aria-label="On this page">
              <p class="label label--dim">On this page</p>
              <ol>${mod.headings
                .map(
                  (h) =>
                    `<li${h.depth === 3 ? ' class="is-sub"' : ''}><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`
                )
                .join('')}</ol>
            </nav>`
          : ''
      }
    </div>
    <div>
      ${outcomes}
      <div class="prose">${mod.html}</div>
    </div>
  </div>
</article>

${pager}
${supportBanner(site)}
`;

  return layout({
    site,
    title: mod.title,
    description: mod.summary,
    path: mod.url,
    body,
    ogImage: `/assets/og/${mod.slug}.png`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: mod.title,
      description: mod.summary,
      educationalLevel: 'Introductory',
      learningResourceType: 'Module',
      timeRequired: `PT${mod.readingTime}M`,
      teaches: mod.outcomes ?? [],
      isAccessibleForFree: true,
      dateModified: isoDate(mod.updated ?? mod.date ?? new Date()),
      provider: { '@type': 'Organization', name: site.name, url: site.url },
    },
  });
}
