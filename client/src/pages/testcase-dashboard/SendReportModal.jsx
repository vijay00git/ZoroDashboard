import { useState } from 'react';
import ModalPortal from './ModalPortal';
import { isImageArtifact } from './helpers';

export const ATTACHMENT_CAP = 30;

const countByType = (jobs) => {
  let screenshots = 0, csv = 0;
  (jobs || []).forEach((j) => {
    (j.artifacts || []).forEach((a) => {
      if (isImageArtifact(a.name)) screenshots++;
      else if (/\.csv$/i.test(a.name)) csv++;
    });
  });
  return { screenshots, csv };
};

const SendReportModal = ({ report, jobs, onClose, onSend, sending }) => {
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [includeCsv, setIncludeCsv] = useState(true);
  const { screenshots, csv } = countByType(jobs);

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal" role="dialog" aria-modal="true">
          <h3>Send report to Telegram</h3>
          <div className="tcd-modal-path">
            {report.count} job{report.count === 1 ? '' : 's'} — sent as a separate message per job, each with its own screenshots/CSV
          </div>

          <label className="tcd-checkbox-row" style={{ opacity: screenshots === 0 ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={includeScreenshots}
              disabled={screenshots === 0}
              onChange={(e) => setIncludeScreenshots(e.target.checked)}
            />
            Include screenshots ({screenshots} available)
          </label>
          <label className="tcd-checkbox-row" style={{ opacity: csv === 0 ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={includeCsv}
              disabled={csv === 0}
              onChange={(e) => setIncludeCsv(e.target.checked)}
            />
            Include CSV results files ({csv} available)
          </label>

          {((includeScreenshots && screenshots > ATTACHMENT_CAP) || (includeCsv && csv > ATTACHMENT_CAP)) && (
            <p className="tcd-modal-hint">Capped at {ATTACHMENT_CAP} files per type across the whole report — every job still gets its text message either way.</p>
          )}

          <div className="tcd-modal-actions">
            <button className="tcd-btn" onClick={onClose}>Cancel</button>
            <button
              className="tcd-btn primary"
              disabled={sending}
              onClick={() => onSend({ includeScreenshots, includeCsv })}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default SendReportModal;
