import { useMemo, useState } from 'react';
import { Image, Terminal, X, Send, Search } from 'lucide-react';
import RunStatusPill from './RunStatusPill';
import { formatDuration, formatTime, STATUS_LABEL } from './helpers';
import { dateHeadingLabel } from '../testcase-dashboard/helpers';

const PAGE_SIZE = 30;
// Only statuses that can actually land in `history` (queued/running only ever
// appear in the separate `queue` list) are offered in the filter dropdown.
const HISTORY_STATUSES = ['passed', 'failed', 'killed', 'interrupted'];

const TestRailSyncBadge = ({ sync }) => {
  if (!sync) return null;
  if (sync.error) {
    return <span className="cyr-badge cyr-badge-error" title={sync.error}>TestRail sync failed</span>;
  }
  if (sync.posted > 0) {
    return <span className="cyr-badge">Synced {sync.posted} to TestRail</span>;
  }
  return null;
};

const QueueItem = ({ item, onDequeue }) => (
  <div className="cyr-history-item">
    <RunStatusPill status="queued" />
    <span className="cyr-history-spec">{item.path}</span>
    {item.cat && <span className="cyr-badge">{item.cat}</span>}
    {item.browser && <span className="cyr-badge">{item.browser}</span>}
    <span className="cyr-badge">{item.headed ? 'headed' : 'headless'}</span>
    {item.environment && <span className="cyr-badge">{item.environment}</span>}
    <button type="button" className="cyr-badge cyr-badge-btn" title="Remove from queue" onClick={() => onDequeue(item.id)}>
      <X size={11} />
    </button>
  </div>
);

const HistoryItem = ({ h, onViewLog, onViewScreenshots, onSendTelegram }) => (
  <div className="cyr-history-item">
    <RunStatusPill status={h.status} />
    <span className="cyr-history-spec">{h.specPath || 'all specs'}</span>
    {h.category && <span className="cyr-badge">{h.category}</span>}
    {h.browser && <span className="cyr-badge">{h.browser}</span>}
    <span className="cyr-badge">{h.headed ? 'headed' : 'headless'}</span>
    {h.environment && <span className="cyr-badge">{h.environment}</span>}
    {h.stats && (
      <span className="cyr-badge">
        <b style={{ color: 'var(--accent-green)' }}>{h.stats.passing}✓</b>{' '}
        <b style={{ color: 'var(--accent-red)' }}>{h.stats.failing}✗</b>
      </span>
    )}
    {h.duration ? <span className="cyr-badge">{formatDuration(h.duration)}</span> : null}
    {h.screenshots && h.screenshots.length > 0 && (
      <button type="button" className="cyr-badge cyr-badge-btn" title="View screenshots" onClick={() => onViewScreenshots(h)}>
        <Image size={11} /> {h.screenshots.length}
      </button>
    )}
    <TestRailSyncBadge sync={h.testrailSync} />
    <span className="cyr-badge" title="When this run started">Started {formatTime(h.startedAt)}</span>
    <button type="button" className="cyr-btn small" onClick={() => onViewLog(h)}>
      <Terminal size={12} /> Log
    </button>
    <button type="button" className="cyr-btn small" title="Send this run's report to Telegram" onClick={() => onSendTelegram(h)}>
      <Send size={12} /> Telegram
    </button>
  </div>
);

const RunsList = ({ queue, history, onDequeue, onViewLog, onViewScreenshots, onSendTelegram }) => {
  const [runSearch, setRunSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  const hasQueue = queue && queue.length > 0;
  const hasHistory = history && history.length > 0;

  const term = runSearch.trim().toLowerCase();
  const filtered = useMemo(() => (history || []).filter((h) => {
    if (statusFilter !== 'all' && h.status !== statusFilter) return false;
    if (term && !(h.specPath || 'all specs').toLowerCase().includes(term)) return false;
    return true;
  }), [history, statusFilter, term]);

  // Any change to the search/filter invalidates how far the user had paged,
  // so both handlers reset back to showing just the first page of results.
  const handleSearchChange = (e) => { setRunSearch(e.target.value); setVisibleLimit(PAGE_SIZE); };
  const handleStatusFilterChange = (e) => { setStatusFilter(e.target.value); setVisibleLimit(PAGE_SIZE); };

  if (!hasQueue && !hasHistory) {
    return <p className="cyr-empty">No local runs yet — configure a project above and hit Run, or queue files from the tree.</p>;
  }

  const filteredLen = filtered.length;
  const shown = Math.min(filteredLen, visibleLimit);

  let lastDateLabel = null;
  const historyEls = [];
  filtered.slice(0, visibleLimit).forEach((h, i) => {
    const label = dateHeadingLabel(h.completedAt || h.startedAt);
    if (label !== lastDateLabel) {
      historyEls.push(<h3 key={`d${i}`} className="tcd-run-date-heading">{label}</h3>);
      lastDateLabel = label;
    }
    historyEls.push(<HistoryItem key={h.id} h={h} onViewLog={onViewLog} onViewScreenshots={onViewScreenshots} onSendTelegram={onSendTelegram} />);
  });

  return (
    <div className="cyr-history-list">
      {hasQueue && queue.map((item) => <QueueItem key={item.id} item={item} onDequeue={onDequeue} />)}

      {hasHistory && (
        <div className="cyr-runs-filter-row">
          <div className="cyr-runs-search">
            <Search size={12} className="cyr-search-icon" />
            <input
              type="text"
              className="tcd-search-input cyr-search-input small"
              placeholder="Search runs by spec path…"
              value={runSearch}
              onChange={handleSearchChange}
            />
          </div>
          <select className="tcd-sort-select" value={statusFilter} onChange={handleStatusFilterChange} title="Filter by status">
            <option value="all">All statuses</option>
            {HISTORY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
          </select>
        </div>
      )}

      {hasHistory && filteredLen === 0 && (
        <p className="cyr-empty">No runs match “{runSearch}”{statusFilter !== 'all' ? ` with status ${STATUS_LABEL[statusFilter] || statusFilter}` : ''}.</p>
      )}

      {historyEls}

      {shown < filteredLen && (
        <button type="button" className="cyr-btn small cyr-load-more" onClick={() => setVisibleLimit((v) => v + PAGE_SIZE)}>
          Load more ({shown} of {filteredLen} shown)
        </button>
      )}
    </div>
  );
};

export default RunsList;
