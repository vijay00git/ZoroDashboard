import { useState } from 'react';
import { ImageOff, FileText, ExternalLink } from 'lucide-react';
import { runStatusClass, formatDuration, formatDateTime, isImageArtifact } from './helpers';
import Lightbox from './Lightbox';
import ModalPortal from './ModalPortal';

const RunDetailsModal = ({ item, onClose, onRetry }) => {
  const [sort, setSort] = useState({ key: 'time', dir: 'desc' });
  const [lightbox, setLightbox] = useState(null); // { images, startIndex }
  const [broken, setBroken] = useState(() => new Set()); // artifact urls whose thumbnail failed to load

  const statusLabel = item.status || 'unknown';
  const jobLabel = item.jobName || (item.pinnedJob ? item.pinnedJob : (item.category || ''));
  const link = item.buildUrl
    ? <a href={item.buildUrl} target="_blank" rel="noopener noreferrer">Build #{item.buildNumber}</a>
    : (item.jobUrl ? <a href={item.jobUrl} target="_blank" rel="noopener noreferrer">{jobLabel}</a> : jobLabel);
  const triggeredAt = formatDateTime(item.startedAt || item.queuedAt);
  const isFailed = ['FAILURE', 'ERROR', 'ABORTED'].includes(String(item.status || '').toUpperCase());

  const sortedArtifacts = (item.artifacts || []).slice().sort((a, b) => {
    const av = sort.key === 'time' ? (a.time || 0) : (a.name || '').toLowerCase();
    const bv = sort.key === 'time' ? (b.time || 0) : (b.name || '').toLowerCase();
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
  const screenshots = sortedArtifacts.filter((a) => isImageArtifact(a.name));
  const otherArtifacts = sortedArtifacts.filter((a) => !isImageArtifact(a.name));

  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const bindSort = (key) => () => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const openLightboxFor = (artifact) => {
    const startIndex = Math.max(0, screenshots.findIndex((x) => x.url === artifact.url));
    setLightbox({ images: screenshots, startIndex });
  };

  return (
    <>
      <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full" role="dialog" aria-modal="true">
          <h3><span className={`tcd-run-pill ${runStatusClass(statusLabel)}`}>{statusLabel}</span> Run details</h3>
          <div className="tcd-modal-path">{item.path}</div>
          <div className="tcd-field">
            <label>Job</label>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {link}
              {item.runId && ` · TestRail #${item.runId}`}
              {triggeredAt && ` · ${triggeredAt}`}
            </div>
          </div>
          {item.error && (
            <div className="tcd-field">
              <label>Error</label>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent-red)' }}>{item.error}</div>
            </div>
          )}
          {item.testStats && (
            <div className="tcd-field">
              <label>Results</label>
              <div style={{ fontSize: '0.9rem' }}>
                {item.testStats.tests} tests · <b style={{ color: 'var(--accent-green)' }}>{item.testStats.passes} passed</b> · <b style={{ color: 'var(--accent-red)' }}>{item.testStats.failures} failed</b> · {item.testStats.pending} pending · {formatDuration(item.testStats.duration)}
              </div>
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="tcd-field">
              <div className="tcd-shot-header">
                <label>Screenshots ({screenshots.length})</label>
                <div className="tcd-shot-sort">
                  <button type="button" className="tcd-artifact-sort-btn" onClick={bindSort('time')}>Time{sortArrow('time')}</button>
                  <button type="button" className="tcd-artifact-sort-btn" onClick={bindSort('name')}>Name{sortArrow('name')}</button>
                </div>
              </div>
              <div className="tcd-shot-grid">
                {screenshots.map((a) => {
                  const proxiedUrl = `/api/testcases/artifact-proxy?url=${encodeURIComponent(a.url)}`;
                  const isBroken = broken.has(a.url);
                  return (
                    <button type="button" key={a.url} className="tcd-shot-thumb" title={a.name} onClick={() => openLightboxFor(a)}>
                      {isBroken ? (
                        <span className="tcd-shot-broken"><ImageOff size={18} /></span>
                      ) : (
                        <img
                          src={proxiedUrl}
                          alt={a.name}
                          loading="lazy"
                          onError={() => setBroken((prev) => new Set(prev).add(a.url))}
                        />
                      )}
                      <span className="tcd-shot-caption">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {otherArtifacts.length > 0 && (
            <div className="tcd-field">
              <label>Other artifacts ({otherArtifacts.length})</label>
              <div className="tcd-artifact-table">
                {otherArtifacts.map((a) => (
                  <div className="tcd-artifact-row" key={a.url}>
                    <a className="tcd-artifact-name" href={a.url} target="_blank" rel="noopener noreferrer">
                      <FileText size={12} /> {a.name} <ExternalLink size={10} />
                    </a>
                    <span className="tcd-artifact-time">{a.time ? formatDateTime(a.time) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {screenshots.length === 0 && otherArtifacts.length === 0 && (
            <p className="tcd-modal-hint">No artifacts were archived for this build.</p>
          )}
          <div className="tcd-modal-actions">
            {isFailed && item.category && (
              <button className="tcd-btn primary" style={{ marginRight: 'auto' }} onClick={() => onRetry(item)}>Retry this file</button>
            )}
            <button className={`tcd-btn${isFailed && item.category ? '' : ' primary'}`} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
      </ModalPortal>
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.startIndex} onClose={() => setLightbox(null)} />}
    </>
  );
};

export default RunDetailsModal;
