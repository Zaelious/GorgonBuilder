import type { BuildDocument } from '../../src/core/build/document';
import type { BuildRecord, BuildSummary } from '../../src/persistence/remote/build-record';
import { publicDocument } from '../../src/persistence/remote/public-document';

export interface PublicProfile { username: string }
export interface BuildSummaryDto {
  id: string; visibility: BuildSummary['visibility']; title: string; publicDescription: string;
  skillAId: string | null; skillBId: string | null; schemaVersion: 1; gameDataVersion: string;
  revision: number; createdAt: number; updatedAt: number; author: PublicProfile | null;
}
export interface BuildDto extends BuildSummaryDto { document: BuildDocument }
export interface MeDto { authenticated: true; profile: PublicProfile | null; needsUsername: boolean }

/** Explicit allowlist: never spread an internal row into a client response. */
export function summaryDto(row: BuildSummary, username: string | null): BuildSummaryDto {
  return {
    id: row.id, visibility: row.visibility, title: row.title, publicDescription: row.publicDescription,
    skillAId: row.skillAId, skillBId: row.skillBId, schemaVersion: row.schemaVersion, gameDataVersion: row.gameDataVersion,
    revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt,
    author: username ? { username } : null,
  };
}
export function buildDto(row: BuildRecord, username: string | null, owner: boolean): BuildDto {
  return { ...summaryDto(row, username), document: owner ? row.document : publicDocument(row.document) };
}
