import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal dialog (focus trap, Escape, inert background) with the planner dialog styling. */
export function Modal({ titleId, title, onClose, children, className = '', closeLabel = 'Close' }: {
  titleId: string; title: ReactNode; onClose: () => void; children: ReactNode; className?: string; closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    opener.current = document.activeElement;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
  }, []);
  return <dialog ref={dialog} className={`ability-picker account-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="picker-content">
      <header className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></header>
      {children}
    </div>
  </dialog>;
}
