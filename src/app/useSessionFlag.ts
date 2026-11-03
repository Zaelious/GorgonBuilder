import { useCallback, useState } from 'react';
import { readSessionFlag, writeSessionFlag, type SessionFlag } from '../persistence/local/session-flags';

/** Default-off UI flag remembered for this browser session (sessionStorage), not saved in the build. */
export function useSessionFlag(flag: SessionFlag): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => readSessionFlag(flag));
  const update = useCallback((next: boolean) => { setValue(next); writeSessionFlag(flag, next); }, [flag]);
  return [value, update];
}
