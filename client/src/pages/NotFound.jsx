import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)' }}>
      <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '420px' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--accent-purple) 15%, transparent)',
          color: 'var(--accent-purple)',
        }}>
          <Compass size={28} />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: '800', margin: '0 0 8px' }}>Page not found</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 24px' }}>
          There's nothing here — the page may have moved or the link's out of date.
        </p>
        <button onClick={() => navigate('/')} className="glow-btn">Back to Dashboard</button>
      </div>
    </div>
  );
};

export default NotFound;
