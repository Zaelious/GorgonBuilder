// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build, createServer, preview } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import type { GameDataManifest, RuntimeGameData } from '../src/data/repository/contracts';
import { decodeArtifact } from '../src/data/repository/load';
import { createGameDataRepository } from '../src/data/repository/repository';

const root = resolve(import.meta.dirname, '..');
const configFile = resolve(root, 'vite.config.ts');
const directory = resolve(root, 'src/generated/game-data');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as GameDataManifest;
const servers: (ViteDevServer | PreviewServer)[] = [];
const urls: Record<string, string> = {};
let temporary: string;
let emitted: string[];

beforeAll(async () => {
  temporary = await mkdtemp(resolve(tmpdir(), 'gorgon-vite-'));
  const publicDir = resolve(temporary, 'public');
  await mkdir(publicDir);
  await writeFile(resolve(publicDir, 'unrelated.json.gz'), gzipSync('{"unrelated":true}'));
  await writeFile(resolve(publicDir, 'plain.txt'), 'ordinary static asset');
  const outDir = resolve(temporary, 'dist');
  const common = { root, configFile, publicDir, logLevel: 'silent' as const };
  await build({ ...common, build: { outDir, emptyOutDir: true } });
  emitted = await readdir(resolve(outDir, 'assets'));
  const dev = await createServer({ ...common, server: { host: '127.0.0.1', port: 0 } });
  servers.push(dev);
  await dev.listen();
  const built = await preview({ ...common, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  servers.push(built);
  urls.dev = dev.resolvedUrls!.local[0]!;
  urls.preview = built.resolvedUrls!.local[0]!;
}, 30_000);

afterAll(async () => {
  await Promise.all(servers.map(server => server.close()));
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

for (const mode of ['dev', 'preview']) describe(`Vite ${mode} transport`, () => {
  function artifactPath(name: string) {
    return mode === 'dev' ? `src/generated/game-data/${name}.json.gz` :
      `assets/${emitted.find(file => file.startsWith(`${name}.json-`) && file.endsWith('.gz'))!}`;
  }

  it('loads all three original compressed artifacts into the unchanged repository', async () => {
    const entries = [];
    for (const [name, expected] of Object.entries(manifest.artifacts)) {
      const response = await fetch(new URL(artifactPath(name), urls[mode]));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/gzip');
      expect(response.headers.has('content-encoding')).toBe(false);
      expect(response.headers.get('content-length')).toBe(String(expected.bytes));
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.byteLength).toBe(expected.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256);
      entries.push([name, await decodeArtifact(bytes, expected)]);
      const corrupt = bytes.slice();
      corrupt[20] = corrupt[20]! ^ 1;
      await expect(decodeArtifact(corrupt, expected)).rejects.toThrow('SHA-256 mismatch');
    }
    const repository = createGameDataRepository(Object.fromEntries(entries) as RuntimeGameData, manifest);
    expect(repository.getSkill('Psychology')?.id).toBe('Psychology');
    expect(repository.getAbility('ability_1201')?.internalName).toBe('Psychoanalyze1');
    expect(repository.getItem('item_45640')?.id).toBe('item_45640');
  }, 15_000);

  it('handles HEAD and cache-busting queries without decoding', async () => {
    const response = await fetch(new URL(`${artifactPath('abilities')}?t=123`, urls[mode]), { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/gzip');
    expect(response.headers.has('content-encoding')).toBe(false);
    expect(response.headers.get('content-length')).toBe(String(manifest.artifacts.abilities.bytes));
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('preserves HTML, JavaScript, CSS and unrelated static gzip handling', async () => {
    const html = await fetch(urls[mode]!);
    expect(html.headers.get('content-type')).toContain('text/html');
    const jsPath = mode === 'dev' ? 'src/main.tsx' : `assets/${emitted.find(file => /^index-.*\.js$/.test(file))!}`;
    const js = await fetch(new URL(jsPath, urls[mode]));
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    const cssPath = mode === 'dev' ? 'src/styles/global.css?direct' : `assets/${emitted.find(file => file.endsWith('.css'))!}`;
    const css = await fetch(new URL(cssPath, urls[mode]));
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await (await fetch(new URL('plain.txt', urls[mode]))).text()).toBe('ordinary static asset');
    const unrelated = await fetch(new URL('unrelated.json.gz', urls[mode]));
    expect(unrelated.headers.get('content-encoding')).toBe('gzip');
    expect(await unrelated.json()).toEqual({ unrelated: true });
  });
});

it('leaves Vite development URL imports as JavaScript modules', async () => {
  const response = await fetch(new URL('src/generated/game-data/abilities.json.gz?import&url', urls.dev));
  expect(response.headers.get('content-type')).toMatch(/javascript/);
  expect(await response.text()).toContain('export default "/src/generated/game-data/abilities.json.gz"');
});
