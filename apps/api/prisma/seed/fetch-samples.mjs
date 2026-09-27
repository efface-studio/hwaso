// 예시 게시물 원천 데이터 수집 (1회성, 결과 samples.json 을 커밋한다)
// 출처: The Cleveland Museum of Art Open Access — 이미지·메타데이터 모두 CC0 (cc0=1 필터)
// https://openaccess-api.clevelandart.org
// 실행: node apps/api/prisma/seed/fetch-samples.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API = 'https://openaccess-api.clevelandart.org/api/artworks/';

/** [카테고리 slug, 검색어, CMA type, 개수] */
const PLAN = [
  ['painting', 'landscape', 'Painting', 3],
  ['painting', 'portrait', 'Painting', 2],
  ['painting', 'still life', 'Painting', 1],
  ['drawing', 'study', 'Drawing', 3],
  ['print', 'Hokusai', 'Print', 1],
  ['print', 'etching', 'Print', 2],
  ['sculpture', 'bronze', 'Sculpture', 3],
  ['photography', '', 'Photograph', 3],
  ['contemporary', 'Mondrian', 'Painting', 1],
  ['contemporary', 'Kandinsky', '', 1],
  ['contemporary', 'Klee', '', 1],
  ['contemporary', 'Delaunay', '', 1],
  ['old-art', 'Joseon', 'Painting', 2],
  ['old-art', 'Korea', 'Painting', 1],
  ['old-art', 'Yuan dynasty', 'Painting', 1],
  ['craft', 'Goryeo', 'Ceramic', 2],
  ['craft', '', 'Lacquer', 1],
  ['artifact', 'Silla', '', 2],
  ['artifact', '', 'Amulets', 1],
  ['antique', 'Joseon', 'Ceramic', 3],
  ['vintage', 'Art Deco', '', 2],
  ['vintage', '', 'Timepiece', 1],
  ['document', '', 'Manuscript', 2],
  ['book', '', 'Bound Volume', 2],
  ['poster', 'poster', 'Print', 2],
  ['poster', 'Toulouse-Lautrec', 'Print', 2],
  ['poster', 'Mucha', '', 1],
  ['stamp', 'stamp moistener', '', 1],
  ['medal', 'medal', '', 3],
  ['currency', 'tetradrachm', 'Coins', 1],
  ['currency', 'denarius', 'Coins', 1],
  ['currency', '', 'Coins', 1],
  ['daily-object', 'spoon', '', 1],
  ['daily-object', '', 'Cosmetic Objects', 1],
  ['daily-object', 'Joseon', 'Metalwork', 1],
  ['collectible', '', 'Portrait Miniature', 2],
  ['collectible', 'playing card', '', 1],
  ['limited', 'Tiffany', 'Glass', 2],
  ['etc', 'netsuke', '', 1],
  ['etc', '', 'Jade', 1],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) =>
  (html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    await sleep(1500 * (i + 1));
  }
  throw new Error(`fetch failed: ${url}`);
}

// 카테고리 성격과 맞지 않거나 앞/뒷면만 다른 중복 항목
const EXCLUDE = /Virgin and Child|The Swing|(obverse)|\(reverse\)|\(verso\)|\(Stem\)/;

const seen = new Set();
const seenTitles = new Set();
const out = [];

for (const [category, q, type, count] of PLAN) {
  const params = new URLSearchParams({ cc0: '1', has_image: '1', limit: '40' });
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  const { data } = await getJson(`${API}?${params}`);
  let picked = 0;
  for (const o of data ?? []) {
    if (picked >= count) break;
    const img = o.images?.print ?? o.images?.web;
    const title = o.title?.trim() ?? '';
    if (
      seen.has(o.id) ||
      seenTitles.has(title) ||
      EXCLUDE.test(title) ||
      !img?.url ||
      img.url.endsWith('.tif')
    )
      continue;
    seen.add(o.id);
    seenTitles.add(title);
    picked++;
    const creator = o.creators?.[0];
    const dims = o.dimensions?.overall ?? o.dimensions?.framed ?? o.dimensions?.diameter ?? null;
    out.push({
      category,
      source: 'The Cleveland Museum of Art Open Access (CC0)',
      sourceUrl: o.url,
      accession: o.accession_number,
      title: o.title?.trim(),
      artist: creator ? creator.description.replace(/\s*\(.*$/, '').trim() : null,
      artistDescription: creator?.description ?? null,
      artistBirthYear: creator?.birth_year ? Number(creator.birth_year) : null,
      artistDeathYear: creator?.death_year ? Number(creator.death_year) : null,
      culture: o.culture?.[0] ?? null,
      date: o.creation_date ?? null,
      year: o.creation_date_earliest ?? null,
      technique: o.technique ?? null,
      measurements: o.measurements ?? null,
      // CMA dimensions 는 m 단위
      widthCm: dims?.width ? Math.round(dims.width * 1000) / 10 : null,
      heightCm: dims?.height ? Math.round(dims.height * 1000) / 10 : null,
      depthCm: dims?.depth ? Math.round(dims.depth * 1000) / 10 : null,
      type: o.type,
      description: strip(o.wall_description ?? o.description).slice(0, 1200) || null,
      provenance: (o.provenance ?? [])
        .map((p) => ({ date: p.date ?? null, description: strip(p.description) }))
        .filter((p) => p.description)
        .slice(0, 5),
      exhibitions: (o.exhibitions?.current ?? []).map((e) => strip(e.description)).slice(0, 3),
      citations: (o.citations ?? [])
        .map((c) => strip(c.citation))
        .filter(Boolean)
        .slice(0, 3),
      image: { url: img.url, width: Number(img.width), height: Number(img.height) },
    });
  }
  console.log(`${category.padEnd(14)} ${(q || type).padEnd(20)} ${picked}/${count}`);
  await sleep(200);
}

writeFileSync(resolve(import.meta.dirname, 'samples.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`total ${out.length}`);
