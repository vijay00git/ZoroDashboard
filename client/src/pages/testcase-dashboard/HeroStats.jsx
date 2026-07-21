import { ListChecks, HeartPulse, ShieldCheck, ShieldAlert, ShieldQuestion, Activity, Gauge } from 'lucide-react';
import { pctColor, timeAgo, tallyFor } from './helpers';

const Tile = ({ icon: Icon, label, value, valueColor, sub, subColor, onClick }) => (
  <div className={`tcd-kpi${onClick ? ' clickable' : ''}`} onClick={onClick}>
    <div className="tcd-kpi-icon"><Icon size={16} /></div>
    <div className="tcd-kpi-body">
      <div className="tcd-kpi-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="tcd-kpi-label">{label}</div>
      {sub && <div className="tcd-kpi-sub" style={subColor ? { color: subColor } : undefined}>{sub}</div>}
    </div>
  </div>
);

const HeroStats = ({ data, runsState, runStatus, onRecheck }) => {
  const total = data.totalCases || 0;
  const commentedCount = data.rows.filter((r) => r.commented).length;
  const unknown = data.unknownIds || [];
  const cleanCount = Math.max(0, total - commentedCount - unknown.length);
  const healthPct = total ? Math.round((cleanCount / total) * 100) : null;

  const check = data.caseIdCheck;
  const activeCount = (runsState.running || []).length + (runsState.queue || []).length;

  let syncValue = 'Checking…';
  let syncColor = 'var(--text-muted)';
  let syncSub = 'first check can take a minute';
  let SyncIcon = ShieldQuestion;
  if (check && check.available) {
    if (unknown.length === 0) {
      syncValue = 'All synced'; syncColor = 'var(--accent-green)'; SyncIcon = ShieldCheck;
    } else {
      syncValue = `${unknown.length} unknown`; syncColor = 'var(--accent-red)'; SyncIcon = ShieldAlert;
    }
    syncSub = `checked ${timeAgo(check.checkedAt)} · click to recheck`;
  }

  let runValue = '—';
  let runSub = 'no run pulled yet';
  let runColor = 'var(--text-muted)';
  if (runStatus) {
    const { tally, matched } = tallyFor(data.rows, runStatus);
    const denom = tally.passed + tally.failed;
    const rate = denom ? Math.round((tally.passed / denom) * 100) : null;
    runValue = rate == null ? `${matched}` : `${rate}%`;
    runColor = rate == null ? 'var(--text-primary)' : pctColor(rate);
    runSub = `#${runStatus.runId} · ${matched} matched`;
  }

  return (
    <div className="tcd-hero-kpis">
      <Tile icon={ListChecks} label="Test cases" value={total} sub={`${data.totalFiles} files`} />
      <Tile
        icon={HeartPulse} label="Health" value={healthPct == null ? '—' : `${healthPct}%`}
        valueColor={pctColor(healthPct)} sub={`${commentedCount} commented · ${unknown.length} unknown`}
      />
      <Tile
        icon={SyncIcon} label="TestRail sync" value={syncValue} valueColor={syncColor} sub={syncSub}
        onClick={onRecheck}
      />
      <Tile
        icon={Activity} label="Active builds" value={activeCount || 'Idle'}
        valueColor={activeCount ? 'var(--accent-cyan)' : 'var(--text-muted)'}
        sub={activeCount ? 'in progress now' : 'no builds running'}
      />
      <Tile icon={Gauge} label="Last run" value={runValue} valueColor={runColor} sub={runSub} />
    </div>
  );
};

export default HeroStats;
