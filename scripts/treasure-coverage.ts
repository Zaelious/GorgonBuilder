import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import type { GameDataManifest } from '../src/data/repository/contracts.ts';
import { loadPlannerFixture } from '../src/test/planner-fixture.ts';
import {
  COVERAGE_REASONS, DIRECT_MECHANICS, OUTSIDE_MECHANICS, inventoryTreasureEffects, requiresActiveSkillForCoverage, type TreasureCoverageRow,
} from '../src/core/calculation/treasure-coverage.ts';

const data = loadPlannerFixture();
const rows = inventoryTreasureEffects(data);
const skills = data.skills.filter(s => s.combat);
const output = resolve('docs/treasure-coverage');
mkdirSync(output, { recursive: true });

type Snap = 't0014' | 'initial' | 'final';
const SNAPS: readonly Snap[] = ['t0014', 'initial', 'final'];
const pct = (n: number, d: number) => d ? (n / d * 100).toFixed(2) : '—';
const powersOf = (subset: TreasureCoverageRow[]) => new Set(subset.map(r => r.powerId)).size;
/** Entry and unique-power counts. A power is fully calculated only when every one of its direct entries is. */
function count(subset: TreasureCoverageRow[], when: Snap) {
  const direct = subset.filter(r => r.direct);
  const full = direct.filter(r => r[when].status === 'fully-calculated').length;
  const partial = direct.filter(r => r[when].status === 'partially-calculated').length;
  // Calculated entries that rely on an official required active skill (counted in full/partial, reported separately).
  const conditional = direct.filter(r => r[when].status !== 'unmodeled' && requiresActiveSkillForCoverage(r)).length;
  const byPower = new Map<string, Set<string>>();
  for (const r of direct) byPower.set(r.powerId, (byPower.get(r.powerId) ?? new Set()).add(r[when].status));
  const powerStatus = [...byPower.values()].map(set => set.size === 1 && set.has('fully-calculated') ? 'full'
    : set.has('fully-calculated') || set.has('partially-calculated') ? 'partial' : 'unmodeled');
  return {
    entries: { total: direct.length, full, partial, unmodeled: direct.length - full - partial, conditional,
      coverage: pct(full, direct.length), withPartial: pct(full + partial, direct.length) },
    powers: { total: byPower.size, full: powerStatus.filter(s => s === 'full').length,
      partial: powerStatus.filter(s => s === 'partial').length, unmodeled: powerStatus.filter(s => s === 'unmodeled').length },
  };
}
const combatRows = rows.filter(r => r.association === 'combat-skill');
const genericRows = rows.filter(r => r.association === 'generic');
const scopes = { combatSkill: combatRows, generic: genericRows, all: rows };
const direct = Object.fromEntries(Object.entries(scopes).map(([name, subset]) =>
  [name, Object.fromEntries(SNAPS.map(snap => [snap, count(subset, snap)]))])) as Record<keyof typeof scopes, Record<Snap, ReturnType<typeof count>>>;

const UNCONDITIONAL = ['unconditional-flat-percent', 'skill-base'];
const requireActive = (subset: TreasureCoverageRow[]) => subset.filter(r =>
  UNCONDITIONAL.includes(r.mechanic) && requiresActiveSkillForCoverage(r));
const requiredSkill = Object.fromEntries(Object.entries(scopes).map(([name, subset]) =>
  [name, count(requireActive(subset), 'final')])) as Record<keyof typeof scopes, ReturnType<typeof count>>;
const priorUnconditional = Object.fromEntries(Object.entries(scopes).map(([name, subset]) =>
  [name, count(subset.filter(r => UNCONDITIONAL.includes(r.mechanic)), 'final')])) as Record<keyof typeof scopes, ReturnType<typeof count>>;
const unconditional = Object.fromEntries(Object.entries(scopes).map(([name, subset]) =>
  [name, count(subset.filter(r => UNCONDITIONAL.includes(r.mechanic) && !requiresActiveSkillForCoverage(r)), 'final')])) as Record<keyof typeof scopes, ReturnType<typeof count>>;
const unconditionalTable = ['| Scope | Unconditional entries | Fully | Partially | Unmodeled | Full % | Full + partial % | Powers full / partial / unmodeled |', '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...([['combatSkill', 'Combat skills'], ['generic', 'Generic/AnySkill'], ['all', 'All associations']] as const).map(([k, label]) => {
    const u = unconditional[k];
    return `| ${label} | ${u.entries.total} | ${u.entries.full} | ${u.entries.partial} | ${u.entries.unmodeled} | **${u.entries.coverage}** | ${u.entries.withPartial} | ${u.powers.full} / ${u.powers.partial} / ${u.powers.unmodeled} of ${u.powers.total} |`;
  })].join('\n');

/** Figures exactly as published by the T0013-F1 report, before required-skill entries were separated. */
const PUBLISHED_T0013_F1_UNCONDITIONAL = {
  combatSkill: { entries: 11012, fullCoverage: '89.48' },
  generic: { entries: 3070, fullCoverage: '75.57' },
  all: { entries: 14082, fullCoverage: '86.45' },
} as const;
const conditionalTable = [
  '| Scope | Published T0013-F1 entries | Published full % | Truly unconditional entries | Full % | Required-active-skill entries | Calculated when the skill is active |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...([['combatSkill', 'Combat skills'], ['generic', 'Generic/AnySkill'], ['all', 'All associations']] as const).map(([key, label]) => {
    const published = PUBLISHED_T0013_F1_UNCONDITIONAL[key], req = requiredSkill[key].entries;
    return `| ${label} | ${published.entries} | ${published.fullCoverage} | ${unconditional[key].entries.total} | ${unconditional[key].entries.coverage} | ${req.total} | ${req.full + req.partial} |`;
  }),
].join('\n');

const tally = <K extends string>(subset: TreasureCoverageRow[], key: (r: TreasureCoverageRow) => K | K[]) => {
  const map = new Map<K, TreasureCoverageRow[]>();
  for (const r of subset) for (const k of ([] as K[]).concat(key(r))) map.set(k, [...(map.get(k) ?? []), r]);
  return map;
};

// Earlier T0013-F1 report: its "direct-related unmodeled" entries, reproduced from the retained legacy screening.
const legacyUnmodeled = combatRows.filter(r => r.legacy.relevant && /^direct-/u.test(r.legacy.family)
  && r.initial.appliedAbilityIds.length === 0 && r.powerId !== 'power_4032');

const generics = [...new Set(genericRows.map(r => r.skill))].sort((a, b) => a === 'AnySkill' ? -1 : b === 'AnySkill' ? 1 : a.localeCompare(b));
const skillRow = (label: string, subset: TreasureCoverageRow[], bold = false) => {
  const [t, i, f] = SNAPS.map(s => count(subset, s));
  const b = (v: string | number) => bold ? `**${v}**` : `${v}`;
  return `| ${b(label)} | ${b(f!.powers.total)} | ${b(f!.entries.total)} | ${b(f!.entries.full)} | ${b(f!.entries.partial)} | ${b(f!.entries.unmodeled)} | ${b(f!.entries.conditional)} | ${b(f!.entries.coverage)} | ${b(i!.entries.coverage)} | ${b(t!.entries.coverage)} |`;
};
const skillTable = [
  '| Association | Direct powers | Direct entries | Fully calculated | Partially | Unmodeled | Conditional (required skill) | Coverage % | F1 initial % | T0014 % |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...skills.map(skill => skillRow(skill.name ?? skill.id, combatRows.filter(r => r.skill === skill.id))),
  skillRow('Combat skills total', combatRows, true),
  ...generics.map(g => skillRow(`Generic: ${g}`, genericRows.filter(r => r.skill === g))),
  skillRow('Generic/AnySkill total', genericRows, true),
  skillRow('All associations', rows, true),
].join('\n');

const headline = (name: keyof typeof scopes, label: string) => {
  const d = direct[name];
  return SNAPS.map(s => `| ${label} — ${{ t0014: 'T0014 baseline', initial: 'T0013-F1 first commit', final: 'T0013-F1 final' }[s]} | ${d[s].entries.total} | ${d[s].entries.full} | ${d[s].entries.partial} | ${d[s].entries.unmodeled} | ${d[s].entries.conditional} | **${d[s].entries.coverage}** | ${d[s].entries.withPartial} | ${d[s].powers.full} / ${d[s].powers.partial} / ${d[s].powers.unmodeled} of ${d[s].powers.total} |`).join('\n');
};

const mechanicTable = ['| Mechanic family | Counted in direct coverage | Powers | Entries | Fully | Partially | Unmodeled |', '|---|---|---:|---:|---:|---:|---:|',
  ...[...DIRECT_MECHANICS, ...OUTSIDE_MECHANICS].map(m => {
    const subset = rows.filter(r => r.mechanic === m), c = count(subset, 'final');
    const isDirect = (DIRECT_MECHANICS as readonly string[]).includes(m);
    return `| ${m} | ${isDirect ? 'yes' : 'no (other mechanic)'} | ${powersOf(subset)} | ${subset.length} | ${isDirect ? c.entries.full : '—'} | ${isDirect ? c.entries.partial : '—'} | ${isDirect ? c.entries.unmodeled : '—'} |`;
  })].join('\n');

const reasonTable = (status: string) => {
  const subset = rows.filter(r => r.final.status === status);
  return ['| Reason | Powers | Entries | Combat-skill entries | Generic entries | Explanation | Example |', '|---|---:|---:|---:|---:|---|---|',
    ...[...tally(subset, r => r.final.reason)].sort((a, b) => b[1].length - a[1].length).map(([reason, list]) =>
      `| ${reason} | ${powersOf(list)} | ${list.length} | ${list.filter(r => r.association === 'combat-skill').length} | ${list.filter(r => r.association === 'generic').length} | ${COVERAGE_REASONS[reason] ?? ''} | ${list[0]!.powerId} ${list[0]!.internalName} |`)].join('\n');
};

const otherTable = ['| Other mechanic (recorded, not simulated) | Entries | Of which direct fully calculated |', '|---|---:|---:|',
  ...[...tally(rows.filter(r => r.direct && r.otherMechanics.length), r => r.otherMechanics)].sort((a, b) => b[1].length - a[1].length)
    .map(([k, list]) => `| ${k} | ${list.length} | ${list.filter(r => r.final.status === 'fully-calculated').length} |`)].join('\n');

const confidenceTable = ['| Interpretation confidence (direct full/partial) | Powers | Entries |', '|---|---:|---:|',
  ...[...tally(rows.filter(r => r.final.confidence), r => r.final.confidence!)].map(([k, list]) => `| ${k} | ${powersOf(list)} | ${list.length} |`)].join('\n');

const reclassTable = ['| New mechanic family | Entries | Powers | Now fully | Now partially | Still unmodeled / outside |', '|---|---:|---:|---:|---:|---:|',
  ...[...tally(legacyUnmodeled, r => r.mechanic)].sort((a, b) => b[1].length - a[1].length).map(([m, list]) =>
    `| ${m} | ${list.length} | ${powersOf(list)} | ${list.filter(r => r.final.status === 'fully-calculated').length} | ${list.filter(r => r.final.status === 'partially-calculated').length} | ${list.filter(r => ['unmodeled', 'outside-direct'].includes(r.final.status)).length} |`)].join('\n');

const GAP_APPROACH: Record<string, string> = {
  'stateful-combat-context': 'Combat-state model: timed self buffs, next-attack and combo flags, stacking; best as explicit "assume buff active" toggles per family.',
  'conditional-target-or-state': 'Target-condition inputs (Elite, creature type, Vulnerable/Off-Guard/stunned, Rage %, your armor %, active skill). Shares the creature-type selector planned with criticals.',
  'multi-hit-split-or-variable': 'Armor/health-component allocation rules and expected-value handling for random ranges and chance-based damage.',
  'aoe-targeting-change': 'Per-ability AoE conversion (radius, cap, chance) generalized from the Mock Burst conversion.',
  'damage-type-conversion': 'Damage-type conversion stage before type bonuses and vulnerability.',
  'no-applicable-published-hit': 'No current action: no combat-skill hit can use these (no Sonic/Divine/Demonic abilities, non-combat skills, item-only abilities).',
  'split-component-allocation': 'Measure how flat bonuses distribute over abilities with several published hit components.',
  'side-clause:target-debuff': 'Target-debuff state (vulnerability, Off-Guard) feeding later hits.',
  'side-clause:damage-type-conversion': 'Same conversion stage as damage-type-conversion.',
  'side-clause:timed-damage-buff': 'Same combat-state model as stateful-combat-context.',
  'side-clause:random-bonus': 'Expected-value rule for chance-based extra damage.',
  'side-clause:aoe-conversion': 'Same AoE conversion as aoe-targeting-change.',
  'side-clause:triggered-damage': 'Secondary triggered damage instances (eruptions).',
  'side-clause:keyword-grant': 'Keyword grant before keyword-hook resolution.',
  'unresolved-ability-name': 'Source typo or group without an official attribute; needs an explicit audited alias.',
  'no-official-damage-attribute': 'The named ability publishes no matching damage attribute; needs research.',
  'unmapped-attribute': 'Attribute without a damage hook on any published ability.',
  'unclassified-prose': 'Manual review.',
};
const gaps = rows.filter(r => r.direct && r.final.status !== 'fully-calculated');
const gapTable = ['| Remaining gap (reason) | Status | Powers | Entries | Reusable mechanic family / next approach |', '|---|---|---:|---:|---|',
  ...[...tally(gaps, r => r.final.reason)].sort((a, b) => b[1].length - a[1].length).map(([reason, list]) =>
    `| ${reason} | ${list[0]!.final.status} | ${powersOf(list)} | ${list.length} | ${GAP_APPROACH[reason] ?? ''} |`)].join('\n');

const subFamilyTable = ['| Gap mechanic | Sub-family | Powers | Entries | Example |', '|---|---|---:|---:|---|',
  ...[...tally(rows.filter(r => r.gapFamily && r.final.status === 'unmodeled'), r => `${r.mechanic}|${r.gapFamily}`)]
    .sort((x, y) => x[0].localeCompare(y[0])).map(([key, list]) => `| ${key.split('|')[0]} | ${key.split('|')[1]} | ${powersOf(list)} | ${list.length} | ${list[0]!.powerId} ${list[0]!.internalName} |`)].join('\n');

const transitions = (from: Snap, to: Snap) => rows.filter(r => r.direct && r[from].status === 'unmodeled' && r[to].status !== 'unmodeled');
const summary = {
  gameDataVersion: data.gameDataVersion, combatSkills: skills.length,
  combatAbilities: data.abilities.filter(a => skills.some(s => s.id === a.skill.skillId)).length,
  inventory: {
    powers: data.treasurePowers.length, tiers: data.treasurePowers.reduce((n, p) => n + p.tiers.length, 0), entries: rows.length,
    emptyTiers: data.treasurePowers.reduce((n, p) => n + p.tiers.filter(t => t.effectDescriptions.length === 0).length, 0),
    combatSkill: { powers: powersOf(combatRows), entries: combatRows.length },
    generic: { powers: powersOf(genericRows), entries: genericRows.length, associations: generics },
  },
  directDamage: direct,
  unconditionalFinal: unconditional,
  newlyCalculated: { sinceT0014: transitions('t0014', 'final').length, sinceInitial: transitions('initial', 'final').length,
    powersSinceInitial: powersOf(transitions('initial', 'final')) },
  mechanics: Object.fromEntries([...DIRECT_MECHANICS, ...OUTSIDE_MECHANICS].map(m => [m, rows.filter(r => r.mechanic === m).length])),
  reasons: Object.fromEntries([...tally(rows.filter(r => r.direct), r => `${r.final.status}:${r.final.reason}`)].sort().map(([k, list]) => [k, list.length])),
  requiredActiveSkillAudit: { publishedT0013F1: PUBLISHED_T0013_F1_UNCONDITIONAL, recomputedMixed: priorUnconditional,
    trulyUnconditional: unconditional, requiredActiveSkill: requiredSkill },
  legacyReport: { previousFullCoverage: '22.83', previousDenominator: 21808, previousDirectRelatedUnmodeled: legacyUnmodeled.length,
    previousDirectRelatedUnmodeledPowers: powersOf(legacyUnmodeled),
    reclassified: Object.fromEntries([...tally(legacyUnmodeled, r => `${r.mechanic}:${r.final.status}`)].sort().map(([k, list]) => [k, list.length])) },
};

const c = direct.combatSkill.final, g = direct.generic.final, a = direct.all.final;
const report = `# T0013-F1 v490 direct-damage treasure coverage

Generated by \`npm run coverage:treasure\` from pinned official v490 data. Four separate measures:

1. **Inventory completeness** — every published power, tier and effect entry is listed exactly once.
2. **Direct-damage coverage** — whether an entry's contribution to the player's own direct hits is calculated.
3. **Other mechanics** — taunt, reuse, resources, DoT, critical, pets, defense: recorded per entry, never lowering direct coverage.
4. **Validation confidence** — official attribute mapping versus a source-backed prose assumption. No result is game-verified;
   the additive flat → percentage → Skill Base ordering remains an assumption for every numeric contribution.

## 1. Inventory completeness

**${summary.inventory.powers} powers / ${summary.inventory.tiers} tiers / ${summary.inventory.entries} effect entries** (100%; ${summary.inventory.emptyTiers} empty-effect tiers counted as tiers). Combat-skill associations: ${summary.inventory.combatSkill.powers} powers / ${summary.inventory.combatSkill.entries} entries across all **${skills.length}** official Combat=true skills (${summary.combatAbilities} abilities). Generic associations (${generics.join(', ')}): ${summary.inventory.generic.powers} powers / ${summary.inventory.generic.entries} entries. Each entry is counted once; Generic/AnySkill entries are reported in their own rows and never duplicated into skill rows.

## 2. Direct-damage coverage

One entry = one power ID + tier ID + effect index. **Conditional (required skill)** counts calculated entries (already included in Fully/Partially) whose official third token requires an active skill: they are probed with that skill as the build's second active skill and are never assumed active otherwise. **Fully calculated**: the entry's direct-hit contribution reaches every applicable published combat hit. **Partially calculated**: the direct contribution is calculated, but a damage-affecting part (split hit components, a damage-type conversion, target debuff, timed buff...) is not. Accompanying non-damage clauses (taunt, reuse, Power, Rage, control, healing) and separate-stage mechanics (DoT, critical) are listed under *other mechanics* and do **not** make an entry partial.

| Scope — snapshot | Direct entries | Fully | Partially | Unmodeled | Conditional (required skill) | Full coverage % | Full + partial % | Powers full / partial / unmodeled |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${headline('combatSkill', 'Combat skills')}
${headline('generic', 'Generic/AnySkill')}
${headline('all', 'All associations')}

Snapshots use the same denominator and rules: **T0014 baseline** (direct hooks, two Mock rules), **T0013-F1 first commit** (+ abilitykeywords hooks and 38 curated sentences) and **T0013-F1 final** (+ the reusable prose grammar). ${summary.newlyCalculated.sinceInitial} direct entries across ${summary.newlyCalculated.powersSinceInitial} powers gained a calculated contribution since the first commit (${summary.newlyCalculated.sinceT0014} since T0014).

Headline: combat-skill direct coverage **${c.entries.coverage}%** fully calculated (${c.entries.withPartial}% with partial), ${c.powers.full} of ${c.powers.total} direct powers fully calculated; Generic/AnySkill **${g.entries.coverage}%**; all associations **${a.entries.coverage}%**.

### Unconditional flat / percentage / Skill Base subset

These modifiers have no official required-active-skill condition. The published T0013-F1 report mixed conditional third-token effects into this denominator; they are now counted separately below:

${unconditionalTable}

#### Required-active-skill audit correction

${conditionalTable}

Published figures are the T0013-F1 report's own values. Required-active-skill entries (e.g. \`{MOD_PIERCING_DIRECT}{0.01}{AnimalHandling}\`) are probed explicitly with the required skill as the build's second active skill, reason \`calculated-when-required-skill-active\`; each probe records \`requiredSkillsActivated\` in [effects.json.gz](effects.json.gz). \`requiredActiveSkillAudit\` in [summary.json](summary.json) keeps the published, recomputed mixed and separated denominators.

Remaining unconditional gaps are listed by reason below (no published combat hit, split hit components, unresolved names).

The earlier report's 22.83% used a broader denominator (21,808 combat entries including DoT, pet, crit and reactive effects) and counted any taunt/reuse clause as partial. Those effects are now classified as other mechanics, so the figures are not comparable; the per-snapshot rows above recompute every stage with the new denominator.

### Per association

${skillTable}

## 3. Mechanic families

${mechanicTable}

### Partially calculated, by reason

${reasonTable('partially-calculated')}

### Unmodeled, by specific reason

${reasonTable('unmodeled')}

### Other mechanics recorded on direct entries

${otherTable}

## 4. Validation confidence

${confidenceTable}

\`official-attribute\`: an official \`{ATTRIBUTE}{value}\` token mapped by attribute ID family, label and DisplayType. \`source-backed-assumption\`: a prose sentence read by an exact curated rule or the reusable grammar, resolved to official ability names, hooks and attribute records. Both use the assumed additive stages; Burst intermediate falloff is additionally *Estimated*.

## Reclassification of the earlier ${legacyUnmodeled.length} unmodeled direct-related entries

The first T0013-F1 report left **${legacyUnmodeled.length} combat entries (${powersOf(legacyUnmodeled)} powers)** in its \`direct-percent\` / \`direct-flat-or-special\` families without support. Reclassified with official attributes, hooks, ability names and wording:

${reclassTable}

## Remaining gaps, grouped by reusable mechanic family

${gapTable}

### Conditional and stateful sub-families (planning)

${subFamilyTable}

## Reusable grammar and its limits

\`prose-damage-grammar.ts\` interprets a sentence only when (1) it starts with a fixed unconditional damage clause, (2) every named target resolves to an official ability display name of the power's own skill, the skill itself, or an official group damage attribute named by label, (3) exactly one official ability-specific damage attribute with the expected DisplayType is listed in that ability's damage hook, and (4) all remaining text is a sequence of recognized clauses. Conditions, conversions, split components, random ranges and any unrecognized wording fail closed. The sentence must be one this exact power publishes. Curated exact-power rules take precedence and agree with the grammar for all 38 earlier definitions.

## Complete source inventory

[effects.json.gz](effects.json.gz) holds every entry: exact power ID/InternalName, tier, effect index, source text, attribute/label/DisplayType, mechanic, other mechanics, direct side mechanics, and per snapshot the status, reason code, rule IDs, mappings, applied and uncertain ability IDs and confidence. [summary.json](summary.json) holds the counts. [fixtures.json](fixtures.json) supplies exact representative identities per combat skill. [powers.json.gz](powers.json.gz) and [abilities.json.gz](abilities.json.gz) retain every power/tier and combat ability record; [sources.json](sources.json) pins official URLs and hashes.

## Reproduction

\`npm ci && npm run coverage:treasure && npm run coverage:treasure -- --check\` regenerates deterministic artifacts and verifies byte equality. Decompress with \`gzip -dc docs/treasure-coverage/effects.json.gz\`. No network or live data is used. Classification is an auditable screening, not a formula parser; no runtime calculation reads it.
`;

const manifest = JSON.parse(readFileSync('src/generated/game-data/manifest.json', 'utf8')) as GameDataManifest;
const artifacts: Record<string, Buffer | string> = {
  'README.md': report, 'summary.json': JSON.stringify(summary, null, 2) + '\n',
  'sources.json': JSON.stringify({ gameDataVersion: manifest.gameDataVersion, snapshotSha256: manifest.snapshotSha256, sources: manifest.sources, artifacts: manifest.artifacts }, null, 2) + '\n',
  'fixtures.json': JSON.stringify(skills.map(skill => {
    const hits = data.getAbilitiesForSkill(skill.id).filter(ab => [ab.damage.damage, ab.damage.healthSpecificDamage, ab.damage.armorSpecificDamage].filter(v => v !== null).length === 1 && [ab.damage.damage, ab.damage.healthSpecificDamage, ab.damage.armorSpecificDamage].some(v => v !== null && v > 0));
    const sample = combatRows.find(r => r.skill === skill.id && r.attributeId && r.final.appliedAbilityIds.some(id => hits.some(ab => ab.id === id)));
    return { skillId: skill.id, abilityId: sample?.final.appliedAbilityIds.find(id => hits.some(ab => ab.id === id)) ?? hits[0]?.id ?? null, powerId: sample?.powerId ?? null, tierId: sample?.tierId ?? null, note: !hits.length ? 'No positive single direct-hit record published; no damage invented.' : sample ? 'Synthetic fixture uses exact published IDs; no claim of live-game validation.' : 'Published direct hit available; no structured treasure contribution found for this skill.' };
  }), null, 2) + '\n',
  'effects.json.gz': gzipSync(JSON.stringify(rows) + '\n', { level: 9 }),
  'powers.json.gz': gzipSync(JSON.stringify(data.treasurePowers.map(p => ({ id: p.id, internalName: p.internalName, skill: p.skill,
    isUnavailable: p.isUnavailable, source: p.source, tiers: p.tiers.map(t => ({ id: t.id, source: t.source, effects: t.effectDescriptions.length })) }))) + '\n', { level: 9 }),
  'abilities.json.gz': gzipSync(JSON.stringify({ keywordRules: data.keywordRules, abilities: data.abilities.filter(ab => skills.some(s => s.id === ab.skill.skillId)) }) + '\n', { level: 9 }),
};
for (const [file, bytes] of Object.entries(artifacts)) {
  const path = resolve(output, file);
  if (process.argv.includes('--check')) {
    if (!readFileSync(path).equals(Buffer.from(bytes))) throw new Error(`Coverage artifact differs: ${file}`);
  } else writeFileSync(path, bytes);
}
console.log(JSON.stringify({ directDamage: summary.directDamage.combatSkill.final, generic: summary.directDamage.generic.final, legacy: summary.legacyReport }, null, 2));
