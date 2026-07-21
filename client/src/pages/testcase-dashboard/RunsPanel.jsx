import {
  ChevronDown, ChevronUp, Clipboard, Send, X, CheckCircle2, XCircle, Loader2, Clock3, HelpCircle, Image, ListChecks, Ban,
} from 'lucide-react';
import { CAT_LABELS, runStatusClass, formatDuration, formatDateTime, dateHeadingLabel, isImageArtifact, todayDateKey } from './helpers';

const STATUS_ICON = {
  'rp-success': CheckCircle2,
  'rp-failure': XCircle,
  'rp-error': XCircle,
  'rp-aborted': XCircle,
  'rp-building': Loader2,
  'rp-queued': Clock3,
  'rp-unknown': HelpCircle,
};

const RunItem = ({ item, isHistory, onRemove, onOpenDetails, selectable, selected, onToggleSelect, onCancel }) => {
  const statusLabel = isHistory ? (item.status || 'unknown') : (item.status || 'queued');
  const statusCls = runStatusClass(statusLabel);
  const StatusIcon = STATUS_ICON[statusCls] || HelpCircle;
  const spinning = statusCls === 'rp-building' || statusCls === 'rp-queued';
  const cancelling = !!item.cancelRequested;
  const jobLabel = item.jobName || (item.pinnedJob ? item.pinnedJob : (item.category ? `${CAT_LABELS[item.category]} (auto)` : ''));
  const link = item.buildUrl
    ? <a href={item.buildUrl} target="_blank" rel="noopener noreferrer">Build #{item.buildNumber}</a>
    : (item.jobUrl ? <a href={item.jobUrl} target="_blank" rel="noopener noreferrer">{jobLabel}</a> : <span>{jobLabel}</span>);
  const meta = item.duration ? formatDuration(item.duration) : (item.error ? String(item.error).slice(0, 60) : '');
  const triggeredAt = formatDateTime(item.startedAt || item.queuedAt);
  const shotCount = (item.artifacts || []).filter((a) => isImageArtifact(a.name)).length;

  const body = (
    <>
      {selectable && (
        <input
          type="checkbox"
          className="tcd-file-select"
          title="Select for report"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(item.id)}
        />
      )}
      <StatusIcon size={13} className={`tcd-run-status-icon ${statusCls}${spinning ? ' spin' : ''}`} />
      <span className={`tcd-run-pill ${statusCls}`}>{statusLabel}</span>
      <span className="rpath">{item.path}</span>
      {link}
      {item.runId && <span className="tcd-run-testrail-badge" title="TestRail run this job's results sync to">TestRail #{item.runId}</span>}
      {item.testStats && (
        <span className="tcd-run-testrail-badge">
          <b style={{ color: 'var(--accent-green)' }}>{item.testStats.passes}✓</b> <b style={{ color: 'var(--accent-red)' }}>{item.testStats.failures}✗</b>
        </span>
      )}
      {shotCount > 0 && (
        <span className="tcd-run-testrail-badge" title={`${shotCount} screenshot${shotCount === 1 ? '' : 's'} archived`}>
          <Image size={11} /> {shotCount}
        </span>
      )}
      {meta && <span className="tcd-run-testrail-badge">{meta}</span>}
      {triggeredAt && <span className="tcd-run-testrail-badge">{triggeredAt}</span>}
      {cancelling && <span className="tcd-run-testrail-badge">Cancelling…</span>}
      {isHistory && item.id && !selectable && (
        <button type="button" className="tcd-run-remove-btn" title="Remove from history" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(item.id); }}>
          <X size={12} />
        </button>
      )}
      {!isHistory && onCancel && !cancelling && (
        <button type="button" className="tcd-run-cancel-btn" title={statusCls === 'rp-building' ? 'Stop this build' : 'Remove from queue'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(item); }}>
          <Ban size={12} />
        </button>
      )}
    </>
  );

  return (
    <div className="tcd-run-item tcd-run-item--clickable" title="View run details" onClick={(e) => { if (e.target.closest('a') || e.target.closest('.tcd-run-remove-btn') || e.target.closest('.tcd-run-cancel-btn') || e.target.closest('.tcd-file-select')) return; onOpenDetails(item); }}>
      {body}
    </div>
  );
};

const RunsPanel = ({
  runsState, collapsed, onToggleCollapsed, onRemoveHistory, onOpenDetails, onCopyTodayReport, onSendTelegramReport, onCancelJob,
  reportDate, onReportDateChange, reportSelectMode, onToggleReportSelectMode, selectedJobIds, onToggleJobSelected, onClearJobSelection,
}) => {
  const HISTORY_LIMIT = 100;
  const items = [];
  (runsState.running || []).forEach((r, i) => items.push({ el: <RunItem key={`r${i}`} item={r} onRemove={onRemoveHistory} onOpenDetails={onOpenDetails} onCancel={onCancelJob} /> }));
  (runsState.queue || []).forEach((q, i) => items.push({ el: <RunItem key={`q${i}`} item={q} onRemove={onRemoveHistory} onOpenDetails={onOpenDetails} onCancel={onCancelJob} /> }));

  let lastDateLabel = null;
  (runsState.history || []).slice(0, HISTORY_LIMIT).forEach((h, i) => {
    const label = dateHeadingLabel(h.completedAt || h.startedAt || h.queuedAt);
    if (label !== lastDateLabel) {
      items.push({ el: <h3 key={`d${i}`} className="tcd-run-date-heading">{label}</h3> });
      lastDateLabel = label;
    }
    items.push({
      el: (
        <RunItem
          key={`h${i}`} item={h} isHistory onRemove={onRemoveHistory} onOpenDetails={onOpenDetails}
          selectable={reportSelectMode} selected={selectedJobIds.has(h.id)} onToggleSelect={onToggleJobSelected}
        />
      ),
    });
  });

  const activeCount = (runsState.running || []).length + (runsState.queue || []).length;
  const historyLen = (runsState.history || []).length;
  const shown = Math.min(historyLen, HISTORY_LIMIT);
  const pastLabel = shown < historyLen ? `showing ${shown} of ${historyLen} past` : `${historyLen} past`;
  const reportTitle = selectedJobIds.size > 0 ? `${selectedJobIds.size} selected job${selectedJobIds.size === 1 ? '' : 's'}` : 'the chosen date';

  return (
    <div className={`tcd-runs-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="tcd-runs-header">
        <h3>Job runs</h3>
        <span className="tcd-runs-sub">{items.length > 0 ? (activeCount > 0 ? `${activeCount} active · ` : '') + pastLabel : ''}</span>
        <button type="button" className="tcd-icon-btn" title={`Copy report (${reportTitle})`} onClick={onCopyTodayReport}>
          <Clipboard size={14} />
        </button>
        <button type="button" className="tcd-icon-btn" title={`Send report to Telegram (${reportTitle})…`} onClick={onSendTelegramReport}>
          <Send size={14} />
        </button>
        <button type="button" className="tcd-icon-btn" title={collapsed ? 'Expand' : 'Collapse'} onClick={onToggleCollapsed}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      <div className="tcd-runs-report-bar">
        {selectedJobIds.size > 0 ? (
          <span className="tcd-report-selection-note">
            {selectedJobIds.size} job{selectedJobIds.size === 1 ? '' : 's'} selected for the report
            <button type="button" onClick={onClearJobSelection} title="Clear selection"><X size={12} /></button>
          </span>
        ) : (
          <input
            type="date"
            className="tcd-report-date-input"
            value={reportDate}
            max={todayDateKey()}
            onChange={(e) => onReportDateChange(e.target.value)}
            title="Report date"
          />
        )}
        <button
          type="button"
          className={`tcd-btn small${reportSelectMode ? ' primary' : ''}`}
          title={reportSelectMode ? 'Stop picking individual jobs' : 'Pick specific jobs for the report instead of a whole date'}
          onClick={onToggleReportSelectMode}
        >
          <ListChecks size={13} /> {reportSelectMode ? 'Done selecting' : 'Select jobs'}
        </button>
      </div>

      <div className="tcd-runs-list">
        {items.length === 0
          ? <p className="tcd-empty-runs">No builds triggered yet — select files below and hit Run.</p>
          : items.map((it) => it.el)}
      </div>
    </div>
  );
};

export default RunsPanel;
