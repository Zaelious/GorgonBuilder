/** TEST-ONLY BuildDocument v1 fixtures for remote-persistence contract tests. */
import { createDefaultBuildDocument, type BuildDocument } from '../../../core/build/document';

export function buildFixture(skillA: string | null = 'Cow', skillB: string | null = 'Unarmed', title = 'Cow/Unarmed'): BuildDocument {
  const build = createDefaultBuildDocument({ gameDataVersion: '490', createdWithAppVersion: '0.1.0' });
  build.title = title;
  build.notes = 'Private editor notes are part of BuildDocument, not the public description. 🐄 <b>plain text</b>';
  build.skillSlotA = { skillId: skillA, level: 90 };
  build.skillSlotB = { skillId: skillB, level: 85 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }, { abilityId: 'ability_1652', rank: 'II' }];
  build.abilityBarB = [{ abilityId: 'ability_1652', rank: 2 }];
  build.equipment = [
    { slot: 'MainHand', item: { kind: 'database', itemId: 'item_45640' }, candidateMods: [], sparks: { mode: 'none' } },
    {
      slot: 'Ring',
      item: {
        kind: 'imported', instance: {
          baseItemId: 'item_49070', instanceId: 'local-instance-1', level: 90, rarity: 'Rare',
          existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }],
          provenance: { reference: 'local-storage-report', exportedAt: '2026-10-31T12:00:00Z', reportVersion: '1' },
          metadata: { IsInInventory: true, future: { raw: [null, 42, 'unchanged'] } },
        },
      },
      candidateMods: [{ powerId: 'power_10001', tierId: null }],
      sparks: {
        mode: 'simulated', input: { category: 'skill-damage', skillId: 'Unarmed', count: 15, seed: 'fixed' },
        result: {
          modelVersion: 'fixture-only',
          outcomeCounts: { allDirectDamagePercent: 1, skillDamageFlat: 2, allDirectDamageFlat: 3, skillDamagePercent: 4, skillBaseDamagePercent: 5 },
        },
      },
    },
  ];
  build.target = { count: 3, damageTypes: { Crushing: { vulnerability: 10 } } };
  build.characterImport = { reference: 'local-character-report', reportVersion: '1', exportedAt: '2026-10-31T12:00:00Z' };
  return build;
}
