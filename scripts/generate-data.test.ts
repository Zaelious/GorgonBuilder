// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import {
  diagnosticFingerprint, generateData, normalizePinnedInput, parseUniqueJson,
  projectRuntimeData, readPinnedInput, validateCoverage, validateRegression,
} from './generate-data';
import type { PinnedInput } from './generate-data';
import { integrity } from './snapshot';
import { countGameData } from '../src/data/repository/contracts';
import type { GameData, GameDataManifest, RuntimeGameData } from '../src/data/repository/contracts';
import { canonicalJson, validateGameData, validateManifestCounts } from '../src/data/repository/integrity';

const rawDirectory = new URL('../src/data/raw/', import.meta.url).pathname;
const generatedDirectory = new URL('../src/generated/game-data/', import.meta.url).pathname;
let input: PinnedInput;
let data: GameData;
let runtime: RuntimeGameData;
let manifest: GameDataManifest;
let scratch: string;
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'gorgon-generation-'));
  input = await readPinnedInput(rawDirectory);
  data = normalizePinnedInput(input);
  runtime = projectRuntimeData(data);
  manifest = JSON.parse(await readFile(join(generatedDirectory, 'manifest.json'), 'utf8')) as GameDataManifest;
}, 60_000);
afterAll(async () => { if (scratch) await rm(scratch, { recursive: true, force: true }); });

it('two offline generations are byte identical, including the committed manifest and gzip headers', async () => {
  const output = join(scratch, 'output');
  await generateData(rawDirectory, output);
  const files = ['manifest.json', ...Object.values(manifest.artifacts).map(a => a.file)];
  const first = await Promise.all(files.map(file => readFile(join(output, file))));
  await generateData(rawDirectory, output);
  for (const [i, file] of files.entries()) {
    expect((await readFile(join(output, file))).equals(first[i]!), file).toBe(true);
    expect((await readFile(join(generatedDirectory, file))).equals(first[i]!), `${file} is up to date`).toBe(true);
  }
}, 60_000);

it('counts, byte hashes, version and provenance agree with the pin and actual emitted artifacts', async () => {
  const loaded = {} as Record<string, unknown>;
  for (const [name, artifact] of Object.entries(manifest.artifacts)) {
    const bytes = await readFile(join(generatedDirectory, artifact.file));
    expect(integrity(bytes)).toEqual({ bytes: artifact.bytes, sha256: artifact.sha256 });
    const json = gunzipSync(bytes);
    expect(json.byteLength).toBe(artifact.jsonBytes);
    loaded[name] = JSON.parse(json.toString('utf8')) as unknown;
    expect(canonicalJson(loaded[name])).toBe(canonicalJson(runtime[name as keyof GameData]));
  }
  validateManifestCounts(loaded as unknown as RuntimeGameData, manifest);
  expect(manifest.counts).toEqual(countGameData(data));
  expect(manifest.gameDataVersion).toBe(input.pin.upstreamVersion);
  expect(manifest.snapshotSha256).toBe(input.snapshotSha256);
  for (const source of Object.values(manifest.sources)) {
    const pinned = input.pin.datasets.find(r => r.name === source.dataset)!;
    expect(source.sha256).toBe(pinned.integrity!.sha256);
    expect(source.sourceUrl).toBe(pinned.sourceUrl);
    expect(source.gameDataVersion).toBe(manifest.gameDataVersion);
  }
}, 30_000);

it('keeps every known upstream diagnostic with exact source paths, independently of new integrity failures', () => {
  const diagnostics = validateGameData(data);
  expect(diagnostics).toEqual(manifest.diagnostics.records);
  expect(manifest.diagnostics.byGroup).toEqual({ progression: 0, abilities: 1546, itemsTreasure: 96 });
  expect(manifest.diagnostics.byCategory).toEqual({ 'unresolved-reference': 1552, 'unsupported-semantics': 90 });
  const counts = new Map<string, number>();
  for (const r of diagnostics) {
    const key = `${r.group}/${r.code}/${r.reference}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    expect(r.path).toMatch(/^(abilities|abilitykeywords|abilitydynamic|tsysclientinfo)/);
  }
  expect(counts.get('abilities/missing-skill/Unknown')).toBe(1532);
  expect(counts.get('abilities/missing-effect-keyword/MindRevealed')).toBe(9);
  expect(counts.get('abilities/missing-effect-keyword/HasRecentlyHeardBardSong')).toBe(4);
  expect(counts.get('abilities/missing-effect-keyword/TestEffect')).toBe(1);
  expect(counts.get('itemsTreasure/missing-skill/Unknown')).toBe(6);
  expect(counts.get('itemsTreasure/unsupported-skill-selector/AnySkill')).toBe(90);
  expect(diagnosticFingerprint(diagnostics)).toBe('dcf4fdc4c77d2e3bc6ace30958076abdaadb9544199e2cbf8d2c4de51952e36b');
});

it('future versions use reviewed diagnostics rather than permanent v490 count requirements', () => {
  const differentVersion = { ...data, progression: { ...data.progression, gameDataVersion: 'v999' } };
  expect(() => validateRegression(differentVersion, [], {})).not.toThrow();
  expect(() => validateRegression(differentVersion, manifest.diagnostics.records, {})).toThrow('unreviewed upstream diagnostics');
});

it('rejects changed diagnostic identities even when their counts stay the same', () => {
  const changed = manifest.diagnostics.records.map((r, i) => i ? r : { ...r, path: 'abilities.NEW.Skill' });
  expect(() => validateRegression(data, changed, { v490: { counts: manifest.counts, diagnosticsSha256: diagnosticFingerprint(manifest.diagnostics.records) } })).toThrow('upstream diagnostics changed');
});

it('runtime projection omits raw copies and repeated provenance while retaining uninterpreted JSON and locators', () => {
  expect('raw' in runtime.abilities.abilities[0]!).toBe(false);
  expect(runtime.abilities.abilities[0]!.source).toEqual({ dataset: 'abilities', recordId: data.abilities.abilities[0]!.id });
  expect(runtime.abilities.acquisitionSources[0]!.entries).toEqual(data.abilities.acquisitionSources[0]!.entries);
  expect(runtime.progression.skills[0]!.progression).toEqual(data.progression.skills[0]!.progression.map(({ raw: original, ...r }) => { expect(original).toBeDefined(); return r; }));
  expect(runtime.itemsTreasure.nonEquipmentItemIds).toEqual(data.itemsTreasure.nonEquipmentItemIds);
  expect(runtime.abilities.dynamicDots).toHaveLength(2);
  expect(runtime.abilities.abilities.flatMap(r => r.pve.dots ?? [])).toHaveLength(1757);
});

it('preserves arbitrary JSON properties named raw or source inside uninterpreted rewards and acquisition entries', () => {
  const entry = { raw: { source: 'unrecognized', raw: 2 }, source: { dataset: 'not-a-reference' } };
  const changed = { ...data, abilities: { ...data.abilities, acquisitionSources: [{ ...data.abilities.acquisitionSources[0]!, entries: [entry] }] } };
  expect(projectRuntimeData(changed).abilities.acquisitionSources[0]!.entries).toEqual([entry]);
});

it('detects raw-to-normalized omissions and replacement IDs, including non-equipment and anonymous records', () => {
  expect(() => validateCoverage(data, input.raw)).not.toThrow();
  expect(() => validateCoverage({ ...data, progression: { ...data.progression, skills: data.progression.skills.slice(1) } }, input.raw)).toThrow('coverage mismatch');
  expect(() => validateCoverage({ ...data, itemsTreasure: { ...data.itemsTreasure, nonEquipmentItemIds: ['item_99999999', ...data.itemsTreasure.nonEquipmentItemIds.slice(1)] } }, input.raw)).toThrow('coverage mismatch');
  expect(() => validateCoverage({ ...data, abilities: { ...data.abilities, dynamicDots: [] } }, input.raw)).toThrow('coverage/order mismatch');
}, 30_000);

it.each(['progression', 'abilities', 'itemsTreasure'] as const)('fails duplicate official IDs in %s', group => {
  const changed: GameData = group === 'progression' ? { ...data, progression: { ...data.progression, skills: [...data.progression.skills, data.progression.skills[0]!] } }
    : group === 'abilities' ? { ...data, abilities: { ...data.abilities, abilities: [...data.abilities.abilities, data.abilities.abilities[0]!] } }
      : { ...data, itemsTreasure: { ...data.itemsTreasure, items: [...data.itemsTreasure.items, data.itemsTreasure.items[0]!] } };
  expect(() => validateGameData(changed)).toThrow('duplicate ID');
});

it('detects duplicate keys before JSON.parse can hide official ID or tier conflicts', () => {
  expect(() => parseUniqueJson('{"power_1":{},"power_1":{}}', 'powers')).toThrow('duplicate JSON key/ID power_1');
  expect(() => parseUniqueJson('{"Tiers":{"id_1":{},"id_\\u0031":{}}}', 'tiers')).toThrow('duplicate JSON key/ID id_1');
  expect(parseUniqueJson('[{"id_1":{}},{"id_1":{}}]', 'separate namespaces')).toEqual([{ id_1: {} }, { id_1: {} }]);
  expect(() => parseUniqueJson('{broken}', 'broken')).toThrow();
});

it('rejects mixed versions and conflicting per-record provenance', () => {
  expect(() => validateGameData({ ...data, abilities: { ...data.abilities, gameDataVersion: 'v999' } })).toThrow('gameDataVersion');
  const skill = data.progression.skills[0]!;
  expect(() => validateGameData({ ...data, progression: { ...data.progression, skills: [{ ...skill, source: { ...skill.source, sha256: '0'.repeat(64) } }, ...data.progression.skills.slice(1)] } })).toThrow('provenance');
});

it('detects deliberately broken progression, ability, item/profile, profile/power and effect references', () => {
  const skill = data.progression.skills.find(r => r.activeAdvancement)!;
  const withSkill = { ...data, progression: { ...data.progression, skills: data.progression.skills.map(r => r === skill ? { ...r, activeAdvancement: { ...r.activeAdvancement!, tableId: 'missing' } } : r) } };
  expect(() => validateGameData(withSkill)).toThrow('advancement-table reference');
  const ability = data.abilities.abilities.find(r => r.upgradeOf)!;
  expect(() => validateGameData({ ...data, abilities: { ...data.abilities, abilities: data.abilities.abilities.map(r => r === ability ? { ...r, upgradeOf: { ...r.upgradeOf!, abilityId: 'ability_99999999' } } : r) } })).toThrow('ability reference');
  const item = data.itemsTreasure.items.find(r => r.treasureProfile)!;
  expect(() => validateGameData({ ...data, itemsTreasure: { ...data.itemsTreasure, items: data.itemsTreasure.items.map(r => r === item ? { ...r, treasureProfile: { profileId: 'missing', status: 'resolved' } } : r) } })).toThrow('profile reference');
  const profile = data.itemsTreasure.treasureProfiles.find(r => r.powers.length)!;
  expect(() => validateGameData({ ...data, itemsTreasure: { ...data.itemsTreasure, treasureProfiles: data.itemsTreasure.treasureProfiles.map(r => r === profile ? { ...r, powers: [{ ...r.powers[0]!, powerId: 'power_99999999' }, ...r.powers.slice(1)] } : r) } })).toThrow('profile membership');
  const constrained = data.abilities.abilities.find(r => r.effectKeywordConstraints.some(ref => ref.status === 'resolved'))!;
  expect(() => validateGameData({ ...data, abilities: { ...data.abilities, abilities: data.abilities.abilities.map(r => r === constrained ? { ...r, effectKeywordConstraints: r.effectKeywordConstraints.map(ref => ({ ...ref, effectIds: ['effect_99999999'] })) } : r) } })).toThrow('effect-keyword membership');
});

it('fails unreported new missing references and stale diagnostics', () => {
  const ability = data.abilities.abilities[0]!;
  expect(() => validateGameData({ ...data, abilities: { ...data.abilities, abilities: [{ ...ability, skill: { sourceId: 'NewMissingSkill', skillId: null, status: 'missing' } }, ...data.abilities.abilities.slice(1)] } })).toThrow('unreported missing-skill');
  expect(() => validateGameData({ ...data, abilities: { ...data.abilities, integrityIssues: [...data.abilities.integrityIssues, { code: 'missing-skill', path: 'fake.path', reference: 'fake', message: 'fake' }] } })).toThrow('stale or incorrect diagnostic');
});

it('fails duplicate and incorrectly owned tiers while allowing the same tier key under distinct powers', () => {
  const power = data.itemsTreasure.treasurePowers[0]!;
  const change = (tiers: typeof power.tiers): GameData => ({ ...data, itemsTreasure: { ...data.itemsTreasure, treasurePowers: [{ ...power, tiers }, ...data.itemsTreasure.treasurePowers.slice(1)] } });
  expect(() => validateGameData(change([...power.tiers, power.tiers[0]!]))).toThrow('duplicate ID');
  expect(() => validateGameData(change([{ ...power.tiers[0]!, powerId: 'power_99999999' }, ...power.tiers.slice(1)]))).toThrow('composite identity');
  expect(() => validateGameData(data)).not.toThrow();
});

it('fails manifest count and version drift', () => {
  expect(() => validateManifestCounts(runtime, { ...manifest, counts: { ...manifest.counts, abilities: 0 } })).toThrow('counts');
  expect(() => validateManifestCounts(runtime, { ...manifest, gameDataVersion: 'v999' })).toThrow('version mismatch');
  expect(() => validateManifestCounts(runtime, { ...manifest, diagnostics: { ...manifest.diagnostics, total: 0 } })).toThrow('diagnostic counts differ');
});

describe('pinned source validation', () => {
  it.each(['missing', 'hash', 'metadata', 'mixed-version', 'cache-manifest'] as const)('fails actionably on %s source input without changing existing generated output', async kind => {
    const directory = join(scratch, kind);
    await cp(rawDirectory, directory, { recursive: true });
    const source = join(directory, 'cache', input.pin.upstreamVersion, 'skills.json');
    if (kind === 'missing') await rm(source);
    if (kind === 'hash') await writeFile(source, '{}');
    if (kind === 'metadata' || kind === 'mixed-version') {
      const pin = structuredClone(input.pin);
      pin.datasets[0]!.sourceUrl = kind === 'metadata' ? 'https://example.com/skills.json' : 'https://cdn.projectgorgon.com/v999/data/skills.json';
      await writeFile(join(directory, 'snapshot.json'), JSON.stringify(pin));
    }
    if (kind === 'cache-manifest') {
      const pin = structuredClone(input.pin);
      pin.fetchedAt = '2020-01-01T00:00:00Z';
      await writeFile(join(directory, 'cache', pin.upstreamVersion, 'manifest.json'), JSON.stringify(pin));
    }
    const output = join(scratch, `invalid-${kind}`);
    await expect(generateData(directory, output)).rejects.toThrow(kind === 'missing' ? 'Missing cached file skills.json'
      : kind === 'hash' ? 'integrity failure' : kind === 'cache-manifest' ? 'pinned manifest differs' : 'Invalid snapshot manifest');
    await expect(readFile(join(output, 'manifest.json'))).rejects.toThrow('ENOENT');
  }, 30_000);
});

it('projects every pinned official ability icon and special text without changing identity or provenance', () => {
  const source = input.raw.abilities as Record<string, { IconID: number; SpecialInfo?: string }>;
  for (const ability of runtime.abilities.abilities) {
    expect(ability.iconId, ability.id).toBe(source[ability.id]!.IconID);
    expect(ability.specialInfo, ability.id).toBe(source[ability.id]!.SpecialInfo ?? null);
    expect(ability.source).toEqual({ dataset: 'abilities', recordId: ability.id });
  }
});
