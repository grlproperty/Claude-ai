import { layout } from '../templates/layout.mjs';
import { label, sectionHead, supportBanner } from '../templates/components.mjs';
import { esc, typo, slugify } from '../lib/util.mjs';

export function renderIndustries({ site, data }) {
  const body = `
<section class="section--tight" style="padding-top:clamp(2.5rem,6vw,5rem);">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'The remit',
      title: data.title,
      lede: data.summary,
      wide: true,
      level: 1,
    })}
  </div>
</section>

<section class="section--tight">
  <div class="wrap">
    ${data.industries
      .map(
        (ind) => `<article class="entry reveal" id="${esc(slugify(ind.name))}">
          <div class="entry__head">
            <h2 class="entry__name"><span class="is-crimson display" style="margin-right:.6rem;">${esc(ind.number)}</span>${typo(ind.name)}</h2>
            <div class="tags" style="margin:0;">${ind.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          </div>

          <div class="detail-grid">
            <div class="panel">
              <h4>Standing reference</h4>
              <p class="row__index" style="margin-bottom:.6rem;">${esc(ind.resource.publisher)}</p>
              <h3 style="font-size:1.25rem;margin-bottom:.75rem;">${typo(ind.resource.title)}</h3>
              <p>${typo(ind.resource.body)}</p>
              <p style="margin-top:1.25rem;">
                <a class="arrow" href="${esc(ind.resource.url)}" target="_blank" rel="noopener noreferrer">${esc(ind.resource.label)}</a>
              </p>
            </div>
            <div class="panel panel--warn">
              <h4>Also worth reading</h4>
              <p>${typo(ind.also.title)}</p>
              <p style="margin-top:1rem;">
                <a class="arrow" href="${esc(ind.also.url)}" target="_blank" rel="noopener noreferrer">Open</a>
              </p>
            </div>
          </div>
        </article>`
      )
      .join('')}
  </div>
</section>

${supportBanner(site)}
`;

  return layout({
    site,
    title: data.title,
    description:
      'The ten industries FERAL FEMME documents, each with the single most useful public investigation or database in that field.',
    path: '/industries/',
    body,
  });
}
