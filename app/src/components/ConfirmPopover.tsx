import { useEffect, useId, useRef } from 'react';
import './ConfirmPopover.css';

interface Props {
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

export default function ConfirmPopover({ message, confirmLabel, onConfirm, onCancel }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const labelId = useId();
  useEffect(() => {
    const anchor = panel.current?.parentElement;
    const trigger = anchor?.querySelector<HTMLButtonElement>(':scope > button');
    panel.current?.querySelector('button')?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !anchor?.contains(event.target)) onCancel();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
        trigger?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
    };
  }, [onCancel]);
  function close(action: () => void) {
    const trigger = panel.current?.parentElement?.querySelector<HTMLButtonElement>(':scope > button');
    action();
    trigger?.focus();
  }
  return <div ref={panel} className="confirm-popover glass-panel" role="dialog" aria-labelledby={labelId}>
    <p id={labelId}>{message}</p>
    <div className="confirm-actions">
      <button type="button" onClick={() => close(onCancel)}>Cancel</button>
      <button type="button" onClick={() => close(onConfirm)}>{confirmLabel}</button>
    </div>
  </div>;
}
