import react from '@vitejs/plugin-react';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const artifactNames = ['progression', 'abilities', 'itemsTreasure'];

/** Serve gzip files as bytes; Sirv otherwise marks them for transparent HTTP decoding. */
function serveArtifacts(files: Map<string, string>): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://vite.local');
    const file = files.get(url.pathname);
    // Leave Vite's ?url/?import/?raw module transformations to Vite.
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD') ||
      ['url', 'import', 'raw'].some(key => url.searchParams.has(key))) return next();
    void readFile(file).then(bytes => {
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Length': bytes.byteLength,
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    }, next);
  };
}

function compressedGameData(): Plugin {
  return {
    name: 'compressed-game-data',
    configureServer(server) {
      const prefix = `${server.config.base}src/generated/game-data/`;
      server.middlewares.use(serveArtifacts(new Map(artifactNames.map(name => [
        `${prefix}${name}.json.gz`, resolve(server.config.root, `src/generated/game-data/${name}.json.gz`),
      ]))));
    },
    async configurePreviewServer(server) {
      const { root, base, build } = server.config;
      const directory = resolve(root, build.outDir, build.assetsDir);
      // Discover Vite's emitted hashes, restricting handling to these three asset names.
      const files = (await readdir(directory)).filter(file =>
        artifactNames.some(name => file.startsWith(`${name}.json-`)) && file.endsWith('.gz'));
      server.middlewares.use(serveArtifacts(new Map(files.map(file => [
        `${base}${build.assetsDir}/${file}`, resolve(directory, file),
      ]))));
    },
  };
}

export default defineConfig({
  plugins: [react(), compressedGameData()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
