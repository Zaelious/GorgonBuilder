import type { Ability } from './groups';

function ShortDescription({ text }: { text: string }) {
  if (text.length <= 240) return <p className="ability-description">{text || 'No description published.'}</p>;
  return <div className="ability-description"><p className="description-preview">{text.slice(0, 240).replace(/\s+\S*$/, '')}…</p>
    <details className="full-description"><summary>Read full description</summary><p>{text}</p></details>
  </div>;
}

/** Compact source facts; expanded prose and technical fields stay available on demand. */
export function AbilityFacts({ ability }: { ability: Ability }) {
  const { damage, pve, timing, targeting } = ability;
  const shortSpecial = ability.specialInfo && ability.specialInfo.length <= 160;
  return <div className="ability-facts">
    <ShortDescription text={ability.description} />
    <dl className="base-stats">
      <div><dt>Min Level</dt><dd>{ability.level}</dd></div>
      <div><dt>Power</dt><dd>{pve.powerCost}</dd></div>
      <div><dt>Reuse</dt><dd>{timing.resetTime} s</dd></div>
      <div><dt>Range</dt><dd>{targeting.range}</dd></div>
      <div><dt>Base damage</dt><dd>{damage.damage ?? 'Not published'} · {damage.damageType}</dd></div>
    </dl>
    {shortSpecial && <p className="special-text">{ability.specialInfo}</p>}
    <details className="supplementary-facts"><summary>More details</summary>
      <p className="facts-provenance">Published source values. Min Level is the official Level field.</p>
      <p className="official-id">Official ID: <code>{ability.id}</code></p>
      {ability.rank !== null && <p>Published Rank: {ability.rank}</p>}
      <dl className="base-stats">
        {damage.healthSpecificDamage !== null && <div><dt>Health-specific damage</dt><dd>{damage.healthSpecificDamage}</dd></div>}
        {damage.armorSpecificDamage !== null && <div><dt>Armor-specific damage</dt><dd>{damage.armorSpecificDamage}</dd></div>}
        {damage.extraDamageIfTargetVulnerable !== null && <div><dt>Extra damage if vulnerable</dt><dd>{damage.extraDamageIfTargetVulnerable}</dd></div>}
      </dl>
      {!shortSpecial && ability.specialInfo && <p className="special-text">{ability.specialInfo}</p>}
      {pve.specialValues?.map((value, i) => <p key={i} className="special-text">{value.label} {value.value} {value.suffix}</p>)}
      {pve.dots?.map((dot, i) => <p key={i} className="special-text">{dot.preface} {dot.damagePerTick} {dot.damageType} per tick · {dot.numTicks} ticks · Duration {dot.duration} s{dot.specialRules?.length ? ` · ${dot.specialRules.join(', ')}` : ''}</p>)}
    </details>
  </div>;
}
