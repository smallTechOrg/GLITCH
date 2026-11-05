#!/usr/bin/env node
// Export sanity (spec/roadmap.md → Scaffold Gate step 3). Fails loudly with every problem found.
//  - dist/index.html exists and contains GLITCH
//  - dist/.nojekyll exists (GitHub Pages must serve /_expo/)
//  - every /GLITCH/_expo/... asset referenced by any exported HTML exists and is non-empty
//  - no HTML references /_expo/ without the /GLITCH base path
//  - the Press Start 2P font file is in dist/
//  - every route is pre-rendered (welcome, settings, 4×hero/story/complete, 9 game deep links)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const BASE = '/GLITCH';
const problems = [];
const fail = (m) => problems.push(m);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

if (!existsSync(DIST)) {
  console.error(`check-export: ${DIST} does not exist. Run: cd web && npx expo export --platform web`);
  process.exit(1);
}
const files = walk(DIST);
const rel = (f) => relative(DIST, f).split('\\').join('/');

const index = join(DIST, 'index.html');
if (!existsSync(index)) fail('dist/index.html missing');
else if (!readFileSync(index, 'utf8').includes('GLITCH')) fail('dist/index.html does not contain "GLITCH"');
if (!existsSync(join(DIST, '.nojekyll'))) fail('dist/.nojekyll missing (copy web/public/.nojekyll)');

const htmlFiles = files.filter((f) => f.endsWith('.html'));
let assetRefs = 0;
for (const html of htmlFiles) {
  const text = readFileSync(html, 'utf8');
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (ref.startsWith('/_expo/')) fail(`${rel(html)} references ${ref} without the ${BASE} base path`);
    if (!ref.startsWith(`${BASE}/_expo/`)) continue;
    assetRefs++;
    const p = join(DIST, ref.slice(BASE.length + 1).split('?')[0]);
    if (!existsSync(p)) fail(`${rel(html)} → ${ref} missing in dist`);
    else if (statSync(p).size === 0) fail(`${rel(html)} → ${ref} is empty`);
  }
}
if (assetRefs === 0) fail('no /GLITCH/_expo/ script references found in exported HTML');

const fonts = files.filter((f) => /PressStart2P.*\.(ttf|otf|woff2?)$/i.test(f));
if (fonts.length === 0) fail('Press Start 2P font file not found in dist/');
else if (fonts.every((f) => statSync(f).size === 0)) fail('Press Start 2P font file is empty');

const GAMES = { 1: ['m1g1', 'm1g2'], 2: ['m2g1', 'm2g2'], 3: ['m3g1', 'm3g2'], 4: ['m4g1', 'm4g2', 'm4g3'] };
const routes = ['welcome', 'settings', '+not-found'];
for (const [mod, games] of Object.entries(GAMES)) {
  routes.push(`module/${mod}/hero`, `module/${mod}/story`, `module/${mod}/complete`);
  for (const g of games) routes.push(`module/${mod}/game/${g}`);
}
for (const r of routes) {
  const ok = [`${r}.html`, `${r}/index.html`].some((p) => existsSync(join(DIST, p)));
  if (!ok) fail(`route not pre-rendered: /${r}`);
}

if (problems.length) {
  console.error(`check-export: FAILED (${problems.length})`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `check-export: OK — ${htmlFiles.length} HTML pages, ${assetRefs} /GLITCH/_expo/ asset refs, font ${rel(fonts[0])}, ${routes.length} routes pre-rendered, .nojekyll present`,
);
