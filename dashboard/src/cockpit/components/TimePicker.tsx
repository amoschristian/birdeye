import { useEffect, useState } from 'preact/hooks';

interface Props {
  open: boolean;
  value: string;
  onClose: () => void;
  onSubmit: (time: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

export function TimePicker({ open, value, onClose, onSubmit }: Props) {
  const [digits, setDigits] = useState('');

  useEffect(() => {
    if (open) setDigits(value.replace(':', ''));
  }, [open, value]);

  const complete = digits.length === 4;
  const valid = complete && Number(digits.slice(0, 2)) < 24 && Number(digits.slice(2)) < 60;

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        setDigits((current) => (current.length < 4 ? current + event.key : current));
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        setDigits((current) => current.slice(0, -1));
      } else if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Enter') {
        if (valid) onSubmit(digits.slice(0, 2) + ':' + digits.slice(2));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, digits, valid, onClose, onSubmit]);

  if (!open) return null;

  const padded = digits.padEnd(4, '_');
  const display = padded.slice(0, 2) + ':' + padded.slice(2);

  const press = (key: string) => {
    if (key === 'C') setDigits('');
    else if (key === '⌫') setDigits((current) => current.slice(0, -1));
    else setDigits((current) => (current.length < 4 ? current + key : current));
  };

  return (
    <div class="timepicker" role="dialog" aria-modal="true" aria-label="Due time">
      <header class="timepicker__head">
        <span class="timepicker__title">Due time</span>
        <span class="timepicker__hint">24-hour · HHMM</span>
        <span class="spacer" />
        <button type="button" class="timepicker__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div class={'timepicker__display' + (complete && !valid ? ' is-invalid' : '')}>
        {display}
      </div>

      <div class="timepicker__keys">
        {KEYS.map((key) => (
          <button type="button" class="timepicker__key" key={key} onClick={() => press(key)}>
            {key}
          </button>
        ))}
      </div>

      <div class="timepicker__actions">
        <button type="button" class="btn btn--sm" onClick={() => onSubmit('')}>
          Clear time
        </button>
        <span class="spacer" />
        <button type="button" class="btn btn--sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn--sm btn--primary"
          disabled={!valid}
          onClick={() => valid && onSubmit(digits.slice(0, 2) + ':' + digits.slice(2))}
        >
          Set
        </button>
      </div>
    </div>
  );
}
