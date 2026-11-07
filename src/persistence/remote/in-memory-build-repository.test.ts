import { describe, expect, it } from 'vitest';
import { userActor } from './access';
import { createInMemoryBuildRepository } from './testing/in-memory-build-repository';
import { describeBuildRepositoryContract } from './testing/build-repository-contract';
import { buildFixture } from './testing/fixtures';

describeBuildRepositoryContract('in-memory fake', () => createInMemoryBuildRepository());

describe('in-memory fake determinism', () => {
  async function scenario() {
    const repo = createInMemoryBuildRepository({ seed: 7 });
    const alice = userActor('user-alice');
    const a = await repo.create(alice, { document: buildFixture(), visibility: 'public' });
    const b = await repo.copy(userActor('user-bob'), a.ok ? a.value.id : '');
    return { a, b, all: repo.snapshot() };
  }

  it('produces identical IDs, timestamps and records for the same seed', async () => {
    expect(await scenario()).toEqual(await scenario());
  });

  it('uses injected clocks and ID generators', async () => {
    const ids = ['AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB'];
    const repo = createInMemoryBuildRepository({ now: () => 42, generateId: () => ids.shift() ?? 'invalid' });
    const first = await repo.create(userActor('u'), { document: buildFixture() });
    expect(first.ok && first.value).toMatchObject({ id: 'AAAAAAAAAAAAAAAA', createdAt: 42, updatedAt: 42 });
    await repo.create(userActor('u'), { document: buildFixture() });
    await expect(repo.create(userActor('u'), { document: buildFixture() })).rejects.toThrow(/invalid or duplicate/);
  });

  it('can enforce a canonical combat-skill allowlist', async () => {
    const repo = createInMemoryBuildRepository({ isKnownCombatSkillId: id => id === 'Cow' });
    const result = await repo.create(userActor('u'), { document: buildFixture('Cow', 'Unarmed') });
    expect(!result.ok && result.error).toMatchObject({ code: 'invalid_document', field: 'skillSlotB' });
  });
});
