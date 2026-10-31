// Publication and source shapes verified against the official v490 data index.
// This layer deliberately preserves unknown fields and does no normalization.
export const OFFICIAL_ROOT = 'https://cdn.projectgorgon.com/';

export const DATASETS = [
  { name: 'skills', required: true, shape: 'records' },
  { name: 'advancementtables', required: true, shape: 'advancement' },
  { name: 'abilities', required: true, shape: 'records' },
  { name: 'abilitykeywords', required: true, shape: 'keywords' },
  { name: 'abilitydynamicdots', required: false, shape: 'dots' },
  { name: 'abilitydynamicspecialvalues', required: false, shape: 'special' },
  { name: 'items', required: true, shape: 'records' },
  { name: 'tsysclientinfo', required: true, shape: 'records' },
  { name: 'tsysprofiles', required: true, shape: 'profiles' },
  { name: 'attributes', required: true, shape: 'records' },
  { name: 'effects', required: true, shape: 'records' },
  { name: 'sources_items', required: false, shape: 'sources' },
  { name: 'sources_abilities', required: false, shape: 'sources' },
] as const;

export type Dataset = (typeof DATASETS)[number];

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function versionName(input: string): string {
  const version = input.startsWith('v') ? input : `v${input}`;
  if (!/^v[A-Za-z0-9]+$/.test(version)) throw new Error(`Invalid upstream version: ${input}`);
  return version;
}

export function dataUrl(version: string, file: string): string {
  return `${OFFICIAL_ROOT}${versionName(version)}/data/${file}`;
}

// The CDN root publishes an HTML refresh/link to the current versioned index.
// No fallback version: discovery failure must not select an arbitrary snapshot.
export function discoverVersion(html: string): string {
  const references = [...html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]!);
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const kind = /\bhttp-equiv\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    if (kind?.toLowerCase() !== 'refresh') continue;
    const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    const target = content && /^\s*[0-9]+(?:\.[0-9]+)?\s*;\s*url\s*=\s*(.+?)\s*$/i.exec(content)?.[1];
    if (target) references.push(target.replace(/^(["'])(.*)\1$/, '$2'));
  }
  const versions = new Set<string>();
  for (const reference of references) {
    let url: URL;
    try { url = new URL(reference, OFFICIAL_ROOT); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'cdn.projectgorgon.com' ||
      url.port || url.username || url.password || url.search || url.hash) continue;
    const version = /^\/(v[A-Za-z0-9]+)\/data\/index\.html$/.exec(url.pathname)?.[1];
    if (version) versions.add(version);
  }
  if (versions.size !== 1) throw new Error('Official CDN discovery did not identify exactly one version');
  return [...versions][0]!;
}

export function publishedFiles(html: string, version: string): Set<string> {
  const files = new Set<string>();
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const url = new URL(match[1]!, dataUrl(version, 'index.html'));
    if (!url.pathname.endsWith('.json')) continue;
    // The index also links translation JSON in a subdirectory; it isn't an
    // acquisition target. Validate version/source references for our datasets.
    if (!DATASETS.some((dataset) => url.pathname.endsWith(`/${dataset.name}.json`))) continue;
    // Only direct children of this official version's data directory are data.
    const prefix = `/${versionName(version)}/data/`;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.hostname !== 'cdn.projectgorgon.com' || url.port || url.search || url.hash ||
      !url.pathname.startsWith(prefix) || url.pathname.slice(prefix.length).includes('/')) {
      throw new Error(`Mismatched version/source reference in official index: ${url.href}`);
    }
    files.add(url.pathname.slice(prefix.length));
  }
  for (const dataset of DATASETS) {
    if (dataset.required && !files.has(`${dataset.name}.json`)) {
      throw new Error(`Required dataset ${dataset.name}.json is missing from official ${version} index`);
    }
  }
  return files;
}

function stringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
}

export function validateDataset(dataset: Dataset, bytes: Uint8Array): number {
  let data: unknown;
  try {
    // TextDecoder honors UTF-8 BOM without changing the stored bytes.
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${dataset.name}.json: invalid UTF-8/JSON`, { cause: error });
  }
  const fail = (): never => { throw new Error(`${dataset.name}.json: unexpected source shape (${dataset.shape})`); };
  if (['keywords', 'dots', 'special'].includes(dataset.shape)) {
    if (!Array.isArray(data)) return fail();
    for (const row of data as unknown[]) {
      if (!isObject(row)) return fail();
      if (dataset.shape === 'keywords' && !stringArray(row.MustHaveAbilityKeywords)) return fail();
      if (dataset.shape === 'dots' && (!['DamagePerTick', 'Duration', 'NumTicks'].every((key) => typeof row[key] === 'number') ||
        typeof row.DamageType !== 'string')) return fail();
      if (dataset.shape === 'special' && (typeof row.Label !== 'string' || typeof row.Value !== 'number')) return fail();
    }
    if (dataset.required && data.length === 0) return fail();
    return data.length;
  }
  if (!isObject(data) || Object.keys(data).length === 0) return fail();
  const keyPrefix = { abilities: 'Ability', items: 'Item', effects: 'Effect',
    sources_items: 'item', sources_abilities: 'ability' }[dataset.name as string];
  if (keyPrefix && !Object.keys(data).every((key) => new RegExp(`^${keyPrefix}_[0-9]+$`, 'i').test(key))) return fail();
  for (const row of Object.values(data)) {
    if (dataset.shape === 'profiles') {
      if (!stringArray(row)) return fail();
      continue;
    }
    if (!isObject(row)) return fail();
    if (dataset.shape === 'advancement' && !Object.values(row).every(isObject)) return fail();
    if (dataset.shape === 'sources' && (!Array.isArray(row.entries) || !row.entries.every(isObject))) return fail();
  }
  return Object.keys(data).length;
}
