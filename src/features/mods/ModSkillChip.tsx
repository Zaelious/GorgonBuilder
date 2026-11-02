import type { GameDataRepository } from '../../data/repository/repository';
import { skillTone, treasureCategoryLabel, treasureChipLabel } from '../../data/search/treasure-planning';
import './item-stats.css';

/** The skill determines appearance; provenance is text, never an alternative tone. */
export function ModSkillChip({ powerId, origin, data, skillA, skillB }: {
  powerId: string; origin: 'imported' | 'planned'; data: GameDataRepository; skillA: string | null; skillB: string | null;
}) {
  const power = data.getTreasurePower(powerId);
  const tone = skillTone(power, skillA, skillB, data);
  const slot = tone === 'skill-a' ? 'Skill A' : tone === 'skill-b' ? 'Skill B' : '';
  return <span className={`stat-chip stat-chip-${origin} tone-${tone}`} data-tone={tone}
    title={`${origin === 'imported' ? 'Imported working power' : 'Planned mod'} · ${slot} · ${power ? treasureCategoryLabel(power, data) : 'Unknown association'}`}>
    {treasureChipLabel(power, data)}
  </span>;
}
