import { ListChecks, Activity, Gauge, CheckCircle2, XCircle } from 'lucide-react';
import { pctColor } from '../testcase-dashboard/helpers';
import { cyrRecentRunStats, formatDateTime } from './helpers';

const Tile = ({ icon: Icon, label, value, valueColor, sub, subColor }) => (
  <div className="tcd-kpi">
    <div className="tcd-kpi-icon"><Icon size={16} /></div>
    <div className="tcd-kpi-body">
      <div className="tcd-kpi-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="tcd-kpi-label">{label}</div>
      {sub && <div className="tcd-kpi-sub" style={subColor ? { color: subColor } : undefined}>{sub}</div>}
    </div>
  </div>
);

// Not a verbatim reuse of testcase-dashboard/HeroStats — that component's
// "Last run"/"TestRail sync" tiles are specifically about a live TestRail
// run-ID pull, a feature this page doesn't have; these tiles are built from
// what Cypress Runner actually has: manifest counts + its own local run
// history.
const CyrHeroStats = ({ manifestData, runState }) => {
  const activeCount = (runState.active ? 1 : 0) + (runState.queue || []).length;
  const last = (runState.history || [])[0];
  const { rate, success, failed, recent } = cyrRecentRunStats(runState.history, 20);

  let lastValue = '—';
  let lastSub = 'no runs yet';
  let lastColor = 'var(--text-muted)';
  let LastIcon = Gauge;
  if (last) {
    const isPass = last.status === 'passed';
    const isFail = last.status === 'failed' || last.status === 'killed';
    LastIcon = isPass ? CheckCircle2 : XCircle;
    lastValue = last.status.charAt(0).toUpperCase() + last.status.slice(1);
    lastColor = isPass ? 'var(--accent-green)' : (isFail ? 'var(--accent-red)' : 'var(--accent-yellow)');
    lastSub = `${last.specPath || 'all specs'} · ${formatDateTime(last.completedAt || last.startedAt)}`;
  }

  return (
    <div className="tcd-hero-kpis">
      <Tile icon={ListChecks} label="Test cases" value={manifestData.totalCases || 0} sub={`${manifestData.totalFiles || 0} files`} />
      <Tile
        icon={Activity} label="Active runs" value={activeCount || 'Idle'}
        valueColor={activeCount ? 'var(--accent-cyan)' : 'var(--text-muted)'}
        sub={activeCount ? 'in progress now' : 'no runs running'}
      />
      <Tile icon={LastIcon} label="Last run" value={lastValue} valueColor={lastColor} sub={lastSub} />
      <Tile
        icon={Gauge} label={`Pass rate (last ${recent.length || 0})`} value={rate == null ? '—' : `${rate}%`}
        valueColor={pctColor(rate)} sub={recent.length ? `${success} passed · ${failed} failed` : 'no completed runs yet'}
      />
    </div>
  );
};

export default CyrHeroStats;
