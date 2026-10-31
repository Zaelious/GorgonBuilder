import { rankLabel, type Ability } from './groups';

export function AbilityFacts({ ability }: { ability: Ability }) {
  const { damage, pve, timing, targeting } = ability;
  return <div className="ability-facts">
    <p className="ability-meta">{rankLabel(ability.rank)} · Published level {ability.level}</p>
    <p className="ability-description">{ability.description || 'No description published.'}</p>
    <p className="base-label">Published base values · before equipment or modifiers</p>
    <dl className="base-stats">
      <div><dt>Power cost</dt><dd>{pve.powerCost}</dd></div>
      <div><dt>Reuse time</dt><dd>{timing.resetTime} s</dd></div>
      <div><dt>Range</dt><dd>{targeting.range}</dd></div>
      <div><dt>Base damage</dt><dd>{damage.damage ?? 'Not published'} · {damage.damageType}</dd></div>
      {damage.healthSpecificDamage !== null && <div><dt>Health-specific damage</dt><dd>{damage.healthSpecificDamage}</dd></div>}
      {damage.armorSpecificDamage !== null && <div><dt>Armor-specific damage</dt><dd>{damage.armorSpecificDamage}</dd></div>}
      {damage.extraDamageIfTargetVulnerable !== null && <div><dt>Extra damage if vulnerable</dt><dd>{damage.extraDamageIfTargetVulnerable}</dd></div>}
    </dl>
    {ability.specialInfo && <p className="special-text">{ability.specialInfo}</p>}
    {pve.specialValues?.map((value, i) => <p key={i} className="special-text">{value.label} {value.value} {value.suffix}</p>)}
    {pve.dots?.map((dot, i) => <p key={i} className="special-text">{dot.preface} {dot.damagePerTick} {dot.damageType} per tick · {dot.numTicks} ticks · Published duration {dot.duration} s{dot.specialRules?.length ? ` · ${dot.specialRules.join(', ')}` : ''}</p>)}
    <p className="official-id">Official ID: <code>{ability.id}</code></p>
  </div>;
}
