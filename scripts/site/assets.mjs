import { cpSync, existsSync, mkdirSync, readdirSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

/** Website recordings never enter the desktop bundle. The dev server uses the same cache. */
export function siteAssets(site) {
  let root, out;
  return {
    name: 'zeppbridge-site-assets',
    configResolved(config) { root = config.root; out = resolve(root, config.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (!pathname.startsWith('/landing/media/')) return next();
        const name = pathname.slice('/landing/media/'.length);
        if (!/^[\w.-]+$/.test(name)) { res.statusCode = 404; return res.end(); }
        const file = join(root, '.site-cache/media', name);
        if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.webp') ? 'image/webp' : 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
      // publicDir is disabled to avoid Vite copying site media into the desktop.
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (!/^\/(favicon\.png|zeppbridge-icon\.png|landing\/fonts\/[\w.-]+)$/.test(pathname)) return next();
        const file = join(root, 'public', pathname.slice(1));
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', pathname.endsWith('.woff2') ? 'font/woff2' : 'image/png');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      mkdirSync(out, { recursive: true });
      const publicRoot = join(root, 'public');
      for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
        if (entry.name === 'landing') {
          if (site && existsSync(join(publicRoot, 'landing/fonts'))) cpSync(join(publicRoot, 'landing/fonts'), join(out, 'landing/fonts'), { recursive: true });
        } else cpSync(join(publicRoot, entry.name), join(out, entry.name), { recursive: true });
      }
      if (site) {
        if (!existsSync(join(root, '.site-cache/media/manifest.json'))) throw new Error('Run npm run build:web to generate current website media first.');
        cpSync(join(root, '.site-cache/media'), join(out, 'landing/media'), { recursive: true });
      }
    },
  };
}
