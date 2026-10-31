// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATASETS, OFFICIAL_ROOT, dataUrl, discoverVersion, publishedFiles, validateDataset, versionName } from '../src/data/adapters/official-source.ts';
import { downloadOfficial, integrity, selectVersion, updateSnapshot, validateManifest } from './snapshot.ts';
import { parseArguments } from './data-update.ts';

const fixtures: Record<string, unknown> = JSON.parse(await readFile(new URL('./fixtures/source-shapes.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const bytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const index = (omit: string[] = []): Buffer => Buffer.from(DATASETS.filter((entry) => !omit.includes(entry.name))
  .map((entry) => `<a href="${entry.name}.json">${entry.name}</a>`).join('\n') + '<a href="Translation/strings_skills.json">translation</a>');
const fixedDate = new Date('2026-10-31T19:00:00.000Z');

let rawDirectory: string;
let responses: Map<string, Uint8Array>;
let download: ReturnType<typeof vi.fn<(url: string) => Promise<Uint8Array>>>;

beforeEach(async () => {
  rawDirectory = await mkdtemp(join(tmpdir(), 'gorgon-snapshot-test-'));
  responses = new Map([[OFFICIAL_ROOT, Buffer.from('<meta http-equiv="refresh" content="0;url=http://cdn.projectgorgon.com/v490/data/index.html">')]]);
  for (const version of ['v490', 'v491']) {
    responses.set(dataUrl(version, 'index.html'), index());
    for (const entry of DATASETS) responses.set(dataUrl(version, `${entry.name}.json`), bytes(fixtures[entry.name]));
  }
  download = vi.fn(async (url: string) => {
    const body = responses.get(url);
    if (!body) throw new Error(`HTTP 404: ${url}`);
    return body;
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(rawDirectory, { recursive: true, force: true });
});

async function update(options: { version?: string; latest?: boolean; check?: boolean } = {}) {
  return updateSnapshot({ rawDirectory, download, now: () => fixedDate, ...options });
}

describe('official version and publication selection', () => {
  it('accepts explicit numeric/alphanumeric versions and rejects path traversal', () => {
    expect(versionName('490')).toBe('v490');
    expect(versionName('vTest1')).toBe('vTest1');
    for (const input of ['../v490', '', 'v490/data', '490?x=1']) expect(() => versionName(input)).toThrow();
    expect(selectVersion(undefined, '490')).toBe('v490');
    expect(() => selectVersion(undefined, undefined)).toThrow();
  });

  it('requires exactly one discovered version', () => {
    expect(discoverVersion('<a href="http://cdn.projectgorgon.com/v490/data/index.html">latest</a>')).toBe('v490');
    expect(() => discoverVersion('an error page')).toThrow();
    expect(() => discoverVersion('/v490/data/index.html /v491/data/index.html')).toThrow();
  });

  it('discovers and pins once, then reuses without any network or writes', async () => {
    const first = await update();
    expect(first.reused).toBe(false);
    expect(first.manifest.upstreamVersion).toBe('v490');
    const pinPath = join(rawDirectory, 'snapshot.json');
    const cachePath = join(rawDirectory, 'cache/v490/skills.json');
    const initialPin = await readFile(pinPath);
    const pinStat = await stat(pinPath);
    const rawStat = await stat(cachePath);
    download.mockClear();
    responses.set(OFFICIAL_ROOT, Buffer.from('/v491/data/index.html'));
    const second = await update();
    expect(download).not.toHaveBeenCalled();
    expect(second).toEqual({ manifest: first.manifest, reused: true });
    expect(await readFile(pinPath)).toEqual(initialPin);
    expect((await stat(pinPath)).mtimeMs).toBe(pinStat.mtimeMs);
    expect((await stat(cachePath)).mtimeMs).toBe(rawStat.mtimeMs);
    await update({ check: true });
    expect(download).not.toHaveBeenCalled();
  });

  it('only changes version by explicit request/latest, and can switch back to cached data', async () => {
    await update({ version: '490' });
    expect(download).not.toHaveBeenCalledWith(OFFICIAL_ROOT);
    responses.set(OFFICIAL_ROOT, Buffer.from('/v491/data/index.html'));
    expect((await update({ latest: true })).manifest.upstreamVersion).toBe('v491');
    download.mockClear();
    expect((await update({ version: 'v490' })).reused).toBe(true);
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects invalid arguments and contradictory options', async () => {
    expect(parseArguments(['--version', '490'])).toEqual({ version: '490' });
    for (const args of [['--version'], ['--foo'], ['--latest', '--latest']]) expect(() => parseArguments(args)).toThrow();
    await expect(update({ latest: true, version: '490' })).rejects.toThrow('mutually exclusive');
    await expect(update({ check: true, latest: true })).rejects.toThrow('--check');
    await expect(update({ check: true })).rejects.toThrow('No pinned snapshot');
  });

  it('rejects missing required index entries and mismatched version/source links', () => {
    expect(() => publishedFiles(index(['skills']).toString(), 'v490')).toThrow('skills.json');
    for (const link of ['https://cdn.projectgorgon.com/v491/data/skills.json', 'https://example.com/v490/data/skills.json']) {
      expect(() => publishedFiles(`<a href="${link}">wrong</a>${index()}`, 'v490')).toThrow('Mismatched');
    }
  });
});

describe('manifest and raw cache trust', () => {
  it('records canonical URLs, original byte hashes/counts, timestamps, and required flags', async () => {
    const { manifest } = await update();
    expect(validateManifest(manifest)).toEqual(manifest);
    expect(manifest.fetchedAt).toBe(fixedDate.toISOString());
    expect(manifest.sourceIndex).toEqual({ sourceUrl: dataUrl('v490', 'index.html'), ...integrity(index()) });
    for (const entry of manifest.datasets) {
      expect(entry.availability).toBe('available');
      expect(entry.sourceUrl).toBe(dataUrl('v490', `${entry.name}.json`));
      expect(entry.integrity).toEqual(integrity(bytes(fixtures[entry.name])));
      expect(await readFile(join(rawDirectory, 'cache/v490', `${entry.name}.json`))).toEqual(bytes(fixtures[entry.name]));
    }
  });

  it('represents unpublished optional data, but fails on a published optional download failure', async () => {
    responses.set(dataUrl('v490', 'index.html'), index(['abilitydynamicdots', 'sources_items']));
    const { manifest } = await update();
    expect(manifest.datasets.find((entry) => entry.name === 'abilitydynamicdots')).toMatchObject({ availability: 'not-published' });
    expect(download).not.toHaveBeenCalledWith(dataUrl('v490', 'abilitydynamicdots.json'));
    responses.delete(dataUrl('v491', 'abilitydynamicdots.json'));
    await expect(update({ version: '491' })).rejects.toThrow('HTTP 404');
    expect(JSON.parse(await readFile(join(rawDirectory, 'snapshot.json'), 'utf8'))).toEqual(manifest);
  });

  it.each(['datasets', 'source', 'version', 'hash', 'timestamp', 'required', 'availability', 'duplicate'])('rejects corrupt manifest metadata: %s', async (field) => {
    const { manifest } = await update();
    const corrupt = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    if (field === 'datasets') corrupt.datasets.pop();
    if (field === 'source') corrupt.datasets[0]!.sourceUrl = dataUrl('v491', 'skills.json');
    if (field === 'version') corrupt.upstreamVersion = '../v490';
    if (field === 'hash') corrupt.datasets[0]!.integrity!.sha256 = 'bad';
    if (field === 'timestamp') corrupt.fetchedAt = 'bad';
    if (field === 'required') corrupt.datasets[0]!.required = false;
    if (field === 'availability') corrupt.datasets[0]!.availability = 'not-published';
    if (field === 'duplicate') corrupt.datasets[1] = corrupt.datasets[0]!;
    expect(() => validateManifest(corrupt)).toThrow();
    await writeFile(join(rawDirectory, 'snapshot.json'), JSON.stringify(corrupt));
    download.mockClear();
    await expect(update()).rejects.toThrow('Cannot trust manifest');
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['skills.json', 'index.html', 'manifest.json'])('fails clearly on missing cached %s without downloading', async (file) => {
    await update();
    await rm(join(rawDirectory, 'cache/v490', file));
    download.mockClear();
    await expect(update()).rejects.toThrow(/Missing cache/);
    expect(download).not.toHaveBeenCalled();
  });

  it('fails on tampered cache bytes and preserves the pin', async () => {
    await update();
    const original = await readFile(join(rawDirectory, 'snapshot.json'));
    await writeFile(join(rawDirectory, 'cache/v490/skills.json'), bytes({ OtherSkill: {} }));
    download.mockClear();
    await expect(update()).rejects.toThrow('integrity failure');
    expect(download).not.toHaveBeenCalled();
    expect(await readFile(join(rawDirectory, 'snapshot.json'))).toEqual(original);
  });

  it('rehydrates an absent cache against the committed pin, preserving manifest bytes', async () => {
    await update();
    const pin = await readFile(join(rawDirectory, 'snapshot.json'));
    await rm(join(rawDirectory, 'cache/v490'), { recursive: true });
    download.mockClear();
    expect((await update()).reused).toBe(false);
    expect(download).not.toHaveBeenCalledWith(OFFICIAL_ROOT);
    expect(await readFile(join(rawDirectory, 'snapshot.json'))).toEqual(pin);
  });

  it('refuses republished bytes of a pinned version during rehydration', async () => {
    await update();
    await rm(join(rawDirectory, 'cache/v490'), { recursive: true });
    responses.set(dataUrl('v490', 'skills.json'), bytes({ ChangedSkill: {} }));
    await expect(update()).rejects.toThrow('integrity failure');
    expect(await readdir(join(rawDirectory, 'cache'))).toEqual([]);
  });

  it('preserves the previous pin and cleans staging on failed acquisition', async () => {
    await update();
    const pin = await readFile(join(rawDirectory, 'snapshot.json'));
    responses.delete(dataUrl('v491', 'skills.json'));
    await expect(update({ version: '491' })).rejects.toThrow('HTTP 404');
    expect(await readFile(join(rawDirectory, 'snapshot.json'))).toEqual(pin);
    expect(await readdir(join(rawDirectory, 'cache'))).toEqual(['v490']);
  });

  it.each(['missing-required', 'invalid-json', 'invalid-shape'])('never pins an untrustworthy first acquisition: %s', async (failure) => {
    if (failure === 'missing-required') responses.set(dataUrl('v490', 'index.html'), index(['items']));
    if (failure === 'invalid-json') responses.set(dataUrl('v490', 'items.json'), Buffer.from('{'));
    if (failure === 'invalid-shape') responses.set(dataUrl('v490', 'items.json'), bytes([]));
    await expect(update()).rejects.toThrow();
    await expect(readFile(join(rawDirectory, 'snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(join(rawDirectory, 'cache'))).toEqual([]);
  });

  it('rejects concurrent acquisition without deleting the active lock', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => {
      download.mockImplementationOnce(async () => {
        resolve();
        await pending;
        return Buffer.from('/v490/data/index.html');
      });
    });
    const first = update();
    await started;
    try {
      await expect(update()).rejects.toThrow('locked');
      expect(await readdir(join(rawDirectory, 'cache'))).toContain('.update-lock');
    } finally { release!(); }
    await first;
  });

  it('rejects an altered cached manifest that conflicts with the pin', async () => {
    const { manifest } = await update();
    manifest.fetchedAt = '2026-11-01T00:00:00.000Z';
    await writeFile(join(rawDirectory, 'cache/v490/manifest.json'), JSON.stringify(manifest));
    await expect(update()).rejects.toThrow('Pinned manifest differs');
  });
});

describe('verified source shapes', () => {
  it.each(DATASETS)('accepts the $name fixture without changing identifiers or unknown content', (dataset) => {
    const raw = bytes(fixtures[dataset.name]);
    expect(validateDataset(dataset, raw)).toBeGreaterThan(0);
    expect(raw).toEqual(bytes(fixtures[dataset.name]));
  });

  it.each(DATASETS)('rejects invalid JSON and incorrect top-level shape in $name', (dataset) => {
    expect(() => validateDataset(dataset, Buffer.from('{'))).toThrow('invalid UTF-8/JSON');
    expect(() => validateDataset(dataset, bytes(null))).toThrow('unexpected source shape');
    const wrong = ['keywords', 'dots', 'special'].includes(dataset.shape) ? {} : [];
    expect(() => validateDataset(dataset, bytes(wrong))).toThrow('unexpected source shape');
  });

  it('rejects malformed array entries, profiles, advancement tables, sources and empty required maps', () => {
    const corrupt: Record<string, unknown> = {
      skills: {}, advancementtables: { Table: { Level_01: 1 } },
      abilitykeywords: [{}], abilitydynamicdots: [{ DamageType: 'Poison' }],
      abilitydynamicspecialvalues: [{ Label: 'Restores' }], tsysprofiles: { All: {} },
      sources_items: { item_1: { entries: 'bad' } }, abilities: { error: {} },
    };
    for (const [name, data] of Object.entries(corrupt)) {
      expect(() => validateDataset(DATASETS.find((entry) => entry.name === name)!, bytes(data))).toThrow('unexpected source shape');
    }
  });

  it('accepts a UTF-8 BOM while hashing and preserving the original bytes', () => {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(fixtures.skills)]);
    expect(validateDataset(DATASETS[0], bom)).toBe(1);
    expect(integrity(bom)).not.toEqual(integrity(bytes(fixtures.skills)));
  });
});

describe('HTTP transport failures', () => {
  it.each([403, 404, 500])('does not convert HTTP %s into unpublished data', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('failed', { status })));
    await expect(downloadOfficial(dataUrl('v490', 'skills.json'))).rejects.toThrow('no dataset has been marked unpublished');
  });

  it('rejects truncated responses and refuses redirects', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { headers: { 'content-length': '100' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadOfficial(dataUrl('v490', 'skills.json'))).rejects.toThrow('Failed to download');
    expect(fetchMock).toHaveBeenCalledWith(dataUrl('v490', 'skills.json'), expect.objectContaining({ redirect: 'error' }));
  });
});
