import type { Ability } from './groups';

/** Player-useful published facts are always visible; only IDs/provenance/raw fields sit under Technical details. */
export function AbilityFacts({ ability }: { ability: Ability }) {
  const { damage, pve, timing, targeting } = ability;
  const effects = [
    ...(ability.specialInfo ? [ability.specialInfo] : []),
    ...(pve.specialValues ?? []).map(value => [value.label, value.value, value.suffix].filter(part => part !== null && part !== '').join(' ')),
    ...(pve.dots ?? []).map(dot => `${dot.preface ? `${dot.preface} ` : ''}${dot.damagePerTick} ${dot.damageType} per tick · ${dot.numTicks} tick${dot.numTicks === 1 ? '' : 's'}${dot.duration ? ` · ${dot.duration} s` : ''}${dot.specialRules?.length ? ` · ${dot.specialRules.join(', ')}` : ''}`),
  ];
  return <div className="ability-facts">
    <p className="ability-description">{ability.description || 'No description published.'}</p>
    <dl className="base-stats">
      <div><dt>Min Level</dt><dd>{ability.level}</dd></div>
      <div><dt>Power</dt><dd>{pve.powerCost}</dd></div>
      <div><dt>Reuse</dt><dd>{timing.resetTime} s</dd></div>
      <div><dt>Range</dt><dd>{targeting.range}{targeting.aoe !== null ? ` · AoE ${targeting.aoe}` : ''}</dd></div>
      <div><dt>Base damage</dt><dd>{damage.damage ?? 'Not published'} · {damage.damageType}</dd></div>
      {damage.healthSpecificDamage !== null && <div><dt>Health damage</dt><dd>{damage.healthSpecificDamage}</dd></div>}
      {damage.armorSpecificDamage !== null && <div><dt>Armor damage</dt><dd>{damage.armorSpecificDamage}</dd></div>}
      {damage.extraDamageIfTargetVulnerable !== null && <div><dt>If vulnerable</dt><dd>+{damage.extraDamageIfTargetVulnerable}</dd></div>}
    </dl>
    {effects.length > 0 && <section className="ability-effects" aria-label="Ability effects"><h4>Ability effects</h4>
      <ul>{effects.map((text, index) => <li key={index} className="special-text">{text}</li>)}</ul>
    </section>}
    <details className="supplementary-facts technical-details"><summary>Technical details</summary>
      <p className="official-id">Official ID: <code>{ability.id}</code> · Internal name: <code>{ability.internalName}</code></p>
      {ability.rank !== null && <p>Published Rank: {ability.rank}</p>}
      {ability.keywords?.length ? <p>Keywords: {ability.keywords.join(', ')}</p> : null}
      <p className="facts-provenance">Published source values without damage calculation. Min Level is the official Level field; values shown as “Not published” are absent in the source.</p>
    </details>
  </div>;
}
