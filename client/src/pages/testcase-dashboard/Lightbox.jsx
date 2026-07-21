import { useEffect, useState } from 'react';
import ModalPortal from './ModalPortal';

// images: ordered list the row was clicked from (already respects the
// details popup's current name/time sort) so paging steps through
// screenshots in the same order the user sees them in the list.
const Lightbox = ({ images, startIndex, onClose }) => {
  const [idx, setIdx] = useState(startIndex);
  const multi = images.length > 1;
  const step = (delta) => { if (multi) setIdx((i) => (i + delta + images.length) % images.length); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const a = images[idx];
  const proxiedUrl = `/api/testcases/artifact-proxy?url=${encodeURIComponent(a.url)}`;

  return (
    <ModalPortal>
    <div className="tcd-modal-overlay tcd-lightbox-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tcd-modal tcd-lightbox-modal" role="dialog" aria-modal="true">
        <h3 style={{ wordBreak: 'break-all' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{a.name}</span>
          {multi && <span className="tcd-lightbox-counter">{idx + 1} / {images.length}</span>}
        </h3>
        <div className="tcd-lightbox-img-wrap">
          {multi && <button type="button" className="tcd-lightbox-nav tcd-lightbox-prev" title="Previous (←)" onClick={() => step(-1)}>‹</button>}
          <img src={proxiedUrl} alt={a.name} />
          {multi && <button type="button" className="tcd-lightbox-nav tcd-lightbox-next" title="Next (→)" onClick={() => step(1)}>›</button>}
        </div>
        <div className="tcd-modal-actions">
          <a className="tcd-btn" href={proxiedUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a>
          <button className="tcd-btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default Lightbox;
