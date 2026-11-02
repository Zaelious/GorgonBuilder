/** Node-only local entry point. Never imported by the browser/core API barrel. */
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { GameDataManifest, RuntimeGameData } from '../../data/repository/contracts';
import { createGameDataRepository } from '../../data/repository/repository';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { parseCharacterSheetJson } from './character';
import { parseStorageJson } from './storage';
import { summarizeImport } from './summary';

async function localResolver() {
  const directory = new URL('../../generated/game-data/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8')) as GameDataManifest;
  const entries = await Promise.all(Object.entries(manifest.artifacts).map(async ([name, artifact]) => {
    const bytes = await readFile(new URL(artifact.file, directory));
    if (bytes.length !== artifact.bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
      throw new Error('Local dataset integrity check failed.');
    }
    const decoded = gunzipSync(bytes);
    if (decoded.length !== artifact.jsonBytes) throw new Error('Local dataset size check failed.');
    return [name, JSON.parse(decoded.toString('utf8')) as unknown];
  }));
  return createImportReferenceResolver(createGameDataRepository(Object.fromEntries(entries) as RuntimeGameData, manifest));
}

export async function runImportSmoke(args: string[]): Promise<number> {
  if (args.length !== 4 || args[0] !== '--character' || args[2] !== '--storage' || !args[1] || !args[3]) {
    console.error('Usage: node --experimental-transform-types --import ./scripts/typescript-imports.ts src/core/import/smoke.ts --character /private/Character.json --storage /private/Storage.json');
    return 2;
  }
  let resolver;
  try { resolver = await localResolver(); }
  catch { console.error('Cannot verify the local official dataset. No export data was displayed.'); return 2; }
  let status = 0;
  for (const [report, filename] of [['CharacterSheet', args[1]], ['Storage', args[3]]] as const) {
    let text: string;
    try { text = await readFile(filename, 'utf8'); }
    catch { console.log(JSON.stringify({ report, recognized: false, error: 'local-file-unreadable' })); status = 1; continue; }
    const result = report === 'CharacterSheet' ? parseCharacterSheetJson(text, resolver) : parseStorageJson(text, resolver);
    console.log(JSON.stringify(summarizeImport(result), null, 2));
    if (!result.ok) status = 1;
  }
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Do not let unexpected runtime exceptions expose filenames or report values.
  runImportSmoke(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => {
    console.error('Local smoke test failed. No export data was displayed.'); process.exitCode = 2;
  });
}
