import type { TreasureEffectRule } from './treasure-effect-rules';

/** Audited v490 allow-list. Templates are complete official sentences, with numeric slots only.
 * No rule is inferred from user text, display names, icons, or a new power's wording.
 * The first slot is the unconditional direct damage bonus; other slots are NOT damage.
 * Side effects remain explicit unsupported records, not silently discarded mechanics.
 */
export const DIRECT_TREASURE_DEFINITIONS = [
  {
    "powerId": "power_10202",
    "internalName": "HeavyShotFasterReuse",
    "skillId": "Archery",
    "template": "Heavy Shot deals +{n}% damage and reuse timer is -{n} seconds",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_HEAVYSHOT"
    ],
    "remainder": true
  },
  {
    "powerId": "power_1029",
    "internalName": "HastenDecapitate",
    "skillId": "Sword",
    "template": "Decapitate deals +{n} damage and reuse timer is -{n} seconds",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_DECAPITATE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_10305",
    "internalName": "FireArrowTaunt",
    "skillId": "Archery",
    "template": "Fire Arrow deals +{n} damage and taunts +{n}",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_FIREARROW"
    ],
    "remainder": true
  },
  {
    "powerId": "power_10455",
    "internalName": "BowBashTaunt",
    "skillId": "Archery",
    "template": "Bow Bash deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_BOWBASH"
    ],
    "remainder": true
  },
  {
    "powerId": "power_11253",
    "internalName": "InfuriatingBashBoostTaunt",
    "skillId": "Shield",
    "template": "Infuriating Bash deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_INFURIATINGBASH"
    ],
    "remainder": true
  },
  {
    "powerId": "power_11552",
    "internalName": "FightMeYouFoolsTaunt",
    "skillId": "Shield",
    "template": "Fight Me You Fools deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_FIGHTMEYOUFOOLS"
    ],
    "remainder": true
  },
  {
    "powerId": "power_14204",
    "internalName": "CosmicStrikeFaster",
    "skillId": "Druid",
    "template": "Cosmic Strike deals +{n} damage and reuse timer is -{n} second",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_COSMICSTRIKE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_15053",
    "internalName": "IceNovaBoost",
    "skillId": "IceMagic",
    "template": "Ice Nova and Shardblast deal +{n}% damage",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_ICENOVA",
      "MOD_ABILITY_SHARDBLAST"
    ],
    "remainder": false
  },
  {
    "powerId": "power_15154",
    "internalName": "IceNovaFaster",
    "skillId": "IceMagic",
    "template": "Ice Nova deals +{n} damage and reuse timer is -{n} seconds",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_ICENOVA"
    ],
    "remainder": true
  },
  {
    "powerId": "power_16005",
    "internalName": "KnifeBoostThrowing",
    "skillId": "Knife",
    "template": "Fan of Blades, Hamstring Throw, and Surprise Throw deal +{n}% damage and reuse timer is -{n} second",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_FANOFBLADES",
      "MOD_ABILITY_HAMSTRINGTHROW",
      "MOD_ABILITY_SURPRISETHROW"
    ],
    "remainder": true
  },
  {
    "powerId": "power_20010",
    "internalName": "CowFrontKickTaunt",
    "skillId": "Cow",
    "template": "Cow's Front Kick deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_COWFRONTKICK"
    ],
    "remainder": true
  },
  {
    "powerId": "power_20103",
    "internalName": "ClobberingHoofTaunt",
    "skillId": "Cow",
    "template": "Clobbering Hoof deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_CLOBBERINGHOOF"
    ],
    "remainder": true
  },
  {
    "powerId": "power_2012",
    "internalName": "SuperFireballFaster",
    "skillId": "FireMagic",
    "template": "Super Fireball deals +{n} damage and reuse timer is -{n} second",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_SUPERFIREBALL"
    ],
    "remainder": true
  },
  {
    "powerId": "power_20351",
    "internalName": "ToughHoofFaster",
    "skillId": "Cow",
    "template": "Tough Hoof deals +{n}% damage and reuse timer is -{n} second",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_TOUGHHOOF"
    ],
    "remainder": true
  },
  {
    "powerId": "power_20356",
    "internalName": "ToughHoofTaunt",
    "skillId": "Cow",
    "template": "Tough Hoof deals +{n} damage and taunts +{n}",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_TOUGHHOOF"
    ],
    "remainder": true
  },
  {
    "powerId": "power_3083",
    "internalName": "HipThrowRageDepletion",
    "skillId": "Unarmed",
    "template": "Hip Throw and Bodyslam deal +{n}% damage and generate -{n} Rage",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_HIPTHROW",
      "MOD_ABILITY_BODYSLAM"
    ],
    "remainder": true
  },
  {
    "powerId": "power_3401",
    "internalName": "InfuriatingFistBoostTaunt",
    "skillId": "Unarmed",
    "template": "Infuriating Fist deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_INFURIATINGFIST"
    ],
    "remainder": true
  },
  {
    "powerId": "power_4431",
    "internalName": "YouWereAdoptedPower",
    "skillId": "Psychology",
    "template": "You Were Adopted deals +{n}% damage and Power cost is -{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_YOUWEREADOPTED"
    ],
    "remainder": true
  },
  {
    "powerId": "power_5036",
    "internalName": "HeadcrackerStrategicThrustFaster",
    "skillId": "Staff",
    "template": "Headcracker and Strategic Thrust deal +{n}% damage and reuse timer is -{n} second",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_HEADCRACKER",
      "MOD_ABILITY_STRATEGICTHRUST"
    ],
    "remainder": true
  },
  {
    "powerId": "power_6087",
    "internalName": "DoubleClawFaster",
    "skillId": "Werewolf",
    "template": "Double Claw deals +{n} damage and reuse time is -{n} second",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_DOUBLECLAW"
    ],
    "remainder": true
  },
  {
    "powerId": "power_6152",
    "internalName": "SeeRedCheaper",
    "skillId": "Werewolf",
    "template": "See Red deals +{n} damage and Power cost is -{n}",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_SEERED"
    ],
    "remainder": true
  },
  {
    "powerId": "power_6174",
    "internalName": "SmellFearDetaunt",
    "skillId": "Werewolf",
    "template": "Smell Fear deals +{n}% damage and taunts -{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_SMELLFEAR"
    ],
    "remainder": true
  },
  {
    "powerId": "power_8063",
    "internalName": "SparkOfDeathTaunt",
    "skillId": "Necromancy",
    "template": "Spark of Death deals +{n}% damage and taunts +{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_SPARKOFDEATH"
    ],
    "remainder": true
  },
  {
    "powerId": "power_8253",
    "internalName": "WaveOfDarknessFaster",
    "skillId": "Necromancy",
    "template": "Wave of Darkness deals +{n} damage and reuse timer is -{n} second",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_WAVEOFDARKNESS"
    ],
    "remainder": true
  },
  {
    "powerId": "power_8309",
    "internalName": "DeathgazeFaster",
    "skillId": "Necromancy",
    "template": "Deathgaze deals +{n} damage and reuse timer is -{n} second",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_DEATHGAZE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_15051",
    "internalName": "IceNovaHealPower",
    "skillId": "IceMagic",
    "template": "Ice Nova and Shardblast deal +{n} damage and cost -{n} Power",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_ICENOVA",
      "BOOST_ABILITY_SHARDBLAST"
    ],
    "remainder": true
  },
  {
    "powerId": "power_4004",
    "internalName": "PsychoanalyzeArmorHeal",
    "skillId": "Psychology",
    "template": "Psychoanalyze deals +{n}% damage and restores {n} Armor to you",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_PSYCHOANALYZE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_4471",
    "internalName": "CauseTerrorHeal",
    "skillId": "Psychology",
    "template": "Cause Terror deals +{n} damage and restores {n} Health to you",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_CAUSETERROR"
    ],
    "remainder": true
  },
  {
    "powerId": "power_5121",
    "internalName": "PinAccuracy",
    "skillId": "Staff",
    "template": "Pin deals +{n} damage and has +{n} Accuracy (which cancels out the Evasion that certain monsters have)",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_PIN"
    ],
    "remainder": true
  },
  {
    "powerId": "power_5154",
    "internalName": "RedirectStun",
    "skillId": "Staff",
    "template": "Redirect deals +{n} damage and stuns the target",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_REDIRECT"
    ],
    "remainder": true
  },
  {
    "powerId": "power_8021",
    "internalName": "DeathGazeBoost",
    "skillId": "Necromancy",
    "template": "Deathgaze deals +{n}% damage and has +{n} Accuracy (which cancels out the Evasion that certain monsters have)",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_DEATHGAZE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_8022",
    "internalName": "DeathGazeArmorHeal",
    "skillId": "Necromancy",
    "template": "Deathgaze deals +{n} damage and restores {n} armor to you",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_DEATHGAZE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_9752",
    "internalName": "PainBubbleSelfArmor",
    "skillId": "Mentalism",
    "template": "Pain Bubble deals +{n} damage and restores {n} armor to you",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_PAINBUBBLE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_12011",
    "internalName": "ShrillCommandReduceRage",
    "skillId": "AnimalHandling",
    "template": "Shrill Command deals +{n}% damage and reduces the target's Rage by -{n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_SHRILLCOMMAND"
    ],
    "remainder": true
  },
  {
    "powerId": "power_13055",
    "internalName": "PoundToSlagHastenLookAtMyHammer",
    "skillId": "Hammer",
    "template": "Pound To Slag deals +{n} damage and hastens the current reuse timer of Look at My Hammer by {n} seconds",
    "percent": false,
    "attributes": [
      "BOOST_ABILITY_POUNDTOSLAG"
    ],
    "remainder": true
  },
  {
    "powerId": "power_13253",
    "internalName": "ThunderstrikeKnockback",
    "skillId": "Hammer",
    "template": "Thunderstrike deals +{n}% damage and knocks all targets back",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_THUNDERSTRIKE"
    ],
    "remainder": true
  },
  {
    "powerId": "power_5452",
    "internalName": "SuppressDeRage",
    "skillId": "Staff",
    "template": "Suppress deals +{n}% damage and causes targets to lose an additional {n} Rage",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_SUPPRESS"
    ],
    "remainder": true
  },
  {
    "powerId": "power_6172",
    "internalName": "SmellFearDeRage",
    "skillId": "Werewolf",
    "template": "Smell Fear deals +{n}% damage and further reduces Rage by {n}",
    "percent": true,
    "attributes": [
      "MOD_ABILITY_SMELLFEAR"
    ],
    "remainder": true
  }
] as const;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const DIRECT_TREASURE_RULES: readonly TreasureEffectRule[] = DIRECT_TREASURE_DEFINITIONS.map(def => ({
  id: `treasure:${def.internalName}`, powerId: def.powerId, internalName: def.internalName,
  description: def.template, confidence: 'assumed',
  pattern: new RegExp(`^(?:<icon=\\d+>)*${def.template.split('{n}').map(escape).join('(\\d+(?:\\.\\d+)?)').replace(/seconds?/gu, 'seconds?')}$`, 'u'),
  unmodeled: def.remainder ? 'Only the unconditional direct damage clause is modeled; accompanying taunt, reuse, resource, accuracy, control or Rage changes are preserved in the source sentence and are not simulated.' : undefined,
  interpret(match, data) {
    const hook = def.percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage';
    if (!def.attributes.every(id => data.getAttribute(id)?.displayType === (def.percent ? 'AsBuffMod' : 'AsBuffDelta')
      && data.abilities.some(a => a.skill.skillId === def.skillId && a.pve.attributeHooks[hook]?.includes(id)))) return null;
    return def.attributes.map(attributeId => ({
      part: `damage:${attributeId}`, attributeId, attributeLabel: data.getAttribute(attributeId)!.label ?? attributeId,
      category: def.percent ? 'ability-damage-percent' : 'ability-damage-flat',
      operation: def.percent ? 'percent' : 'flat', unit: def.percent ? 'fraction' : 'points',
      value: Number(match[1]) / (def.percent ? 100 : 1), sourceValue: `${match[1]}${def.percent ? '%' : ''}`,
      scope: { kind: 'ability-attribute-hook', attributeId, hook, skillId: def.skillId },
      assumptions: ['Curated exact v490 power ID, InternalName and full sentence template; only the unconditional direct damage clause is interpreted.',
        'Assumed: the prose bonus uses the corresponding official ability damage hook and existing additive flat/percentage stages. Not validated in game.'],
    }));
  },
}));
