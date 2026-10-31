import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DATASETS } from '../src/data/adapters/official-source.ts';
import type { Dataset } from '../src/data/adapters/official-source.ts';
import { normalizeProgression } from '../src/data/adapters/normalize-progression.ts';
import { normalizeAbilities } from '../src/data/adapters/normalize-abilities.ts';
import { normalizeItemsTreasure } from '../src/data/adapters/normalize-items-treasure.ts';
import { countGameData } from '../src/data/repository/contracts.ts';
import type { ArtifactName, GameData, GameDataDiagnostic, GameDataManifest, RuntimeGameData } from '../src/data/repository/contracts.ts';
import { canonicalJson, requireIntegrity, validateGameData, validateManifestCounts } from '../src/data/repository/integrity.ts';
import { integrity, validateCache, validateManifest } from './snapshot.ts';
import type { Manifest } from './snapshot.ts';

export type RawData = Record<Dataset['name'], unknown>;
export interface PinnedInput { readonly pin: Manifest; readonly snapshotSha256: string; readonly raw: RawData }

/** JSON.parse cannot report duplicate keys. Scan valid JSON tokens before accepting it. */
export function parseUniqueJson(text: string, label: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { throw new Error(`${label}: invalid JSON; restore the pinned source bytes`, { cause: error }); }
  const stack: (Set<string> | null)[] = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]]/g)) {
    const token = match[0];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (/^\s*:/.test(text.slice(match.index + token.length))) {
      const keys = stack.at(-1);
      const key = JSON.parse(token) as string;
      requireIntegrity(keys && !keys.has(key), label, `duplicate JSON key/ID ${key}`);
      keys.add(key);
    }
  }
  return parsed;
}

export async function readPinnedInput(rawDirectory: string): Promise<PinnedInput> {
  const pinBytes = await readFile(join(rawDirectory, 'snapshot.json'));
  const pin = validateManifest(parseUniqueJson(pinBytes.toString('utf8'), 'snapshot.json'));
  const directory = join(rawDirectory, 'cache', pin.upstreamVersion);
  const cached = validateManifest(parseUniqueJson(await readFile(join(directory, 'manifest.json'), 'utf8'), 'cache/manifest.json'));
  requireIntegrity(canonicalJson(pin) === canonicalJson(cached), 'snapshot.json', 'pinned manifest differs from cached manifest');
  await validateCache(directory, pin);
  const raw = {} as RawData;
  for (const dataset of DATASETS) {
    const entry = pin.datasets.find(r => r.name === dataset.name)!;
    requireIntegrity(entry.availability === 'available' && entry.integrity, dataset.name,
      'not published in this pin; normalization schema 1 requires this supporting dataset. Review compatibility before generating');
    const bytes = await readFile(join(directory, `${dataset.name}.json`));
    requireIntegrity(canonicalJson(integrity(bytes)) === canonicalJson(entry.integrity), dataset.name, 'SHA-256/byte length mismatch; restore the pinned bytes');
    raw[dataset.name] = parseUniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), dataset.name);
  }
  return { pin, raw, snapshotSha256: integrity(pinBytes).sha256 };
}

export function normalizePinnedInput(input: PinnedInput): GameData {
  function source<N extends Dataset['name']>(dataset: N) {
    const entry = input.pin.datasets.find(r => r.name === dataset)!;
    return { dataset, gameDataVersion: input.pin.upstreamVersion, sourceUrl: entry.sourceUrl, sha256: entry.integrity!.sha256 };
  }
  const { raw } = input;
  const progression = normalizeProgression({ ...raw, sources: {
    skills: source('skills'), advancementtables: source('advancementtables'),
    attributes: source('attributes'), effects: source('effects'),
  } });
  const abilities = normalizeAbilities({ ...raw, progression, sources: {
    abilities: source('abilities'), abilitykeywords: source('abilitykeywords'), abilitydynamicdots: source('abilitydynamicdots'),
    abilitydynamicspecialvalues: source('abilitydynamicspecialvalues'), sources_abilities: source('sources_abilities'),
  } });
  const itemsTreasure = normalizeItemsTreasure({ ...raw, progression, sources: {
    items: source('items'), tsysclientinfo: source('tsysclientinfo'), tsysprofiles: source('tsysprofiles'), sources_items: source('sources_items'),
  } });
  return { progression, abilities, itemsTreasure };
}

/** Exact key coverage rather than only lengths: a replaced ID must fail too. */
export function validateCoverage(data: GameData, raw: RawData): void {
  const { progression: p, abilities: a, itemsTreasure: t } = data;
  const rows = [
    ['skills', p.skills], ['advancementtables', p.advancementTables], ['attributes', p.attributes], ['effects', p.effects],
    ['abilities', a.abilities], ['items', t.items], ['tsysclientinfo', t.treasurePowers], ['tsysprofiles', t.treasureProfiles],
    ['sources_abilities', a.acquisitionSources], ['sources_items', t.acquisitionSources],
  ] as const;
  for (const [dataset, records] of rows) {
    const source = raw[dataset] as Record<string, unknown>;
    const ids = records.map(r => r.source.recordId);
    if (dataset === 'items') ids.push(...t.nonEquipmentItemIds);
    requireIntegrity(canonicalJson([...ids].sort()) === canonicalJson(Object.keys(source).sort()), dataset, 'raw-to-normalized ID coverage mismatch');
    for (const record of records) requireIntegrity(record.source.dataset === dataset && canonicalJson(record.raw) === canonicalJson(source[record.source.recordId]),
      `${dataset}.${record.source.recordId}`, 'raw source facts changed or lost');
  }
  for (const [dataset, records] of [['abilitykeywords', a.keywordRules], ['abilitydynamicdots', a.dynamicDots], ['abilitydynamicspecialvalues', a.dynamicSpecialValues]] as const) {
    requireIntegrity(canonicalJson(records.map(r => r.raw)) === canonicalJson(raw[dataset]), dataset, 'anonymous record coverage/order mismatch');
  }
  const sourceItems = raw.items as Record<string, { EquipSlot?: unknown }>;
  requireIntegrity(canonicalJson(t.items.map(r => r.id).sort()) === canonicalJson(Object.keys(sourceItems).filter(id => sourceItems[id]!.EquipSlot !== undefined).sort()),
    'items', 'equipment subset coverage mismatch');
  for (const power of t.treasurePowers) {
    const tiers = power.raw.Tiers as Record<string, unknown>;
    requireIntegrity(canonicalJson(power.tiers.map(r => r.id).sort()) === canonicalJson(Object.keys(tiers).sort()), power.id, 'tier coverage mismatch');
    for (const tier of power.tiers) requireIntegrity(canonicalJson(tier.raw) === canonicalJson(tiers[tier.id]), `${power.id}/${tier.id}`, 'tier source facts changed');
  }
  for (const ability of a.abilities) {
    const pve = ability.raw.PvE as Record<string, unknown>;
    requireIntegrity(canonicalJson(ability.pve.raw) === canonicalJson(pve), ability.id, 'PvE source facts changed');
    for (const [field, records] of [['DoTs', ability.pve.dots], ['SpecialValues', ability.pve.specialValues]] as const) {
      requireIntegrity(canonicalJson(records?.map(r => r.raw) ?? null) === canonicalJson(pve[field] ?? null), ability.id, `${field} coverage mismatch`);
    }
  }
}

export function diagnosticFingerprint(records: readonly GameDataDiagnostic[]): string {
  return integrity(Buffer.from(canonicalJson(records.map(({ group, code, category, path, reference }) => ({ group, code, category, path, reference }))))).sha256;
}
interface RegressionFixture { counts: GameDataManifest['counts']; diagnosticsSha256: string }
export function validateRegression(data: GameData, diagnostics: readonly GameDataDiagnostic[], fixtures: Record<string, RegressionFixture>): void {
  const version = data.progression.gameDataVersion;
  const fixture = fixtures[version];
  if (fixture) {
    requireIntegrity(canonicalJson(countGameData(data)) === canonicalJson(fixture.counts), version, 'regression counts changed; review source/normalization compatibility');
    requireIntegrity(diagnosticFingerprint(diagnostics) === fixture.diagnosticsSha256, version,
      `upstream diagnostics changed (SHA-256 ${diagnosticFingerprint(diagnostics)}); review exact categories, references and paths before updating the version-specific fixture`);
  } else requireIntegrity(diagnostics.length === 0, version, 'unreviewed upstream diagnostics; add a version-specific regression fixture after source review');
}

/** Remove only redundant normalization raw copies, never arbitrary source JSON.
 * Exact raw definitions remain in the separately pinned, verified snapshot.
 */
export function projectRuntimeData(data: GameData): RuntimeGameData {
  const jsonFields = new Set(['value', 'entries', 'behaviors', 'defaultValue', 'attributeHooks',
    'advancementHints', 'interactionFlagLevelCaps']);
  function project(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'raw').map(([key, v]) => {
      if (key === 'source') {
        const source = v as { dataset: string; recordId: string };
        return [key, { dataset: source.dataset, recordId: source.recordId }];
      }
      return [key, jsonFields.has(key) ? v : project(v)];
    }));
  }
  return project(data) as RuntimeGameData;
}

export async function generateData(rawDirectory: string, outputDirectory: string): Promise<GameDataManifest> {
  const input = await readPinnedInput(rawDirectory);
  const data = normalizePinnedInput(input);
  validateCoverage(data, input.raw);
  const diagnostics = validateGameData(data);
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/generated-regressions.json', import.meta.url), 'utf8')) as Record<string, RegressionFixture>;
  validateRegression(data, diagnostics, fixtures);
  const runtime = projectRuntimeData(data);
  const artifacts = {} as Record<ArtifactName, GameDataManifest['artifacts'][ArtifactName]>;
  const files = new Map<string, Uint8Array>();
  for (const name of ['progression', 'abilities', 'itemsTreasure'] as const) {
    const json = Buffer.from(`${canonicalJson(runtime[name])}\n`);
    // Node gzip has a fixed zero mtime; no clock, OS path or wall-clock data is added.
    const bytes = gzipSync(json, { level: 9 });
    const file = `${name}.json.gz`;
    files.set(file, bytes);
    artifacts[name] = { file, ...integrity(bytes), jsonBytes: json.byteLength };
  }
  const manifest: GameDataManifest = {
    schemaVersion: 1, generatorVersion: 1, normalizationSchemaVersion: 1,
    gameDataVersion: input.pin.upstreamVersion, snapshotSha256: input.snapshotSha256,
    sources: { ...data.progression.sources, ...data.abilities.sources, ...data.itemsTreasure.sources },
    counts: countGameData(data), artifacts,
    diagnostics: {
      total: diagnostics.length,
      byGroup: { progression: data.progression.integrityIssues.length, abilities: data.abilities.integrityIssues.length, itemsTreasure: data.itemsTreasure.integrityIssues.length },
      byCategory: {
        'unresolved-reference': diagnostics.filter(r => r.category === 'unresolved-reference').length,
        'unsupported-semantics': diagnostics.filter(r => r.category === 'unsupported-semantics').length,
      }, records: diagnostics,
    },
  };
  validateManifestCounts(runtime, manifest);
  files.set('manifest.json', Buffer.from(`${canonicalJson(manifest)}\n`));
  // Validation completes before touching output. Write manifest last so interrupted
  // publication cannot present a new manifest with incomplete artifacts.
  await mkdir(outputDirectory, { recursive: true });
  const lock = join(outputDirectory, '.generate-lock');
  await mkdir(lock).catch(error => { throw new Error(`Generation locked at ${lock}; confirm no generator is running before removing a stale lock`, { cause: error }); });
  try {
    for (const [file, bytes] of files) {
      const target = join(outputDirectory, file);
      await writeFile(`${target}.tmp`, bytes);
      await rename(`${target}.tmp`, target);
    }
  } finally {
    for (const file of files.keys()) await rm(join(outputDirectory, `${file}.tmp`), { force: true });
    await rm(lock, { recursive: true });
  }
  return manifest;
}
