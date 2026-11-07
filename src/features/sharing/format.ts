import type { GameDataRepository } from '../../data/repository/repository';
import type { BuildSummary } from '../account/api';

export function skillPairLabel(summary: Pick<BuildSummary, 'skillAId' | 'skillBId'>, data: Pick<GameDataRepository, 'getSkill'>): string {
  const names = [summary.skillAId, summary.skillBId].filter((id): id is string => id !== null).map(id => data.getSkill(id)?.name ?? id);
  return names.length ? names.join(' / ') : 'No skills chosen';
}

export function formatTime(ms: number): string {
  try { return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return new Date(ms).toISOString(); }
}

export function summarize(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return [...flat].length > limit ? `${[...flat].slice(0, limit - 1).join('')}…` : flat;
}

export type BuildSort = 'updated' | 'created' | 'name';
export function sortBuilds<T extends Pick<BuildSummary, 'title' | 'createdAt' | 'updatedAt' | 'id'>>(items: readonly T[], sort: BuildSort): T[] {
  const copy = [...items];
  if (sort === 'name') return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  const key = sort === 'created' ? 'createdAt' : 'updatedAt';
  return copy.sort((a, b) => b[key] - a[key] || (a.id < b.id ? 1 : -1));
}

/** Basic My Builds filter: every chosen combat skill must be in either slot (order-independent). */
export function matchesSkills(summary: Pick<BuildSummary, 'skillAId' | 'skillBId'>, skills: readonly (string | null)[]): boolean {
  const slots = [summary.skillAId, summary.skillBId];
  return skills.filter((id): id is string => !!id).every(id => slots.includes(id));
}

export function copyTitle(title: string): string {
  const suffix = ' (copy)';
  return `${[...title].slice(0, 120 - suffix.length).join('')}${suffix}`;
}
