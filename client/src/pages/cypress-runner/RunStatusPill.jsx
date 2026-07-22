import { CheckCircle2, XCircle, Loader2, Ban, HelpCircle, Clock3 } from 'lucide-react';
import { cyrStatusClass, STATUS_LABEL } from './helpers';

const STATUS_ICON = {
  queued: Clock3,
  running: Loader2,
  passed: CheckCircle2,
  failed: XCircle,
  killed: Ban,
  interrupted: HelpCircle,
};

const RunStatusPill = ({ status }) => {
  const cls = cyrStatusClass(status);
  const Icon = STATUS_ICON[status] || HelpCircle;
  const spinning = status === 'running';
  const label = STATUS_LABEL[status] || status || 'Unknown';
  return (
    <span className={`cyr-status-pill ${cls}`}>
      <Icon size={13} className={spinning ? 'spin' : ''} />
      {label}
    </span>
  );
};

export default RunStatusPill;
