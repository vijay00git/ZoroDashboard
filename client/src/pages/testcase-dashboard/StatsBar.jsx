import { CAT_ORDER, CAT_LABELS, normCat, STATUS_FILTER_ORDER, STATUS_FILTER_LABELS } from './helpers';

const StatsBar = ({ data, activeCats, onToggleCat, issueFilter, onToggleIssue, statusCounts }) => {
  const commentedCount = data.rows.filter((r) => r.commented).length;
  const unknownCount = (data.unknownIds || []).length;

  return (
    <div className="tcd-filter-bar">
      <span className="tcd-filter-bar-label">Filter</span>
      <div className="tcd-filter-chips">
        {CAT_ORDER.map((cat) => {
          let count = 0, files = 0;
          Object.keys(data.catCounts || {}).forEach((k) => { if (normCat(k) === cat) count += data.catCounts[k]; });
          Object.keys(data.fileCounts || {}).forEach((k) => { if (normCat(k) === cat) files += data.fileCounts[k]; });
          return (
            <span
              key={cat}
              className={`tcd-chip ${activeCats[cat] ? 'active' : 'inactive'}`}
              onClick={() => onToggleCat(cat)}
            >
              {CAT_LABELS[cat]} <span className="num">{count}</span> <span className="filecount">· {files} files</span>
            </span>
          );
        })}
        <span className="tcd-filter-divider" />
        <span
          className={`tcd-chip tcd-issue-chip ${issueFilter === 'commented' ? 'active' : ''}`}
          onClick={() => onToggleIssue('commented')}
          title="Files with a commented-out it() block"
        >
          Commented <span className="num">{commentedCount}</span>
        </span>
        <span
          className={`tcd-chip tcd-issue-chip ${issueFilter === 'unknown' ? 'active' : ''}`}
          onClick={() => onToggleIssue('unknown')}
          title="Case IDs not found in TestRail"
        >
          Not in TestRail <span className="num">{unknownCount}</span>
        </span>
        {statusCounts && (
          <>
            <span className="tcd-filter-divider" />
            {STATUS_FILTER_ORDER.map((key) => (
              <span
                key={key}
                className={`tcd-chip tcd-status-chip st-${key} ${issueFilter === key ? 'active' : ''}`}
                onClick={() => onToggleIssue(key)}
                title={`Cases currently ${STATUS_FILTER_LABELS[key].toLowerCase()}`}
              >
                <span className="dot" /> {STATUS_FILTER_LABELS[key]} <span className="num">{statusCounts[key] || 0}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default StatsBar;
