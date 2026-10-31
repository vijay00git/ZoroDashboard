// Joins a TestRail run's tests with the Cypress Runner's view of the same
// cases — which manifest spec files hold them and their latest local result
// — reusing the Cypress Runner's own helpers so a "passed in Cypress" here
// means exactly what it means on that page.
import {
  latestCaseResultsByPath, latestRunStatusByPath, localCaseStatus, activeManualStatus,
} from '../cypress-runner/helpers';

// Ordered for display and for sorting the Cypress column.
export const CY_CATEGORIES = [
  { key: 'cy_pass_tr_not', label: 'Passed in Cypress, not in TestRail', short: 'Cypress ✓ · TestRail ✗', color: 'var(--accent-cyan)', hint: 'Candidates to mark Passed' },
  { key: 'cy_fail_tr_pass', label: 'Failed in Cypress, passed in TestRail', short: 'Cypress ✗ · TestRail ✓', color: 'var(--accent-orange)', hint: 'Possible regression' },
  { key: 'other_diff', label: 'Other mismatch', short: 'Mismatch', color: 'var(--accent-yellow)', hint: 'Blocked / retest / failed vs other' },
  { key: 'match_pass', label: 'Passed in both', short: 'Both passed', color: 'var(--accent-green)' },
  { key: 'match_fail', label: 'Failed in both', short: 'Both failed', color: 'var(--accent-red)' },
  { key: 'not_run', label: 'In Cypress, not run locally', short: 'Not run locally', color: 'var(--accent-purple)' },
  { key: 'commented', label: 'Commented out in Cypress', short: 'Commented out', color: 'var(--text-muted)' },
  { key: 'not_automated', label: 'Not in Cypress Runner', short: 'Not in Cypress', color: 'var(--text-muted)' },
];
export const CY_RANK = new Map(CY_CATEGORIES.map((c, i) => [c.key, i]));
export const CY_BY_KEY = new Map(CY_CATEGORIES.map((c) => [c.key, c]));

const SEVERITY = { failed: 5, blocked: 4, retest: 3, passed: 2, untested: 1 };

// manifestRows: /api/testcases/data rows ({ id: 'C123', path, cat, commented, club })
// history: /api/cypress/state history; manualStatus: /api/testcases/manual-status
// Returns Map(numeric case id -> { files: [{ path, cat, commented }], status }).
export function buildCypressIndex(manifestRows, history, manualStatus) {
  const caseResultsByPath = latestCaseResultsByPath(history);
  const statusByPath = latestRunStatusByPath(history);
  const manual = activeManualStatus(manualStatus, manifestRows, history);
  const out = new Map();
  manifestRows.forEach((r) => {
    const id = Number(String(r.id).replace(/^C/i, ''));
    let e = out.get(id);
    if (!e) { e = { files: [], status: null }; out.set(id, e); }
    e.files.push({ path: r.path, cat: r.cat, commented: !!r.commented });
    if (r.commented) return;
    const st = localCaseStatus(r, caseResultsByPath, statusByPath, manual);
    // A case in several spec files: the worst real verdict wins, so one
    // failing copy isn't hidden behind a passing one.
    if (!e.status || SEVERITY[st] > SEVERITY[e.status]) e.status = st;
  });
  return out;
}

export function cypressCategory(row, cyIndex, passedStatusId) {
  const e = cyIndex.get(row.caseId);
  if (!e) return 'not_automated';
  if (!e.status) return 'commented';
  if (e.status === 'untested') return 'not_run';
  const trPassed = row.statusId === passedStatusId;
  if (e.status === 'passed') return trPassed ? 'match_pass' : 'cy_pass_tr_not';
  if (e.status === 'failed') {
    if (trPassed) return 'cy_fail_tr_pass';
    return row.statusId === 5 ? 'match_fail' : 'other_diff';
  }
  return 'other_diff';
}
