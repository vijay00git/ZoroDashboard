import { useState } from 'react';
import { Copy, Check, Play, ChevronRight, StickyNote, ExternalLink, UploadCloud, Tag as TagIcon, X, Zap } from 'lucide-react';
import { splitPath, numericId, statusClass, tallyFor, trendDotClass, isFlakyTrend, formatDateTime, copyText, highlightParts, testRailCaseUrl, tagColorClass } from './helpers';
import { MANUAL_STATUS_TO_ID } from '../cypress-runner/helpers';
import SelectAllCasesCheckbox from './SelectAllCasesCheckbox';

const Highlighted = ({ text, term }) => {
  const [before, match, after] = highlightParts(text, term);
  return match ? <>{before}<mark>{match}</mark>{after}</> : <>{text}</>;
};

// Only rendered when onSetManualStatus is passed in (currently just the
// Cypress Runner page) — lets a case be marked pass/fail/blocked/retest by
// hand, for statuses no automated run can produce (blocked/retest) or when
// the case was verified outside of Cypress entirely.
const MANUAL_STATUS_OPTIONS = [
  ['passed', 'Passed', 'P'],
  ['failed', 'Failed', 'F'],
  ['blocked', 'Blocked', 'B'],
  ['retest', 'Retest', 'R'],
];

const FileCard = ({
  path, rows, visibleRows, cat, isOpen, onToggleOpen, trend, term, runStatus,
  notes, selectable, selected, onToggleSelect, onRun, canRun, onOpenNote, showToast, testrailUrl,
  runLabel = 'Run on Jenkins', onSync, runCaseResults, manualStatus, onSetManualStatus,
  tags, onOpenTagModal, onRemoveTag, selectedCases, onToggleCaseSelect, onSelectManyCases,
}) => {
  const [copied, setCopied] = useState(false);
  const sp = splitPath(path);

  // runCaseResults (only ever passed by the Cypress Runner page) is this
  // file's own most recent local run, keyed by numeric case id (1=passed,
  // 5=failed) — tallying against it marks each case individually instead of
  // coloring the whole card by the run's overall pass/fail verdict, so one
  // failing case among five doesn't paint all five red. A manual override
  // (manualStatus) wins over whatever the run itself produced for that case,
  // and can populate this tally even for a file that's never actually run
  // locally at all.
  const hasManualInFile = manualStatus && rows.some((r) => manualStatus[r.id]);
  let caseResultClass = '';
  let caseResultTallyEl = null;
  if (runCaseResults || hasManualInFile) {
    let pass = 0, fail = 0, other = 0;
    rows.forEach((r) => {
      const manual = manualStatus ? manualStatus[r.id] : undefined;
      const v = manual ? MANUAL_STATUS_TO_ID[manual.status] : (runCaseResults ? runCaseResults[numericId(r.id)] : undefined);
      if (v === 1) pass++;
      else if (v === 5) fail++;
      else if (v === 2 || v === 4) other++;
    });
    if (pass + fail + other > 0) {
      caseResultClass = (fail === 0 && other === 0) ? ' tcd-file-card--pass' : ((pass === 0 && other === 0) ? ' tcd-file-card--fail' : ' tcd-file-card--partial');
      caseResultTallyEl = (
        <span className="tcd-file-tally" title={`${pass} passed, ${fail} failed, ${other} blocked/retest (this file's most recent local run + manual overrides)`}>
          <b className="fp">{pass}✓</b> <b className="ff">{fail}✗</b> {other > 0 && <b className="fo">{other}○</b>}
        </span>
      );
    }
  }

  let lastRunClass = caseResultClass;
  if (!lastRunClass && trend && trend.length > 0) lastRunClass = ` tcd-file-card--${trendDotClass(trend[trend.length - 1].status).replace('dot-', '')}`;

  const flaky = isFlakyTrend(trend);

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
        {onSelectManyCases && (
          <SelectAllCasesCheckbox
            caseIds={visibleRows.map((r) => r.id)}
            selectedCases={selectedCases || new Set()}
            onChange={onSelectManyCases}
            title="Select all cases in this file for tagging"
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
        {flaky && (
          <span className="tcd-badge flaky" title="Flaky — recent runs have flipped between pass and fail more than once">
            <Zap size={10} /> Flaky
          </span>
        )}
        {fileTallyEl}
        {caseResultTallyEl}
        <span className="tcd-file-count">{visibleRows.length}{visibleRows.length === rows.length ? '' : ` / ${rows.length}`} case{rows.length === 1 ? '' : 's'}</span>
        <button type="button" className={`tcd-icon-btn${copied ? ' copied' : ''}`} title="Copy file path" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className="tcd-icon-btn"
          disabled={!canRun}
          title={canRun ? runLabel : `No Jenkins job configured for ${cat} yet`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (canRun) onRun(path, cat); }}
        >
          <Play size={13} fill="currentColor" />
        </button>
        {onSync && (
          <button
            type="button"
            className="tcd-icon-btn"
            title="Sync results to TestRail run…"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSync(path, cat); }}
          >
            <UploadCloud size={13} />
          </button>
        )}
      </div>
      {isOpen && (
        <div className="tcd-file-body">
          <div className="tcd-tc-table">
              {visibleRows.map((r) => {
                const note = notes[r.id];
                const entry = runStatus ? runStatus.statuses[numericId(r.id)] : null;
                const caseVal = runCaseResults ? runCaseResults[numericId(r.id)] : undefined;
                const manual = manualStatus ? manualStatus[r.id] : undefined;
                const caseTags = (tags && tags[r.id]) || [];
                return (
                  <div key={`${r.id}-${r.title}`} className={`tcd-tc-row${r.commented ? ' is-commented' : ''}`}>
                    <div className="tcd-tc-id">
                      {onToggleCaseSelect && (
                        <input
                          type="checkbox"
                          className="tcd-case-select"
                          title="Select for bulk tagging"
                          checked={selectedCases ? selectedCases.has(r.id) : false}
                          onChange={() => onToggleCaseSelect(r.id)}
                        />
                      )}
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
                      {caseTags.map((t) => (
                        <span key={t} className={`tcd-tag-chip ${tagColorClass(t)}`}>
                          {t}
                          {onRemoveTag && (
                            <button type="button" onClick={() => onRemoveTag(r.id, t)} title={`Remove "${t}"`}>
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {onOpenNote && (
                        <button
                          type="button"
                          className={`tcd-icon-btn tcd-note-btn${note ? ' has-note' : ''}`}
                          title={note ? note.text : 'Add a note'}
                          onClick={() => onOpenNote(r.id, r.title)}
                        >
                          <StickyNote size={13} />
                        </button>
                      )}
                      {onOpenTagModal && (
                        <button
                          type="button"
                          className={`tcd-icon-btn tcd-tag-btn${caseTags.length ? ' has-tags' : ''}`}
                          title={caseTags.length ? `Edit tags (${caseTags.join(', ')})` : 'Add tags'}
                          onClick={() => onOpenTagModal(r.id, r.title)}
                        >
                          <TagIcon size={13} />
                        </button>
                      )}
                    </div>
                    <div className="tcd-tc-title">
                      {manual ? (
                        <span className={`tcd-status-pill manual ${statusClass(manual.status)}`} title={`Manually marked as ${manual.status}`}>
                          <span className="sw" />{manual.status}
                        </span>
                      ) : runStatus ? (
                        <span className={`tcd-status-pill ${entry ? statusClass(entry.status) : 'st-missing'}`}>
                          <span className="sw" />{entry ? entry.status : 'not in run'}
                        </span>
                      ) : runCaseResults ? (
                        <span className={`tcd-status-pill ${caseVal === 1 ? statusClass('passed') : (caseVal === 5 ? statusClass('failed') : 'st-missing')}`}>
                          <span className="sw" />{caseVal === 1 ? 'passed' : (caseVal === 5 ? 'failed' : 'not run')}
                        </span>
                      ) : onSetManualStatus ? (
                        <span className="tcd-status-pill st-missing"><span className="sw" />not run</span>
                      ) : null}
                      {onSetManualStatus && (
                        <span className="tcd-manual-status">
                          {MANUAL_STATUS_OPTIONS.map(([key, label, glyph]) => (
                            <button
                              key={key}
                              type="button"
                              className={`tcd-manual-btn ${key}${manual && manual.status === key ? ' active' : ''}`}
                              title={manual && manual.status === key ? `Clear manual "${label}" mark` : `Mark ${label} manually`}
                              onClick={() => onSetManualStatus(r.id, key)}
                            >
                              {glyph}
                            </button>
                          ))}
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
