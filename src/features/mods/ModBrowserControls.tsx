import { useId } from 'react';
import type { ModCategories, ModTargetLevel } from '../../data/search/treasure-planning';
import './mods.css';

/** Equipment-session browsing intent only; never part of the saved build. */
export interface ModBrowserState {
  query: string;
  target: ModTargetLevel;
  targetText: string;
  categories: ModCategories;
  allSkills: boolean;
  allSlots: boolean;
}

export const DEFAULT_MOD_BROWSER: ModBrowserState = {
  query: '', target: 'max', targetText: 'Max',
  categories: { generic: true, endurance: true, shamanic: true },
  allSkills: false, allSlots: false,
};

function parseTarget(text: string): ModTargetLevel | null {
  const value = text.trim();
  if (value.toLowerCase() === 'max') return 'max';
  return /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

export function ModBrowserControls({ browser, onChange }: { browser: ModBrowserState; onChange: (value: ModBrowserState) => void }) {
  const id = useId();
  const validTarget = parseTarget(browser.targetText) !== null;
  return <div className="mod-browser-controls">
    <label className="mod-search-label" htmlFor={`${id}-search`}>Search mods
      <input id={`${id}-search`} type="search" aria-label="Search treasure powers" value={browser.query} onChange={event => onChange({ ...browser, query: event.target.value })} placeholder="Effect, name, or ID…" />
    </label>
    <details className="mod-browser-settings mod-more">
      <summary>Mod Browser Settings</summary>
      <label className="mod-target-label" htmlFor={`${id}-target`}>Mod target-level preview
        <input id={`${id}-target`} aria-label="Mod target level" list={`${id}-levels`} value={browser.targetText} aria-invalid={!validTarget}
          aria-describedby={!validTarget ? `${id}-target-error` : undefined}
          onBlur={() => { if (!validTarget) onChange({ ...browser, targetText: browser.target === 'max' ? 'Max' : String(browser.target) }); }}
          onChange={event => onChange({ ...browser, targetText: event.target.value, target: parseTarget(event.target.value) ?? browser.target })} />
        <datalist id={`${id}-levels`}><option value="Max" /><option value="90" /><option value="100" /></datalist>
      </label>
      {!validTarget && <p id={`${id}-target-error`} className="warning">Use Max or a nonnegative whole target level. The previous preview is retained.</p>}
      <div className="mod-category-toggles">{([['generic', 'Generic'], ['endurance', 'Endurance'], ['shamanic', 'Shamanic Infusions']] as const).map(([key, label]) => <label key={key}>
        <input type="checkbox" checked={browser.categories[key]} onChange={event => onChange({ ...browser, categories: { ...browser.categories, [key]: event.target.checked } })} />{label}
      </label>)}<label><input type="checkbox" checked={browser.allSkills} onChange={event => onChange({ ...browser, allSkills: event.target.checked })} />All skills</label>
        <label title="Explore powers whose published slot or item profile does not list this item"><input type="checkbox" checked={browser.allSlots} onChange={event => onChange({ ...browser, allSlots: event.target.checked })} />Other slots &amp; profiles</label>
      </div>
      <details className="mod-more mod-guidance">
        <summary>How mod filtering works</summary>
        <ul>
          <li>Mods are grouped by skill. Generic (AnySkill) has an unconfirmed skill association; Endurance and Shamanic Infusions are separate categories. Unknown means the skill association is missing.</li>
          <li>Outside profile means the mod is not listed in this item's published mod pool; eligibility is unconfirmed. Other slots &amp; profiles broadens browsing, without confirming eligibility.</li>
          <li>Max previews tiers with the highest published starting level, not necessarily the strongest effect. A custom target level previews tiers whose published level range includes it; exact tiers remain available in each mod's details.</li>
          <li>Preview settings never change selected mods or their tiers.</li>
        </ul>
      </details>
    </details>
  </div>;
}
