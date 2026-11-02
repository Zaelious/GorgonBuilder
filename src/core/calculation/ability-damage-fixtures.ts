import { cowUnarmedFixture, psychologyFixture } from './fixtures';

/** Controlled synthetic builds using exact v490 identities, not customer measurements. */
export function abilityDamageFixtures(gameDataVersion: string) {
  return [
    { name: 'psychology-mock', abilityId: 'ability_6553', build: psychologyFixture(gameDataVersion) },
    { name: 'psychology-strike-a-nerve', abilityId: 'ability_1298', build: psychologyFixture(gameDataVersion) },
    { name: 'cow-front-kick', abilityId: 'ability_6124', build: cowUnarmedFixture(gameDataVersion) },
    { name: 'unarmed-front-kick', abilityId: 'ability_8169', build: cowUnarmedFixture(gameDataVersion) },
  ] as const;
}
