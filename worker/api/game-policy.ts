/** Pinned canonical IDs from progression.json.gz (v490). Drift checked against the artifact.
 * Empty/one-skill drafts remain valid, as required by BuildDocument v1 and T0018 contracts.
 */
export const GAME_DATA_VERSION = "v490";
export const COMBAT_SKILL_IDS: readonly string[] = ["Angling", "AnimalHandling", "Archery", "Axe", "Bard", "BattleChemistry", "Cow", "Deer", "Druid", "FireMagic", "GiantBat", "Hammer", "IceMagic", "Knife", "Mentalism", "Necromancy", "Performance_Dance", "Performance_Percussion", "Performance_Strings", "Performance_Wind", "Pig", "Priest", "Psychology", "Rabbit", "Riding", "Shield", "Spider", "SpiritFox", "Staff", "Sword", "Unarmed", "Vampirism", "Warden", "WeatherWitching", "Werewolf"];
const combatSkills = new Set(COMBAT_SKILL_IDS);
export const isKnownCombatSkillId = (id: string): boolean => combatSkills.has(id);
