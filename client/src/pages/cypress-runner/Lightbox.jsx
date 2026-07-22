import { useEffect, useState } from 'react';
import ModalPortal from '../testcase-dashboard/ModalPortal';

// Simpler than the testcase-dashboard Lightbox this is modeled on — screenshots
// here are already served same-origin from /api/cypress/screenshots/..., so
// no artifact-proxy indirection is needed, just the URL as-is.
const Lightbox = ({ images, startIndex, onClose }) => {
  const [idx, setIdx] = useState(startIndex);
  const multi = images.length > 1;
  const step = (delta) => { if (multi) setIdx((i) => (i + delta + images.length) % images.length); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const a = images[idx];

  return (
    <ModalPortal>
      <div className="cyr-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cyr-modal cyr-lightbox-modal" role="dialog" aria-modal="true">
          <h3 style={{ wordBreak: 'break-all' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{a.name}</span>
            {multi && <span className="cyr-lightbox-counter">{idx + 1} / {images.length}</span>}
          </h3>
          <div className="cyr-lightbox-img-wrap">
            {multi && <button type="button" className="cyr-lightbox-nav cyr-lightbox-prev" title="Previous (←)" onClick={() => step(-1)}>‹</button>}
            <img src={a.url} alt={a.name} />
            {multi && <button type="button" className="cyr-lightbox-nav cyr-lightbox-next" title="Next (→)" onClick={() => step(1)}>›</button>}
          </div>
          <div className="cyr-modal-actions">
            <a className="cyr-btn" href={a.url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
            <button className="cyr-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default Lightbox;
