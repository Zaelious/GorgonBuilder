import { fileURLToPath } from 'node:url';
import { generateData } from './generate-data.ts';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: npm run data:generate (offline; uses only the current pin)');
    const manifest = await generateData(
      fileURLToPath(new URL('../src/data/raw/', import.meta.url)),
      fileURLToPath(new URL('../src/generated/game-data/', import.meta.url)),
    );
    console.log(`Generated ${manifest.gameDataVersion}: ${JSON.stringify(manifest.counts)}`);
    console.log(`Diagnostics: ${JSON.stringify(manifest.diagnostics.byGroup)}; categories ${JSON.stringify(manifest.diagnostics.byCategory)}`);
    for (const artifact of Object.values(manifest.artifacts)) console.log(`${artifact.file}: ${artifact.bytes} bytes (${artifact.jsonBytes} JSON bytes), SHA-256 ${artifact.sha256}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
