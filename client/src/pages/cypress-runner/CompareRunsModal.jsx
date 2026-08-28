import { useMemo, useState } from 'react';
import { GitCompareArrows, Image as ImageIcon } from 'lucide-react';
import ModalPortal from '../testcase-dashboard/ModalPortal';
import RunStatusPill from './RunStatusPill';
import Lightbox from './Lightbox';
import { formatDuration, formatDateTime, diffCaseResults, pairScreenshots } from './helpers';

const STATUS_LABEL_SHORT = { 1: 'Passed', 5: 'Failed', 2: 'Blocked', 4: 'Retest' };
const statusLabel = (v) => STATUS_LABEL_SHORT[v] || 'Not run';

const RunSummary = ({ h, label }) => (
  <div className="cyr-cmp-col">
    <div className="cyr-cmp-col-label">{label}</div>
    <RunStatusPill status={h.status} />
    <div className="cyr-cmp-row"><span>Started</span><b>{formatDateTime(h.startedAt)}</b></div>
    <div className="cyr-cmp-row"><span>Duration</span><b>{h.duration ? formatDuration(h.duration) : '—'}</b></div>
    <div className="cyr-cmp-row"><span>Stats</span><b>{h.stats ? `${h.stats.passing}✓ ${h.stats.failing}✗` : '—'}</b></div>
    <div className="cyr-cmp-row"><span>Screenshots</span><b>{(h.screenshots || []).length}</b></div>
  </div>
);

// A single-image thumbnail (the "only in current"/"only in previous" bins)
// — clicking it opens that one screenshot full-size in the shared Lightbox.
const ShotThumb = ({ shot, onOpen }) => (
  <button type="button" className="cyr-cmp-shot-single" title={shot.name} onClick={() => onOpen([shot], 0)}>
    <img src={shot.url} alt="" loading="lazy" />
  </button>
);

// Opened from RunsList's "Compare" button, only ever offered when a
// previous run of the exact same spec exists (findPreviousRun) — the diff
// itself is per-case (diffCaseResults) so a run whose overall verdict
// didn't change but whose individual cases shifted (a fixed test masked by
// a newly-broken one, say) is still visible.
const CompareRunsModal = ({ current, previous, onClose }) => {
  const { changed, unchangedPass, unchangedFail } = diffCaseResults(current.caseResults, previous.caseResults);
  const durationDelta = (current.duration || 0) - (previous.duration || 0);
  const { paired, onlyCurrent, onlyPrevious } = useMemo(
    () => pairScreenshots(current.screenshots, previous.screenshots),
    [current.screenshots, previous.screenshots]
  );
  const [lightbox, setLightbox] = useState(null); // { images, startIndex }
  const openLightbox = (images, startIndex) => setLightbox({ images, startIndex });
  const hasShots = paired.length > 0 || onlyCurrent.length > 0 || onlyPrevious.length > 0;

  return (
    <ModalPortal>
      <div className="cyr-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cyr-modal cyr-cmp-modal" role="dialog" aria-modal="true">
          <h3><GitCompareArrows size={15} /> Run comparison</h3>
          <div className="cyr-cmp-spec">{current.specPath || 'all specs'}</div>

          <div className="cyr-cmp-cols">
            <RunSummary h={previous} label="Previous run" />
            <RunSummary h={current} label="This run" />
          </div>

          {durationDelta !== 0 && (
            <div className="cyr-cmp-delta">
              Duration {durationDelta > 0 ? '+' : '−'}{formatDuration(Math.abs(durationDelta))} {durationDelta > 0 ? 'slower' : 'faster'} than the previous run
            </div>
          )}

          <div className="cyr-cmp-diff">
            <div className="cyr-cmp-diff-head">
              <span>{changed.length} case{changed.length === 1 ? '' : 's'} changed</span>
              <span className="cyr-cmp-unchanged">{unchangedPass} still passing · {unchangedFail} still failing</span>
            </div>
            {changed.length > 0 ? (
              <div className="cyr-cmp-diff-list">
                {changed.map((c) => (
                  <div key={c.caseId} className="cyr-cmp-diff-row">
                    <span className="cyr-cmp-case-id">C{c.caseId}</span>
                    <span className="cyr-cmp-status">{statusLabel(c.from)}</span>
                    <span className="cyr-cmp-arrow">→</span>
                    <span className="cyr-cmp-status">{statusLabel(c.to)}</span>
                    {c.to === 5 && c.from !== 5 && <span className="cyr-badge cyr-badge-error">newly failing</span>}
                    {c.to === 1 && c.from === 5 && <span className="cyr-badge cyr-badge-fixed">fixed</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="cyr-empty">No per-case differences between these two runs.</p>
            )}
          </div>

          {hasShots && (
            <div className="cyr-cmp-shots">
              <div className="cyr-cmp-diff-head">
                <span><ImageIcon size={13} /> Screenshots</span>
                {paired.length > 0 && <span className="cyr-cmp-unchanged">Click a pair to flip between before/after</span>}
              </div>

              {paired.length > 0 && (
                <div className="cyr-cmp-shot-grid">
                  {paired.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      className="cyr-cmp-shot-pair"
                      title={p.name}
                      onClick={() => openLightbox(
                        [{ name: `Previous — ${p.name}`, url: p.previous.url }, { name: `This run — ${p.name}`, url: p.current.url }],
                        1
                      )}
                    >
                      <span className="cyr-cmp-shot-thumb"><img src={p.previous.url} alt="" loading="lazy" /><label>Before</label></span>
                      <span className="cyr-cmp-shot-thumb"><img src={p.current.url} alt="" loading="lazy" /><label>After</label></span>
                    </button>
                  ))}
                </div>
              )}

              {onlyCurrent.length > 0 && (
                <div className="cyr-cmp-shot-extra">
                  <span className="cyr-cmp-unchanged">{onlyCurrent.length} new this run</span>
                  <div className="cyr-cmp-shot-grid">
                    {onlyCurrent.map((s) => <ShotThumb key={s.name} shot={s} onOpen={openLightbox} />)}
                  </div>
                </div>
              )}

              {onlyPrevious.length > 0 && (
                <div className="cyr-cmp-shot-extra">
                  <span className="cyr-cmp-unchanged">{onlyPrevious.length} only in the previous run</span>
                  <div className="cyr-cmp-shot-grid">
                    {onlyPrevious.map((s) => <ShotThumb key={s.name} shot={s} onOpen={openLightbox} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="cyr-modal-actions">
            <button className="cyr-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.startIndex} onClose={() => setLightbox(null)} />}
    </ModalPortal>
  );
};

export default CompareRunsModal;
