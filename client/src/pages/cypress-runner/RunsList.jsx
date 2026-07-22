import { Image, Terminal, X, Send } from 'lucide-react';
import RunStatusPill from './RunStatusPill';
import { formatDuration, formatDateTime } from './helpers';

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
    <span className="cyr-badge">{formatDateTime(h.completedAt || h.startedAt)}</span>
    <button type="button" className="cyr-btn small" onClick={() => onViewLog(h)}>
      <Terminal size={12} /> Log
    </button>
    <button type="button" className="cyr-btn small" title="Send this run's report to Telegram" onClick={() => onSendTelegram(h)}>
      <Send size={12} /> Telegram
    </button>
  </div>
);

const RunsList = ({ queue, history, onDequeue, onViewLog, onViewScreenshots, onSendTelegram }) => {
  const hasQueue = queue && queue.length > 0;
  const hasHistory = history && history.length > 0;
  if (!hasQueue && !hasHistory) {
    return <p className="cyr-empty">No local runs yet — configure a project above and hit Run, or queue files from the tree.</p>;
  }
  return (
    <div className="cyr-history-list">
      {hasQueue && queue.map((item) => <QueueItem key={item.id} item={item} onDequeue={onDequeue} />)}
      {hasHistory && history.map((h) => (
        <HistoryItem key={h.id} h={h} onViewLog={onViewLog} onViewScreenshots={onViewScreenshots} onSendTelegram={onSendTelegram} />
      ))}
    </div>
  );
};

export default RunsList;
