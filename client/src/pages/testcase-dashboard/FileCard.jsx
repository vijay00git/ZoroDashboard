import { useState } from 'react';
import { Copy, Check, Play, ChevronRight, StickyNote, ExternalLink } from 'lucide-react';
import { splitPath, numericId, statusClass, tallyFor, trendDotClass, formatDateTime, copyText, highlightParts, testRailCaseUrl } from './helpers';

const Highlighted = ({ text, term }) => {
  const [before, match, after] = highlightParts(text, term);
  return match ? <>{before}<mark>{match}</mark>{after}</> : <>{text}</>;
};

const FileCard = ({
  path, rows, visibleRows, cat, isOpen, onToggleOpen, trend, term, runStatus,
  notes, selectable, selected, onToggleSelect, onRun, canRun, onOpenNote, showToast, testrailUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const sp = splitPath(path);

  let lastRunClass = '';
  if (trend && trend.length > 0) lastRunClass = ` tcd-file-card--${trendDotClass(trend[trend.length - 1].status).replace('dot-', '')}`;

  let fileTallyEl = null;
  if (runStatus) {
    const ft = tallyFor(rows, runStatus).tally;
    const other = ft.blocked + ft.retest + ft.untested + ft.other;
    fileTallyEl = (
      <span className="tcd-file-tally" title={`${ft.passed} passed, ${ft.failed} failed, ${ft.blocked} blocked, ${ft.retest} retest, ${ft.untested} untested`}>
        <b className="fp">{ft.passed}✓</b> <b className="ff">{ft.failed}✗</b> <b className="fo">{other}○</b>
      </span>
    );
  }

  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
    showToast('Copied path', 'success');
  };

  return (
    <div className={`tcd-file-card${isOpen ? ' open' : ''}${lastRunClass}`}>
      <div className="tcd-file-summary" onClick={() => onToggleOpen(path)}>
        {selectable && (
          <input
            type="checkbox"
            className="tcd-file-select"
            title="Select for batch run"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(path, cat)}
          />
        )}
        <ChevronRight className="chev" size={13} />
        <span className="tcd-file-path"><span className="dir">{sp.dir}</span><span className="base">{sp.base}</span></span>
        {trend && trend.length > 0 && (
          <span className="tcd-file-trend" title={`Every run recorded for this file (${trend.length})`}>
            {trend.map((h, i) => (
              <span key={i} className={`tcd-trend-dot ${trendDotClass(h.status)}`} title={`${formatDateTime(h.completedAt || h.startedAt)} — ${h.status || 'unknown'}${h.jobName ? ' — ' + h.jobName : ''}`} />
            ))}
          </span>
        )}
        {fileTallyEl}
        <span className="tcd-file-count">{visibleRows.length}{visibleRows.length === rows.length ? '' : ` / ${rows.length}`} case{rows.length === 1 ? '' : 's'}</span>
        <button type="button" className={`tcd-icon-btn${copied ? ' copied' : ''}`} title="Copy file path" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className="tcd-icon-btn"
          disabled={!canRun}
          title={canRun ? 'Run on Jenkins' : `No Jenkins job configured for ${cat} yet`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (canRun) onRun(path, cat); }}
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>
      {isOpen && (
        <div className="tcd-file-body">
          <div className="tcd-tc-table">
              {visibleRows.map((r) => {
                const note = notes[r.id];
                const entry = runStatus ? runStatus.statuses[numericId(r.id)] : null;
                return (
                  <div key={`${r.id}-${r.title}`} className={`tcd-tc-row${r.commented ? ' is-commented' : ''}`}>
                    <div className="tcd-tc-id">
                      <Highlighted text={r.id} term={term} />
                      {testrailUrl && (
                        <a
                          className="tcd-tr-link"
                          href={testRailCaseUrl(testrailUrl, r.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in TestRail"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={11} />
                        </a>
                      )}
                      {r.club && <span className="tcd-badge club" title={`Clubbed under one it() block with: ${r.club}`}>clubbed</span>}
                      {r.commented && <span className="tcd-badge commented" title="This it() block is commented out in the source file">commented</span>}
                      {r.__unknown && <span className="tcd-badge unknown" title="This case ID was not found in TestRail">not in TestRail</span>}
                      <button
                        type="button"
                        className={`tcd-icon-btn tcd-note-btn${note ? ' has-note' : ''}`}
                        title={note ? note.text : 'Add a note'}
                        onClick={() => onOpenNote(r.id, r.title)}
                      >
                        <StickyNote size={13} />
                      </button>
                    </div>
                    <div className="tcd-tc-title">
                      {runStatus && (
                        <span className={`tcd-status-pill ${entry ? statusClass(entry.status) : 'st-missing'}`}>
                          <span className="sw" />{entry ? entry.status : 'not in run'}
                        </span>
                      )}
                      <span className="tcd-title-text"><Highlighted text={r.title} term={term} /></span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileCard;
