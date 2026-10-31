import { useMemo, useState } from 'react';
import { ExternalLink, Pencil, ChevronDown, ChevronRight, Search, Download, Bug, Users, AlertTriangle, CalendarClock, Layers } from 'lucide-react';
import { StatusBar, Legend, DailyChart } from './Charts';
import { orderedStatuses, statusLabel, fmtNum, fmtPct, fmtDateTime, fmtDate, userName, downloadCsv } from './helpers';

function Section({ icon: Icon, title, count, actions, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="trr-card trr-section">
      <div className="trr-section-head">
        <button className="trr-section-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Icon size={15} />
          <span>{title}</span>
          {count !== undefined && <span className="trr-count-pill">{fmtNum(count)}</span>}
        </button>
        <div className="trr-spacer" />
        {open && actions}
      </div>
      {open && <div className="trr-section-body">{children}</div>}
    </div>
  );
}

function StatusTag({ summary, id }) {
  const s = orderedStatuses(summary).find((x) => x.id === id);
  return (
    <span className="trr-status-tag" style={{ '--tag': s?.color || 'var(--text-muted)' }}>
      {s?.label || statusLabel(summary, id)}
    </span>
  );
}

function TesterName({ userNames, id, onRename }) {
  return (
    <span className="trr-tester">
      {userName(userNames, id)}
      {id !== null && id !== 0 && (
        <button className="trr-icon-btn" title={`Name user #${id}`} onClick={() => onRename(id)}><Pencil size={11} /></button>
      )}
    </span>
  );
}

function StatTiles({ summary, statuses }) {
  const passed = summary.statusCounts[1] || 0;
  return (
    <div className="trr-stats">
      <div className="trr-stat hero">
        <span className="trr-stat-num">{fmtNum(summary.total)}</span>
        <span className="trr-stat-label">Total tests</span>
      </div>
      <div className="trr-stat">
        <span className="trr-stat-num">{fmtPct(summary.executed, summary.total)}</span>
        <span className="trr-stat-label">Progress · {fmtNum(summary.executed)} done</span>
      </div>
      <div className="trr-stat">
        <span className="trr-stat-num">{fmtPct(passed, summary.executed)}</span>
        <span className="trr-stat-label">Pass rate (of executed)</span>
      </div>
      {statuses.map((s) => (
        <div className="trr-stat" key={s.id}>
          <span className="trr-stat-num"><span className="trr-swatch lg" style={{ background: s.color }} />{fmtNum(summary.statusCounts[s.id] || 0)}</span>
          <span className="trr-stat-label">{s.label} · {fmtPct(summary.statusCounts[s.id] || 0, summary.total)}</span>
        </div>
      ))}
      <div className="trr-stat">
        <span className="trr-stat-num">{fmtNum(summary.defects.length)}</span>
        <span className="trr-stat-label">Bugs linked</span>
      </div>
    </div>
  );
}

function TestersTable({ summary, statuses, userNames, onRename }) {
  const outcomeStatuses = statuses.filter((s) => !s.isUntested);
  const exportCsv = () => downloadCsv(`run-${summary.runId}-testers.csv`,
    ['Tester', 'User ID', 'Tested (current status)', ...outcomeStatuses.map((s) => s.label), 'Results posted', 'Bugs linked', 'Active days', 'First result', 'Last result'],
    summary.testers.map((t) => [userName(userNames, t.userId), t.userId, t.tested, ...outcomeStatuses.map((s) => t.statusCounts[s.id] || 0), t.results, t.defects, t.activeDays, fmtDateTime(t.firstAt), fmtDateTime(t.lastAt)]));
  return (
    <Section icon={Users} title="Testers" count={summary.testers.length} actions={<button className="trr-btn small" onClick={exportCsv}><Download size={12} /> CSV</button>}>
      <p className="trr-note">“Tested” counts each test once, under whoever set its current status, so this column adds up to the run's {fmtNum(summary.executed)} executed tests. “Results posted” includes retests and re-runs.</p>
      <div className="trr-table-wrap">
        <table className="trr-table">
          <thead>
            <tr>
              <th>Tester</th>
              <th className="num">Tested</th>
              <th className="num">Share</th>
              <th className="bar-col">Status mix</th>
              {outcomeStatuses.map((s) => <th key={s.id} className="num">{s.label}</th>)}
              <th className="num">Results posted</th>
              <th className="num">Bugs</th>
              <th className="num">Days active</th>
              <th>Last result</th>
            </tr>
          </thead>
          <tbody>
            {summary.testers.map((t) => (
              <tr key={t.userId}>
                <td><TesterName userNames={userNames} id={t.userId} onRename={onRename} /></td>
                <td className="num strong">{fmtNum(t.tested)}</td>
                <td className="num">{fmtPct(t.tested, summary.executed)}</td>
                <td className="bar-col"><StatusBar statuses={statuses} counts={t.statusCounts} title={userName(userNames, t.userId)} /></td>
                {outcomeStatuses.map((s) => <td key={s.id} className="num">{t.statusCounts[s.id] ? fmtNum(t.statusCounts[s.id]) : <span className="trr-muted">0</span>}</td>)}
                <td className="num">{fmtNum(t.results)}</td>
                <td className="num">{t.defects || <span className="trr-muted">0</span>}</td>
                <td className="num">{t.activeDays}</td>
                <td className="trr-nowrap">{fmtDateTime(t.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function DefectsTable({ summary, userNames, jiraUrl, testrailUrl, onRename }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const jiraLink = (id) => (jiraUrl && /^[A-Z][A-Z0-9_]+-\d+$/i.test(id) ? `${jiraUrl}/browse/${id}` : null);
  const exportCsv = () => downloadCsv(`run-${summary.runId}-bugs.csv`,
    ['Bug', 'Summary', 'Jira status', 'Jira assignee', 'Case', 'Test title', 'Current test status', 'Linked by', 'Linked at'],
    summary.defects.flatMap((d) => d.tests.map((t) => [d.id, d.summary, d.status, d.assignee, `C${t.caseId}`, t.title, statusLabel(summary, t.statusId), userName(userNames, t.linkedBy), fmtDateTime(t.linkedAt)])));

  return (
    <Section icon={Bug} title="Bugs linked to results" count={summary.defects.length}
      actions={summary.defects.length > 0 && <button className="trr-btn small" onClick={exportCsv}><Download size={12} /> CSV</button>}>
      {summary.defects.length === 0 ? <div className="trr-empty">No bugs are linked to any result in this run.</div> : (
        <div className="trr-table-wrap">
          <table className="trr-table">
            <thead>
              <tr><th /><th>Bug</th><th>Summary</th><th>Jira status</th><th>Jira assignee</th><th className="num">Tests</th></tr>
            </thead>
            <tbody>
              {summary.defects.map((d) => {
                const isOpen = open.has(d.id);
                const link = jiraLink(d.id);
                return [
                  <tr key={d.id} className="trr-clickable" onClick={() => toggle(d.id)}>
                    <td className="trr-chev">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                    <td className="trr-mono">
                      {link ? <a href={link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{d.id} <ExternalLink size={10} /></a> : d.id}
                    </td>
                    <td className="trr-title-cell">{d.summary || <span className="trr-muted">No Jira details on the result</span>}</td>
                    <td>{d.status ? <span className="trr-pill">{d.status}</span> : <span className="trr-muted">—</span>}</td>
                    <td>{d.assignee || <span className="trr-muted">—</span>}</td>
                    <td className="num strong">{d.tests.length}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${d.id}-tests`} className="trr-subrow">
                      <td />
                      <td colSpan={5}>
                        <table className="trr-table inner">
                          <thead><tr><th>Case</th><th>Test</th><th>Current status</th><th>Linked by</th><th>Linked</th></tr></thead>
                          <tbody>
                            {d.tests.map((t) => (
                              <tr key={t.testId}>
                                <td className="trr-mono">{testrailUrl ? <a href={`${testrailUrl}/index.php?/tests/view/${t.testId}`} target="_blank" rel="noreferrer">C{t.caseId} <ExternalLink size={10} /></a> : `C${t.caseId}`}</td>
                                <td className="trr-title-cell">{t.title}</td>
                                <td><StatusTag summary={summary} id={t.statusId} /></td>
                                <td><TesterName userNames={userNames} id={t.linkedBy} onRename={onRename} /></td>
                                <td className="trr-nowrap">{fmtDateTime(t.linkedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function AttentionTable({ summary, statuses, userNames, testrailUrl, onRename }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const present = statuses.filter((s) => summary.attention.some((a) => a.statusId === s.id));
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summary.attention.filter((a) => (statusFilter === 'all' || a.statusId === statusFilter)
      && (!q || `c${a.caseId} ${a.title} ${a.comment} ${userName(userNames, a.testerId)} ${a.defects.join(' ')}`.toLowerCase().includes(q)));
  }, [summary.attention, statusFilter, query, userNames]);

  const exportCsv = () => downloadCsv(`run-${summary.runId}-needs-attention.csv`,
    ['Case', 'Title', 'Status', 'Tester', 'When', 'Version', 'Bugs', 'Comment'],
    rows.map((a) => [`C${a.caseId}`, a.title, statusLabel(summary, a.statusId), userName(userNames, a.testerId), fmtDateTime(a.at), a.version, a.defects.join(' '), a.comment]));

  return (
    <Section icon={AlertTriangle} title="Not passed (failed, retest, blocked & other)" count={summary.attentionTotal}
      actions={summary.attention.length > 0 && <button className="trr-btn small" onClick={exportCsv}><Download size={12} /> CSV</button>}>
      {summary.attention.length === 0 ? <div className="trr-empty">Every executed test passed.</div> : (
        <>
          <div className="trr-filter-row">
            <button className={`trr-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All {summary.attention.length}</button>
            {present.map((s) => (
              <button key={s.id} className={`trr-chip ${statusFilter === s.id ? 'active' : ''}`} onClick={() => setStatusFilter(s.id)}>
                <span className="trr-swatch" style={{ background: s.color }} /> {s.label} {summary.attention.filter((a) => a.statusId === s.id).length}
              </button>
            ))}
            <div className="trr-input-wrap">
              <Search size={13} />
              <input className="trr-input" placeholder="Search case, title, comment, tester, bug…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          {summary.attentionTotal > summary.attention.length && (
            <p className="trr-note">Showing the {fmtNum(summary.attention.length)} most recent of {fmtNum(summary.attentionTotal)}.</p>
          )}
          <div className="trr-table-wrap tall">
            <table className="trr-table">
              <thead><tr><th>Case</th><th>Title</th><th>Status</th><th>Tester</th><th>When</th><th>Bugs</th><th>Comment</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.testId}>
                    <td className="trr-mono">{testrailUrl ? <a href={`${testrailUrl}/index.php?/tests/view/${a.testId}`} target="_blank" rel="noreferrer">C{a.caseId} <ExternalLink size={10} /></a> : `C${a.caseId}`}</td>
                    <td className="trr-title-cell">{a.title}</td>
                    <td><StatusTag summary={summary} id={a.statusId} /></td>
                    <td>{a.testerId !== null ? <TesterName userNames={userNames} id={a.testerId} onRename={onRename} /> : <span className="trr-muted">—</span>}</td>
                    <td className="trr-nowrap">{fmtDateTime(a.at)}</td>
                    <td className="trr-mono">{a.defects.length ? a.defects.join(', ') : <span className="trr-muted">—</span>}</td>
                    <td className="trr-comment" title={a.comment}>{a.comment || <span className="trr-muted">—</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="trr-empty">Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function BreakdownRows({ rows, statuses }) {
  return (
    <div className="trr-breakdown">
      {rows.map((r) => (
        <div className="trr-breakdown-row" key={r.key}>
          <span className="trr-breakdown-label" title={r.label}>{r.label}</span>
          <StatusBar statuses={statuses} counts={r.counts} title={r.label} />
          <span className="trr-breakdown-meta">{fmtNum(r.total)} · {fmtPct(r.passed, r.total)} passed</span>
        </div>
      ))}
    </div>
  );
}

function Breakdowns({ summary, statuses, userNames, onRename }) {
  const priorityRows = summary.priorities.map((p) => ({
    key: `p${p.priorityId}`, label: summary.priorityNames[p.priorityId] || 'No priority', counts: p.counts, total: p.total, passed: p.counts[1] || 0,
  }));
  const autoRows = [
    { key: 'auto', label: 'Automation checkbox ticked', ...summary.automation.automated },
    { key: 'manual', label: 'Not ticked', ...summary.automation.manual },
  ].filter((r) => r.total).map((r) => ({ ...r, passed: r.counts[1] || 0 }));
  const assigneeRows = summary.assignees.map((a) => ({
    key: `a${a.userId}`, label: userName(userNames, a.userId), counts: a.statusCounts, total: a.total, passed: a.statusCounts[1] || 0, userId: a.userId,
  }));
  return (
    <Section icon={Layers} title="Breakdowns">
      <div className="trr-breakdown-grid">
        <div>
          <h4 className="trr-subhead">By priority</h4>
          <BreakdownRows rows={priorityRows} statuses={statuses} />
          <h4 className="trr-subhead">By TestRail automation checkbox</h4>
          <BreakdownRows rows={autoRows} statuses={statuses} />
          {summary.versions.length > 0 && (
            <>
              <h4 className="trr-subhead">Most-tested builds (results posted)</h4>
              <ul className="trr-version-list">
                {summary.versions.map((v) => <li key={v.version}><span className="trr-mono-plain">{v.version}</span><span className="trr-muted">{fmtNum(v.count)}</span></li>)}
              </ul>
            </>
          )}
        </div>
        <div>
          <h4 className="trr-subhead">By assignee <span className="trr-muted">(who the test is assigned to, not who ran it)</span></h4>
          <BreakdownRows rows={assigneeRows} statuses={statuses} />
          <p className="trr-note">
            Name a user from the Testers table (<Pencil size={10} />) and it shows here too.
            {assigneeRows.some((r) => r.userId && !userNames[r.userId]) && (
              <> Unnamed: {assigneeRows.filter((r) => r.userId && !userNames[r.userId]).map((r) => (
                <button key={r.key} className="trr-link-btn" onClick={() => onRename(r.userId)}>#{r.userId}</button>
              ))}</>
            )}
          </p>
        </div>
      </div>
    </Section>
  );
}

const RunDetail = ({ summary, settings, onRename }) => {
  const statuses = orderedStatuses(summary);
  const { userNames = {}, jiraUrl, testrailUrl } = settings;

  return (
    <div className="trr-detail">
      <div className="trr-card trr-run-head">
        <div className="trr-run-title">
          <h2>{summary.name}</h2>
          <a className="trr-run-link" href={summary.url} target="_blank" rel="noreferrer">R{summary.runId} <ExternalLink size={11} /></a>
          {summary.isCompleted ? <span className="trr-pill done">Completed {fmtDate(summary.completedOn)}</span> : <span className="trr-pill active">Active</span>}
        </div>
        <div className="trr-run-meta">
          {summary.milestone && <span>Milestone: <strong>{summary.milestone}</strong></span>}
          <span>Created {fmtDate(summary.createdOn)} by {userName(userNames, summary.createdBy)}</span>
          {summary.updatedOn && <span>Updated {fmtDateTime(summary.updatedOn)}</span>}
          {summary.planId && <span>Part of plan #{summary.planId}</span>}
        </div>
        {summary.description && <p className="trr-run-desc">{summary.description}</p>}
      </div>

      <StatTiles summary={summary} statuses={statuses} />

      <div className="trr-card">
        <StatusBar statuses={statuses} counts={summary.statusCounts} total={summary.total} size="lg" title={`R${summary.runId} — ${fmtNum(summary.total)} tests`} />
        <Legend statuses={statuses} counts={summary.statusCounts} />
      </div>

      <Section icon={CalendarClock} title="Daily activity" count={summary.resultCount}
        actions={<span className="trr-muted small">results posted per day, by status set</span>}>
        <DailyChart statuses={statuses} daily={summary.daily} />
      </Section>

      <TestersTable summary={summary} statuses={statuses} userNames={userNames} onRename={onRename} />
      <DefectsTable summary={summary} userNames={userNames} jiraUrl={jiraUrl} testrailUrl={testrailUrl} onRename={onRename} />
      <AttentionTable summary={summary} statuses={statuses} userNames={userNames} testrailUrl={testrailUrl} onRename={onRename} />
      <Breakdowns summary={summary} statuses={statuses} userNames={userNames} onRename={onRename} />
    </div>
  );
};

export default RunDetail;
