import { useState } from 'react';
import { X, PlayCircle } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { tagColorClass } from './helpers';

// Floating pill bar (same fixed-bottom treatment as the file-selection bar)
// that appears whenever one or more case checkboxes are ticked. Adding a tag
// here applies it to every selected case in one request; the "existing tags"
// chips are the union of tags already on any selected case, so removing one
// strips it from whichever of those cases actually has it. `onRun` is only
// passed on the Cypress Runner page — Test Case Dashboard's run flow is a
// separate Jenkins-queue modal, not a one-click action, so it's omitted there.
const BulkTagBar = ({ count, existingTags, onAddTag, onRemoveTag, onRun, onClear }) => {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const parts = draft.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 0) return;
    parts.forEach((p) => onAddTag(p));
    setDraft('');
  };

  return (
    <ModalPortal>
      <div className="tcd-selection-bar tcd-selection-bar--tags">
        <div className="tcd-selection-bar-inner">
          <span className="tcd-bulk-bar-count">{count} case{count === 1 ? '' : 's'} selected</span>
          <div className="tcd-tag-input">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
              onBlur={commit}
              placeholder="Add tag to selected…"
            />
          </div>
          <button type="button" className="tcd-btn small" onClick={commit}>Add</button>
          {onRun && (
            <button type="button" className="tcd-btn small primary" title="Queue a local Cypress run for the files containing the selected cases" onClick={onRun}>
              <PlayCircle size={12} /> Run selected
            </button>
          )}
          {existingTags.length > 0 && (
            <div className="tcd-bulk-bar-existing">
              {existingTags.map((t) => (
                <span key={t} className={`tcd-tag-chip ${tagColorClass(t)}`}>
                  {t}
                  <button type="button" onClick={() => onRemoveTag(t)} title={`Remove "${t}" from selected cases`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <button type="button" className="tcd-btn small" onClick={onClear}>Clear</button>
        </div>
      </div>
    </ModalPortal>
  );
};

export default BulkTagBar;
