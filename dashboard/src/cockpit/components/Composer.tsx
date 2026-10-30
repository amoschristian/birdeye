import { useEffect, useRef, useState } from 'preact/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

export function Composer({ open, onClose, onSubmit }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const value = text.trim();
    if (value) onSubmit(value);
  };

  return (
    <div class="composer" role="dialog" aria-modal="true" aria-label="New task">
      <label class="composer__label" for="composer-input">
        New task
      </label>

      <input
        ref={inputRef}
        id="composer-input"
        class="composer__input"
        type="text"
        value={text}
        placeholder="What needs doing?"
        autocomplete="off"
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') onClose();
        }}
      />

      <div class="composer__actions">
        <button type="button" class="btn btn--sm" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn--sm btn--primary"
          disabled={!text.trim()}
          onClick={submit}
        >
          Add task
        </button>
      </div>
    </div>
  );
}
