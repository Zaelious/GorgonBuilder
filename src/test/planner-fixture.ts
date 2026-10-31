import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import type { GameDataManifest, RuntimeGameData } from '../data/repository/contracts';
import { createGameDataRepository } from '../data/repository/repository';

/** Exercise editor interactions with the committed official runtime definitions. */
export function loadPlannerFixture() {
  const directory = resolve('src/generated/game-data');
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8')) as GameDataManifest;
  const data = Object.fromEntries(Object.entries(manifest.artifacts).map(([name, artifact]) => [name,
    JSON.parse(gunzipSync(readFileSync(resolve(directory, artifact.file))).toString('utf8')) as unknown,
  ])) as RuntimeGameData;
  return createGameDataRepository(data, manifest);
}
