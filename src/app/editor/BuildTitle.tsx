import { useRef, useState } from 'react';

export function BuildTitle({ title, readOnly, onCommit }: { title: string; readOnly: boolean; onCommit: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(title);
  const [error, setError] = useState(false);
  const finished = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function finish(action: 'enter' | 'blur' | 'cancel') {
    if (finished.current) return;
    const value = text.trim();
    if (action !== 'cancel' && !value) {
      setError(true);
      if (action === 'enter') return;
    }
    finished.current = true;
    if (action !== 'cancel' && value) onCommit(value);
    if (action === 'cancel') setError(false);
    setEditing(false);
    if (action !== 'blur') requestAnimationFrame(() => trigger.current?.focus());
  }

  return <div className="build-title">
    <h1>{editing ? <input autoFocus aria-label="Build title" aria-invalid={error} aria-describedby="title-edit-help" value={text}
      onFocus={e => e.currentTarget.select()} onChange={e => { setText(e.target.value); setError(false); }} onBlur={() => finish('blur')}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') { e.preventDefault(); finish('enter'); }
        if (e.key === 'Escape') { e.preventDefault(); finish('cancel'); }
      }} /> : <button ref={trigger} type="button" className="title-button" disabled={readOnly} aria-label={`Edit build title: ${title}`} onClick={() => {
        finished.current = false; setText(title); setError(false); setEditing(true);
      }}><span>{title}</span><svg className="title-pencil" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg></button>}</h1>
    {editing && <p id="title-edit-help" className="title-help">Enter to save · Escape to cancel</p>}
    {error && <p className="warning" role="alert">The title cannot be blank. Your previous title is unchanged.</p>}
  </div>;
}
