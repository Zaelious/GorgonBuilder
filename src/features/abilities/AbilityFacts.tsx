import type { ReactNode } from 'react';
import type { Ability } from './groups';

type Dot = NonNullable<Ability['pve']['dots']>[number];
type SpecialValue = NonNullable<Ability['pve']['specialValues']>[number];

/** Player-facing wording for a published DoT that deals damage. Rule enums are never shown here. */
export function describeDot(dot: Dot): string {
  const lead = dot.preface ? `${dot.preface} ` : '';
  const ticks = dot.numTicks > 1 ? ` per tick × ${dot.numTicks}` : '';
  const duration = dot.duration > 0 ? ` over ${dot.duration} s` : '';
  return `${lead}${dot.damagePerTick} ${dot.damageType} damage${ticks}${duration}`;
}

/** Exact source wording for technical details, including zero values and uninterpreted rules. */
export function describeDotSource(dot: Dot): string {
  return `${dot.preface ? `${dot.preface} ` : ''}DamagePerTick ${dot.damagePerTick} · ${dot.damageType} · NumTicks ${dot.numTicks} · Duration ${dot.duration} s${dot.specialRules?.length ? ` · SpecialRules ${dot.specialRules.join(', ')}` : ''}`;
}

const valueText = (value: SpecialValue) => [value.label, value.value, value.suffix].filter(part => part !== null && part !== '').join(' ');

/** Published entries that are meaningful as normal player-facing effects (non-zero values). */
export function playerEffects(ability: Ability): { effects: string[]; technical: string[] } {
  const effects: string[] = [];
  const technical: string[] = [];
  if (ability.specialInfo) effects.push(ability.specialInfo);
  for (const value of ability.pve.specialValues ?? []) (value.value !== 0 ? effects : technical).push(valueText(value));
  for (const dot of ability.pve.dots ?? []) {
    if (dot.damagePerTick > 0) effects.push(describeDot(dot));
    technical.push(describeDotSource(dot));
  }
  return { effects, technical };
}

/** Stable CSS hook for a published damage type's display color, e.g. `damage-acid`. */
export function damageTypeClass(damageType: string): string {
  return `damage-${damageType.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`;
}

/**
 * Compact facts: description, one vertical list of primary stats (damage first), then `afterStats` (Relevant Mods in the skill-bar popover), then
 * non-zero published effects. IDs, keywords, zero-value/conditional DoT records and rule names stay in Technical details.
 */
export function AbilityFacts({ ability, afterStats }: { ability: Ability; afterStats?: ReactNode }) {
  const { damage, pve, timing, targeting } = ability;
  const { effects, technical } = playerEffects(ability);
  // Presentation only: published values in one vertical list (damage first), damage values in their type's color.
  const typed = (value: number) => <span className={`damage-value ${damageTypeClass(damage.damageType)}`}>{value} {damage.damageType}</span>;
  const stats: [string, ReactNode][] = [
    ['Damage', damage.damage !== null ? typed(damage.damage) : `Not published · ${damage.damageType}`],
  ];
  if (damage.healthSpecificDamage !== null) stats.push(['Health damage', typed(damage.healthSpecificDamage)]);
  if (damage.armorSpecificDamage !== null) stats.push(['Armor damage', typed(damage.armorSpecificDamage)]);
  if (damage.extraDamageIfTargetVulnerable !== null) stats.push(['If vulnerable', `+${damage.extraDamageIfTargetVulnerable}`]);
  stats.push(['Power cost', pve.powerCost], ['Reuse time', `${timing.resetTime}s`],
    ['Range', `${targeting.range}${targeting.aoe !== null ? ` · AoE ${targeting.aoe}` : ''}`], ['Min level', ability.level]);
  return <div className="ability-facts">
    <p className="ability-description">{ability.description || 'No description published.'}</p>
    <dl className="ability-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {afterStats}
    {effects.length > 0 && <section className="ability-effects" aria-label="Ability effects"><h4>Ability effects</h4>
      <ul>{effects.map((text, index) => <li key={index} className="special-text">{text}</li>)}</ul>
    </section>}
    <details className="supplementary-facts technical-details"><summary>Technical details</summary>
      <p className="official-id">Official ID: <code>{ability.id}</code> · Internal name: <code>{ability.internalName}</code></p>
      {ability.rank !== null && <p>Published Rank: {ability.rank}</p>}
      {damage.critDamageMod !== null && <p>CritDamageMod: {damage.critDamageMod}</p>}
      {technical.length > 0 && <><p>Published PvE records (source conditions not interpreted):</p>
        <ul className="technical-records">{technical.map((text, index) => <li key={index}><code>{text}</code></li>)}</ul></>}
      {ability.keywords?.length ? <p>Keywords: {ability.keywords.join(', ')}</p> : null}
      <p className="facts-provenance">Published source values without damage calculation. Min level is the official Level field; “Not published” values are absent in the source. Zero-value or conditional DoT records are listed here exactly, not as damage.</p>
    </details>
  </div>;
}
