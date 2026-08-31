import { Bug } from 'lucide-react';
import { formatDateTime } from './helpers';

// Groups of cases sharing one linked bug ticket (cyrGroupBugLinks), most-
// linked-first — click a case chip to jump the tree's search to it, same
// "focus" affordance FlakySpecsCard already offers per spec.
const BugsCard = ({ groups, onFocusCase }) => {
  const caseCount = groups.reduce((sum, g) => sum + g.cases.length, 0);

  return (
    <div className="tcd-card cyr-bugs-card">
      <p className="tcd-card-title">
        <Bug size={13} /> Linked bugs
        <span className="tcd-card-title-sub">
          {groups.length} bug{groups.length === 1 ? '' : 's'} · {caseCount} case{caseCount === 1 ? '' : 's'}
        </span>
      </p>
      {groups.length === 0 ? (
        <div className="tcd-hero-empty">
          <div className="tcd-hero-empty-icon"><Bug size={20} /></div>
          <p>No bugs linked yet.</p>
          <p className="tcd-modal-hint">Click the bug icon on a failing case to link a ticket (e.g. EVB-1234).</p>
        </div>
      ) : (
        <ul className="cyr-bugs-list">
          {groups.map((g) => (
            <li key={g.bugId} className="cyr-bugs-item">
              <div className="cyr-bugs-item-head">
                <span className="cyr-bugs-id">{g.bugId}</span>
                <span className="cyr-bugs-count">{g.cases.length} case{g.cases.length === 1 ? '' : 's'}</span>
              </div>
              <div className="cyr-bugs-cases">
                {g.cases.map((c) => (
                  <button
                    type="button"
                    key={c.caseId}
                    className="cyr-bugs-case-chip"
                    title={`Linked ${formatDateTime(c.updatedAt)} — click to find in the tree`}
                    onClick={() => onFocusCase(c.caseId)}
                  >
                    {c.caseId}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BugsCard;
