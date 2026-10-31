import { useState } from 'react';
import type { Ability } from './groups';

/** The official pinned index documents v{version}/icons/icon_{IconID}.png. */
export function abilityIconUrl(iconId: number | null | undefined, version: string): string | null {
  if (iconId == null || !Number.isSafeInteger(iconId) || iconId < 0 || !/^v?\d+$/.test(version)) return null;
  const directory = version.startsWith('v') ? version : `v${version}`;
  return `https://cdn.projectgorgon.com/${directory}/icons/icon_${iconId}.png`;
}

export function AbilityIcon({ ability, version }: { ability: Ability | undefined; version: string }) {
  const url = abilityIconUrl(ability?.iconId, version);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url
    ? <img className="ability-icon" src={url} alt="" width="64" height="64" loading="lazy" onError={() => setFailedUrl(url)} />
    : <span className="ability-icon icon-fallback" role="img" aria-label="Ability icon unavailable">?</span>;
}
