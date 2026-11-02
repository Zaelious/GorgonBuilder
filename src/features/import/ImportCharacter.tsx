import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCharacterSheetJson, parseStorageJson } from '../../core/import';
import type { ImportIssue, ImportResult, ImportedCharacterSnapshot, ImportedStorageSnapshot } from '../../core/import';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import type { GameDataRepository } from '../../data/repository/repository';
import { identityMismatch, inventoryDiagnostics, type ImportSession } from './inventory';
import './import.css';

function ReportSummary({ result, label }: { result: ImportResult<ImportedCharacterSnapshot | ImportedStorageSnapshot> | null; label: string }) {
  if (!result) return null;
  if (!result.ok) return <div className="notice warning" role="alert"><strong>{label} could not be imported.</strong>{result.errors.map((issue, index) => <p key={index}>{issue.code}: {issue.message} {issue.path && `Field: ${issue.path}`}</p>)}<p>Choose a corrected file to retry. Your current inventory and build are retained.</p></div>;
  const { source } = result.value;
  return <div className="import-report"><h3>{label}</h3><p>{source.characterName} · {source.server ?? 'Server not published'}</p>
    <p className="import-source">{source.exportedAt} · Report version {source.reportVersion}</p>
    <p>{'skills' in result.value ? `${result.value.skills.length} skills · ${result.value.knownAbilities.length} known ability entries` : `${result.value.items.length} parsed items`}</p></div>;
}

function Inspection({ session, data }: { session: ImportSession; data: GameDataRepository }) {
  const [query, setQuery] = useState('');
  const skills = session.character.skills.filter(skill => `${skill.reference.sourceId} ${skill.reference.id ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <details className="import-inspection"><summary>Verify skill levels ({session.character.skills.length})</summary>
      <label htmlFor="verify-skill">Find a representative skill</label><input id="verify-skill" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Psychology, Deer, Cow…" />
      <div className="import-table-scroll"><table><thead><tr><th>Source skill</th><th>Level</th><th>Bonus</th><th>Official mapping</th></tr></thead><tbody>{skills.slice(0, 12).map((skill, index) => <tr key={index}><td>{skill.reference.sourceId}</td><td>{skill.level}</td><td>{skill.bonusLevels ?? '—'}</td><td>{skill.reference.id ?? 'Unresolved'}</td></tr>)}</tbody></table></div>
      <p className="muted">{skills.length} matching skills; showing the first 12. Filter to check any skill.</p>
    </details>
    <details className="import-inspection"><summary>Import diagnostics · official {data.gameDataVersion}</summary>
      <dl className="import-counts">{Object.entries(inventoryDiagnostics(session, data)).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
      <p className="muted">Equipped state is unavailable. Inventory/storage location is not equipped status. Spark history is unavailable.</p>
      {session.warnings.length > 0 && <p className="warning">{session.warnings.length} compatibility warnings. Unresolved references and exact source details remain available on each item.</p>}
    </details>
  </>;
}

function ImportDialog({ data, session, onApply, onClose, opener }: { data: GameDataRepository; session: ImportSession | null; onApply: (session: ImportSession) => void; onClose: () => void; opener: HTMLElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useMemo(() => createImportReferenceResolver(data), [data]);
  const [character, setCharacter] = useState<ImportResult<ImportedCharacterSnapshot> | null>(session ? { ok: true, value: session.character, warnings: [] } : null);
  const [storage, setStorage] = useState<ImportResult<ImportedStorageSnapshot> | null>(session ? { ok: true, value: session.storage, warnings: session.warnings } : null);
  const [busy, setBusy] = useState({ character: false, storage: false });
  const sequences = useRef({ character: 0, storage: 0 });
  useEffect(() => {
    const element = dialog.current!;
    element.showModal(); element.querySelector<HTMLInputElement>('input')?.focus();
    const pending = sequences.current;
    return () => { pending.character++; pending.storage++; element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);
  async function read(file: File | undefined, kind: 'character' | 'storage') {
    if (!file) return;
    const sequence = ++sequences.current[kind];
    setBusy(previous => ({ ...previous, [kind]: true }));
    try {
      const text = await file.text();
      if (sequences.current[kind] !== sequence) return;
      if (kind === 'character') setCharacter(parseCharacterSheetJson(text, resolver));
      else setStorage(parseStorageJson(text, resolver));
    } catch {
      if (sequences.current[kind] !== sequence) return;
      const issue: ImportIssue = { severity: 'error', code: 'invalid-json', path: '', message: 'This file could not be read locally. Choose it again.' };
      const failure = { ok: false as const, errors: [issue], warnings: [] };
      if (kind === 'character') setCharacter(failure); else setStorage(failure);
    } finally {
      if (sequences.current[kind] === sequence) setBusy(previous => ({ ...previous, [kind]: false }));
    }
  }
  const mismatch = character?.ok && storage?.ok ? identityMismatch(character.value, storage.value) : null;
  const candidate: ImportSession | null = character?.ok && storage?.ok && !mismatch
    ? { character: character.value, storage: storage.value, warnings: [...character.warnings, ...storage.warnings] } : null;
  return <dialog ref={dialog} className="ability-picker import-dialog" aria-labelledby="import-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="picker-content"><header className="dialog-heading"><h2 id="import-title">Import Character</h2><button type="button" aria-label="Close import" onClick={onClose}>×</button></header>
      <p className="muted picker-help">Files stay in this browser. Importing does not change your skills, bars or loadout. My Items is cleared on refresh; selected gear remains saved in your local draft.</p>
      <div className="import-files"><div><label htmlFor="character-file">CharacterSheet JSON</label><input id="character-file" type="file" accept=".json,application/json" onChange={event => { void read(event.target.files?.[0], 'character'); event.target.value = ''; }} /></div>
        <div><label htmlFor="storage-file">Storage JSON</label><input id="storage-file" type="file" accept=".json,application/json" onChange={event => { void read(event.target.files?.[0], 'storage'); event.target.value = ''; }} /></div></div>
      {(busy.character || busy.storage) && <p role="status">Reading files locally…</p>}
      <div className="import-reports"><ReportSummary label="CharacterSheet" result={character} /><ReportSummary label="Storage" result={storage} /></div>
      {mismatch && <p className="notice warning" role="alert">{mismatch}</p>}
      {candidate && <>{(!candidate.character.source.server || !candidate.storage.source.server) && <p className="warning">A report omits server information; server matching cannot be fully verified.</p>}<Inspection session={candidate} data={data} /></>}
      <div className="equipment-actions"><button type="button" disabled={!candidate || busy.character || busy.storage} onClick={() => { if (candidate) { onApply(candidate); onClose(); } }}>{session ? 'Replace My Items inventory' : 'Use these reports'}</button><button type="button" onClick={onClose}>Cancel</button></div>
    </div>
  </dialog>;
}

export function ImportCharacter({ data, session, onApply }: { data: GameDataRepository; session: ImportSession | null; onApply: (session: ImportSession) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return <><button ref={button} type="button" onClick={() => setOpen(true)}>Import Character</button>
    {open && <ImportDialog data={data} session={session} onApply={onApply} onClose={() => setOpen(false)} opener={button.current} />}</>;
}
