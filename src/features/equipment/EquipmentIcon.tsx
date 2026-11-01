import { useState } from 'react';

/** Exact IconId from official items data, using the pinned index's icon route. */
export function equipmentIconUrl(iconId: number | null | undefined, version: string): string | null {
  if (iconId == null || !Number.isSafeInteger(iconId) || iconId < 0 || !/^v?\d+$/.test(version)) return null;
  return `https://cdn.projectgorgon.com/${version.startsWith('v') ? version : `v${version}`}/icons/icon_${iconId}.png`;
}

// Consistent local line drawings for slot placeholders and failed artwork.
// These represent equipment categories, never fabricated official item artwork.
const slotPaths: Record<string, string> = {
  Head: 'M5 16v-5a7 7 0 0 1 14 0v5M5 12h14M9 12v7m6-7v7M5 16l4 3h6l4-3',
  Chest: 'M8 4l4 2 4-2 5 5-4 3v8H7v-8L3 9z',
  Legs: 'M6 4h12l1 16h-5l-2-10-2 10H5zM6 7h12',
  Hands: 'M6 12V7a1 1 0 0 1 2 0v4-6a1 1 0 0 1 2 0v6-7a1 1 0 0 1 2 0v7-6a1 1 0 0 1 2 0v8l2-2c2-1 3 1 2 2l-4 6H8l-4-6c-1-2 1-3 2-1z',
  Feet: 'M7 4h8v8l5 4v4H4v-5l3-2zM4 17h16',
  Ring: 'M8 5l4-3 4 3-4 4zM8 8a7 7 0 1 0 8 0',
  Necklace: 'M5 4C3 17 21 17 19 4M12 13l-3 4 3 4 3-4z',
  MainHand: 'M15 3l6 0v6L9 19l-4-4zM4 14l6 6M3 21l4-4',
  OffHand: 'M15 3l5 1-1 5-8 8-4-4zM5 12l7 7M4 21l5-5',
  OffHandShield: 'M4 4l8-2 8 2v8c0 5-8 10-8 10S4 17 4 12zM12 3v17M5 10h14',
  Waist: 'M3 9h18v7H3zM9 7h6v11H9z',
};

export function EquipmentIcon({ slot, iconId, version }: { slot: string; iconId?: number | null; version: string }) {
  const url = equipmentIconUrl(iconId, version);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && failedUrl !== url) return <img className="equipment-icon" src={url} alt="" width="64" height="64" loading="lazy" onError={() => setFailedUrl(url)} />;
  return <span className="equipment-icon equipment-icon-fallback" role="img" aria-label={`${slot} equipment icon`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={slotPaths[slot] ?? 'M4 7l8-4 8 4v12l-8 3-8-3zM4 7l8 4 8-4M12 11v11'} />
    </svg>
  </span>;
}
