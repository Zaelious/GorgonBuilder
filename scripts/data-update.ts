import { fileURLToPath } from 'node:url';
import { updateSnapshot } from './snapshot.ts';

export function parseArguments(args: string[]): { version?: string; latest?: boolean; check?: boolean } {
  const options: { version?: string; latest?: boolean; check?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version' && options.version === undefined && args[i + 1] && !args[i + 1]!.startsWith('--')) {
      options.version = args[++i];
    } else if (arg === '--latest' && !options.latest) options.latest = true;
    else if (arg === '--check' && !options.check) options.check = true;
    else throw new Error(`Unknown, repeated, or incomplete argument: ${arg}. Usage: npm run data:update -- [--version v490 | --latest | --check]`);
  }
  return options;
}

// Importing argument parsing from tests must not start acquisition.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await updateSnapshot({
      rawDirectory: fileURLToPath(new URL('../src/data/raw/', import.meta.url)),
      ...parseArguments(process.argv.slice(2)),
    });
    console.log(`${result.reused ? 'Validated/reused' : 'Acquired'} official ${result.manifest.upstreamVersion}; pinned in src/data/raw/snapshot.json`);
    for (const entry of result.manifest.datasets) console.log(`${entry.name}: ${entry.availability}${entry.integrity ? `, ${entry.integrity.bytes} bytes, ${entry.records} records` : ''}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
