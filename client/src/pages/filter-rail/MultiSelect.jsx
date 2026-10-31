import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

// Facet dropdown: each option shows how many rows it would match given the
// other active filters; options with no matches sink to the bottom.
// `matchMode`/`onMatchModeChange` (optional) add an Any / All toggle for
// fields where a test can hold several values at once (labels).
const MultiSelect = ({ label, options, selected, onChange, matchMode, onMatchModeChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const sel = new Set(selected.map(String));
  const term = q.trim().toLowerCase();
  const shown = options
    .filter((o) => !term || o.label.toLowerCase().includes(term))
    .sort((a, b) => (b.count > 0) - (a.count > 0));

  const toggle = (v) => {
    const key = String(v);
    onChange(sel.has(key) ? selected.filter((x) => String(x) !== key) : [...selected, v]);
  };

  const summary = selected.length === 0 ? 'Any'
    : selected.length === 1 ? (options.find((o) => String(o.value) === String(selected[0]))?.label || '1 selected')
      : `${matchMode === 'all' ? 'All of' : 'Any of'} ${selected.length}`;

  return (
    <div className={`frl-ms${open ? ' open' : ''}${selected.length ? ' active' : ''}`} ref={ref}>
      <button type="button" className="frl-ms-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="frl-ms-label">{label}</span>
        <span className="frl-ms-value">{summary}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="frl-ms-pop" role="listbox" aria-multiselectable="true">
          {options.length > 7 && (
            <div className="frl-ms-search">
              <Search size={12} />
              <input autoFocus placeholder={`Search ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {onMatchModeChange && (
            <div className="frl-ms-match">
              <span>Show tests with</span>
              <div className="frl-ms-match-seg" role="radiogroup" aria-label={`${label} match`}>
                {[['any', 'Any'], ['all', 'All']].map(([m, text]) => (
                  <button key={m} type="button" role="radio" aria-checked={matchMode === m} className={matchMode === m ? 'on' : ''} onClick={() => onMatchModeChange(m)}>
                    {text}
                  </button>
                ))}
              </div>
              <span>of the picked labels</span>
            </div>
          )}
          <div className="frl-ms-actions">
            <button type="button" onClick={() => onChange(shown.filter((o) => o.count > 0).map((o) => o.value))}>Select all</button>
            <button type="button" onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
          </div>
          <ul className="frl-ms-list">
            {shown.map((o) => {
              const on = sel.has(String(o.value));
              return (
                <li key={String(o.value)}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`frl-ms-opt${on ? ' on' : ''}${o.count === 0 ? ' zero' : ''}`}
                    onClick={() => toggle(o.value)}
                  >
                    <span className="frl-ms-check">{on && <Check size={11} />}</span>
                    {o.color && <span className="frl-dot" style={{ background: o.color }} />}
                    <span className="frl-ms-opt-label">{o.label}</span>
                    <span className="frl-ms-count">{o.count.toLocaleString()}</span>
                    <span
                      className="frl-ms-only"
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); onChange([o.value]); }}
                    >only</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="frl-ms-empty">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
