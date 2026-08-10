import { useState } from 'react';
import { X } from 'lucide-react';
import { tagColorClass } from './helpers';

// Controlled chip-style tag editor — type text then Enter/comma to commit a
// chip, Backspace on an empty draft pops the last chip, click a chip's × to
// remove it directly. `tags` is the plain string array of truth; this
// component never mutates it, just calls onChange with the next array.
const TagChipInput = ({ tags, onChange, placeholder = 'Add a tag…', autoFocus }) => {
  const [draft, setDraft] = useState('');

  const commit = (raw) => {
    const parts = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    onChange(Array.from(new Set([...tags, ...parts])));
    setDraft('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tcd-tag-input">
      {tags.map((t) => (
        <span key={t} className={`tcd-tag-chip ${tagColorClass(t)}`}>
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} title={`Remove "${t}"`}>
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
};

export default TagChipInput;
