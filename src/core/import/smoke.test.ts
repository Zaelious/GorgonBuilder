// @vitest-environment node
import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import type { JsonObject } from '../../data/normalized/progression';
import { parseCharacterSheet, parseStorage } from './index';
import { summarizeImport } from './summary';

const directory = mkdtempSync(join(tmpdir(), 'gorgon-import-smoke-'));
afterAll(() => { rmSync(directory, { recursive: true, force: true }); });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as JsonObject;
const sentinel = 'PRIVATE_CUSTOMER_SENTINEL';
function run(characterText: string, storageText: string, missing = false) {
  const characterPath = join(directory, `${sentinel}-character.json`);
  const storagePath = join(directory, `${sentinel}-storage.json`);
  writeFileSync(characterPath, characterText); writeFileSync(storagePath, storageText);
  const result = spawnSync(process.execPath, [
    '--experimental-transform-types', '--import', './scripts/typescript-imports.ts', 'src/core/import/smoke.ts',
    '--character', characterPath, '--storage', missing ? join(directory, sentinel) : storagePath,
  ], { cwd: root, encoding: 'utf8', timeout: 15000 });
  expect(result.error).toBeUndefined();
  expect(result.stdout + result.stderr).not.toContain(sentinel);
  return result;
}

it('summarizes counts and unchecked mappings without names, raw text or metadata', () => {
  const character = fixture('character-sheet'); character.Character = sentinel; character.Future = { [sentinel]: sentinel };
  const summary = summarizeImport(parseCharacterSheet(character));
  expect(summary).toMatchObject({ recognized: true, skills: 2, knownAbilities: 3, currentStats: 2,
    uncheckedReferences: 5, exportedAt: '2026-11-01T12:00:00.000Z', reportVersion: 1 });
  expect(JSON.stringify(summary)).not.toContain(sentinel);
  expect(summarizeImport(parseStorage(fixture('storage')))).toMatchObject({ importedItems: 2, recognizedExactPowerTiers: 0,
    uncheckedItemReferences: 2, authoritativeEquippedState: 'unavailable' });
});

it('redacts unknown timestamp/version strings and source-derived issue paths', () => {
  const input = fixture('character-sheet'); input.Timestamp = sentinel; input.ReportVersion = `${sentinel} private`;
  input.Skills = { [sentinel]: { Level: 'invalid' } };
  const summary = summarizeImport(parseCharacterSheet(input));
  expect(summary).toMatchObject({ recognized: false, errors: { 'invalid-field-type': 1 } });
  expect(JSON.stringify(summary)).not.toContain(sentinel);
  input.Skills = {};
  const accepted = summarizeImport(parseCharacterSheet(input));
  expect(accepted).toMatchObject({ exportedAt: 'unverified (retained locally)', reportVersion: 'nonstandard (retained locally)' });
  expect(JSON.stringify(accepted)).not.toContain(sentinel);
});

it('runs both sanitized reports locally with official resolution and private source fields', () => {
  const character = fixture('character-sheet'); character.Character = sentinel; character.ServerName = sentinel;
  character.Future = { [sentinel]: sentinel };
  const storage = fixture('storage'); storage.Character = sentinel; storage.Future = sentinel;
  const result = run(JSON.stringify(character), JSON.stringify(storage));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"skills": 2');
  expect(result.stdout).toContain('"importedItems": 2');
  expect(result.stdout).toContain('"recognizedExactPowerTiers": 2');
  expect(result.stdout).toContain('"recognizedImbuePowerTiers": 1');
  expect(result.stdout).toContain('"authoritativeEquippedState": "unavailable"');
  expect(result.stdout).toContain('"unresolvedItemReferences": 1');
});

it('recognizes the next-XP sentinel fixture through the Node CLI with pinned official data', () => {
  const character = fixture('character-sheet-no-next-xp');
  character.Character = sentinel;
  const result = run(JSON.stringify(character), JSON.stringify(fixture('storage')));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('"report": "CharacterSheet"');
  expect(result.stdout).toContain('"skills": 1');
  expect(result.stdout).toContain('"unresolvedReferences": 1');
  expect(result.stdout).not.toContain('invalid-field-type');
});

it('reports each failure separately without leaking malformed input or filesystem paths', () => {
  const result = run(`{ ${sentinel}`, JSON.stringify(fixture('storage')), true);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('"invalid-json": 1');
  expect(result.stdout).toContain('local-file-unreadable');
  expect(result.stderr).not.toContain(directory);
});

it('returns nonzero for wrong report types while still processing the other report', () => {
  const result = run(JSON.stringify(fixture('storage')), JSON.stringify(fixture('storage')));
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('"wrong-report-type": 1');
  expect(result.stdout).toContain('"importedItems": 2');
});
