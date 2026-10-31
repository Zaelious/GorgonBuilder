import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DATASETS, OFFICIAL_ROOT, dataUrl, discoverVersion, isObject, publishedFiles,
  validateDataset, versionName,
} from '../src/data/adapters/official-source.ts';

export interface Integrity {
  sha256: string;
  bytes: number;
}

export interface DatasetManifest {
  name: string;
  required: boolean;
  sourceUrl: string;
  availability: 'available' | 'not-published';
  integrity?: Integrity;
  records?: number;
  reason?: string;
}

export interface Manifest {
  schemaVersion: 1;
  pipelineVersion: 1;
  upstreamVersion: string;
  fetchedAt: string;
  sourceIndex: Integrity & { sourceUrl: string };
  datasets: DatasetManifest[];
}

export interface UpdateOptions {
  rawDirectory: string;
  version?: string;
  latest?: boolean;
  check?: boolean;
  download?: (url: string) => Promise<Uint8Array>;
  now?: () => Date;
}

export function integrity(bytes: Uint8Array): Integrity {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

function checkIntegrity(bytes: Uint8Array, expected: Integrity, label: string): void {
  const actual = integrity(bytes);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`${label}: cache integrity failure (SHA-256/byte length mismatch)`);
  }
}

function validIntegrity(value: unknown): value is Integrity {
  return isObject(value) && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes > 0;
}

export function validateManifest(value: unknown): Manifest {
  const fail = (): never => { throw new Error('Invalid snapshot manifest: schema, version, source, or dataset metadata mismatch'); };
  if (!isObject(value) || value.schemaVersion !== 1 || value.pipelineVersion !== 1 ||
    typeof value.upstreamVersion !== 'string' || versionName(value.upstreamVersion) !== value.upstreamVersion ||
    typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt)) ||
    !validIntegrity(value.sourceIndex) || !isObject(value.sourceIndex) ||
    value.sourceIndex.sourceUrl !== dataUrl(value.upstreamVersion, 'index.html') ||
    !Array.isArray(value.datasets) || value.datasets.length !== DATASETS.length) return fail();
  for (const dataset of DATASETS) {
    const entries = (value.datasets as unknown[]).filter((row) => isObject(row) && row.name === dataset.name);
    const entry = entries[0];
    if (entries.length !== 1 || !isObject(entry) || entry.required !== dataset.required ||
      entry.sourceUrl !== dataUrl(value.upstreamVersion, `${dataset.name}.json`)) return fail();
    if (entry.availability === 'available') {
      if (!validIntegrity(entry.integrity) || typeof entry.records !== 'number' ||
        !Number.isSafeInteger(entry.records) || entry.records < (dataset.required ? 1 : 0) || entry.reason !== undefined) return fail();
    } else if (entry.availability !== 'not-published' || dataset.required ||
      entry.reason !== 'Not listed in the official versioned data index' ||
      entry.integrity !== undefined || entry.records !== undefined) return fail();
  }
  return value as unknown as Manifest;
}

async function optionalRead(path: string): Promise<Buffer | undefined> {
  try { return await readFile(path); } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readManifest(path: string): Promise<Manifest | undefined> {
  const bytes = await optionalRead(path);
  if (bytes === undefined) return undefined;
  try { return validateManifest(JSON.parse(bytes.toString('utf8'))); } catch (error) {
    throw new Error(`Cannot trust manifest ${path}`, { cause: error });
  }
}

function serialized(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  if ((await optionalRead(path))?.toString('utf8') === content) return;
  const temporary = `${path}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export async function validateCache(directory: string, manifest: Manifest): Promise<void> {
  const requiredRead = async (file: string): Promise<Buffer> => {
    const bytes = await optionalRead(join(directory, file));
    if (bytes === undefined) throw new Error(`Missing cached file ${file} in ${directory}; remove this version's cache directory and rerun to restore the pinned bytes`);
    return bytes;
  };
  const index = await requiredRead('index.html');
  checkIntegrity(index, manifest.sourceIndex, 'index.html');
  const files = publishedFiles(index.toString('utf8'), manifest.upstreamVersion);
  for (const dataset of DATASETS) {
    const entry = manifest.datasets.find((item) => item.name === dataset.name)!;
    if (files.has(`${dataset.name}.json`) !== (entry.availability === 'available')) {
      throw new Error(`${dataset.name}: availability does not match cached official index`);
    }
    if (entry.availability === 'not-published') continue;
    const bytes = await requiredRead(`${dataset.name}.json`);
    checkIntegrity(bytes, entry.integrity!, `${dataset.name}.json`);
    if (validateDataset(dataset, bytes) !== entry.records) throw new Error(`${dataset.name}: record count mismatch`);
  }
}

// The CLI enables Node's environment proxy support with --use-env-proxy.
// Redirects are refused: a versioned URL must never quietly become another version.
export async function downloadOfficial(url: string): Promise<Uint8Array> {
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Content-Length describes compressed bytes when Content-Encoding is present.
    const length = response.headers.get('content-length');
    if (length !== null && !response.headers.has('content-encoding') && Number(length) !== bytes.byteLength) {
      throw new Error('Incomplete response (Content-Length mismatch)');
    }
    if (bytes.byteLength === 0) throw new Error('Empty response');
    return bytes;
  } catch (error) {
    throw new Error(`Failed to download ${url}; no dataset has been marked unpublished`, { cause: error });
  }
}

export function selectVersion(pin: Manifest | undefined, requested: string | undefined, discovered?: string): string {
  if (requested !== undefined) return versionName(requested);
  if (discovered !== undefined) return versionName(discovered);
  if (pin) return pin.upstreamVersion;
  throw new Error('A version must be discovered before creating the first pin');
}

export async function updateSnapshot(options: UpdateOptions): Promise<{ manifest: Manifest; reused: boolean }> {
  if (options.latest && options.version !== undefined) throw new Error('--latest and --version are mutually exclusive');
  if (options.check && (options.latest || options.version !== undefined)) throw new Error('--check only validates the current pin');
  const download = options.download ?? downloadOfficial;
  const cacheRoot = join(options.rawDirectory, 'cache');
  await mkdir(cacheRoot, { recursive: true });
  const lock = join(cacheRoot, '.update-lock');
  try { await mkdir(lock); } catch (error) {
    throw new Error(`Snapshot update is locked (${lock}); if an earlier process was interrupted, remove the lock after confirming it has stopped`, { cause: error });
  }
  let staging: string | undefined;
  try {
    const pinPath = join(options.rawDirectory, 'snapshot.json');
    const pin = await readManifest(pinPath);
    if (options.check && !pin) throw new Error('No pinned snapshot to check');
    let discovered: string | undefined;
    if (options.latest || (!pin && options.version === undefined)) {
      discovered = discoverVersion(new TextDecoder().decode(await download(OFFICIAL_ROOT)));
    }
    const version = selectVersion(pin, options.version, discovered);
    const directory = join(cacheRoot, version);
    const cached = await readManifest(join(directory, 'manifest.json'));
    const expected = pin?.upstreamVersion === version ? pin : cached;
    if (cached) {
      if (expected && serialized(expected) !== serialized(cached)) throw new Error('Pinned manifest differs from cache manifest');
      await validateCache(directory, cached);
      if (!options.check) await atomicWrite(pinPath, serialized(cached));
      return { manifest: cached, reused: true };
    }
    // A partial directory must never be accepted or silently repaired/re-pinned.
    try {
      await mkdir(directory);
      await rm(directory, { recursive: true });
    } catch (error) {
      if (isObject(error) && error.code === 'EEXIST') throw new Error(`Missing cache manifest in ${directory}; remove this incomplete cache directory and rerun`, { cause: error });
      throw error;
    }
    if (options.check) throw new Error(`Missing cached snapshot ${version}`);
    staging = await mkdtemp(join(cacheRoot, `.${version}-`));
    const index = await download(dataUrl(version, 'index.html'));
    if (expected) checkIntegrity(index, expected.sourceIndex, 'Downloaded pinned index.html');
    const files = publishedFiles(new TextDecoder().decode(index), version);
    await writeFile(join(staging, 'index.html'), index);
    const datasets: DatasetManifest[] = [];
    for (const dataset of DATASETS) {
      const sourceUrl = dataUrl(version, `${dataset.name}.json`);
      if (!files.has(`${dataset.name}.json`)) {
        datasets.push({ name: dataset.name, required: dataset.required, sourceUrl,
          availability: 'not-published', reason: 'Not listed in the official versioned data index' });
        continue;
      }
      const bytes = await download(sourceUrl);
      const records = validateDataset(dataset, bytes);
      const entry: DatasetManifest = { name: dataset.name, required: dataset.required, sourceUrl,
        availability: 'available', integrity: integrity(bytes), records };
      const pinned = expected?.datasets.find((item) => item.name === dataset.name);
      if (pinned?.integrity) checkIntegrity(bytes, pinned.integrity, `Downloaded pinned ${dataset.name}.json`);
      await writeFile(join(staging, `${dataset.name}.json`), bytes);
      datasets.push(entry);
    }
    const manifest: Manifest = expected ?? {
      schemaVersion: 1, pipelineVersion: 1, upstreamVersion: version,
      fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
      sourceIndex: { sourceUrl: dataUrl(version, 'index.html'), ...integrity(index) }, datasets,
    };
    validateManifest(manifest);
    await validateCache(staging, manifest);
    await writeFile(join(staging, 'manifest.json'), serialized(manifest));
    await rename(staging, directory);
    staging = undefined;
    await atomicWrite(pinPath, serialized(manifest));
    return { manifest, reused: false };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
