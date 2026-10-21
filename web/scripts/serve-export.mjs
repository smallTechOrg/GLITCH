#!/usr/bin/env node
// Serve web/dist exactly like GitHub Pages serves https://<org>.github.io/GLITCH/ (node:http, no deps).
//   /                → 302 /GLITCH/
//   /GLITCH          → 301 /GLITCH/
//   /GLITCH/<path>   → dist/<path> | dist/<path>.html | dist/<path>/index.html
//   anything else    → 404 with dist/404.html or dist/+not-found.html (the SPA deep-link
//                      fallback: the router boots and renders the requested route client-side)
// Env: GLITCH_WEB_PORT (default 8090), GLITCH_WEB_HOST (default 127.0.0.1; 0.0.0.0 for LAN),
//      GLITCH_WEB_DIST (default `dist`, relative to web/ or absolute — e.g. `dist-e2e`, the
//      export the E2E run builds so it never overwrites a `dist` another server is serving).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), process.env.GLITCH_WEB_DIST || 'dist');
const BASE = '/GLITCH';
const PORT = Number(process.env.GLITCH_WEB_PORT ?? 8090);
const HOST = process.env.GLITCH_WEB_HOST ?? '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`serve-export: ${ROOT}/index.html not found. Run: cd web && npx expo export --platform web${process.env.GLITCH_WEB_DIST ? ` --output-dir ${process.env.GLITCH_WEB_DIST}` : ''}`);
  process.exit(1);
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Map a URL path under /GLITCH/ to a file in dist, or null. Never escapes dist. */
export function resolveFile(rel) {
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const clean = normalize(decoded).replace(/^([/\\])+/, '');
  const abs = resolve(ROOT, clean);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  const candidates = clean === '' || clean.endsWith('/') ? [join(abs, 'index.html')] : [abs, `${abs}.html`, join(abs, 'index.html')];
  return candidates.find(isFile) ?? null;
}

function send(res, status, file, method) {
  const body = readFileSync(file);
  res.writeHead(status, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(method === 'HEAD' ? undefined : body);
}

function notFound(res, method) {
  const page = [join(ROOT, '404.html'), join(ROOT, '+not-found.html')].find(isFile);
  if (page) return send(res, 404, page, method);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  if (path === '/') {
    res.writeHead(302, { Location: `${BASE}/` });
    res.end();
    return;
  }
  if (path === BASE) {
    res.writeHead(301, { Location: `${BASE}/${url.search}` });
    res.end();
    return;
  }
  if (!path.startsWith(`${BASE}/`)) return notFound(res, method);
  const file = resolveFile(path.slice(BASE.length + 1) || '');
  if (file) return send(res, 200, file, method);
  return notFound(res, method);
});

server.listen(PORT, HOST, () => {
  console.log(`serve-export: http://${HOST}:${PORT}${BASE}/ → ${ROOT}`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
