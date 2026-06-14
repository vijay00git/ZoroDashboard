import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 9999,
        pointerEvents: 'none'
      }}>
        {toasts.map(t => {
          let Icon = Info;
          let color = 'var(--accent-cyan)';
          if (t.type === 'success') { Icon = CheckCircle; color = 'var(--accent-green)'; }
          else if (t.type === 'warning' || t.type === 'error') { Icon = AlertTriangle; color = 'var(--accent-red)'; }

          return (
            <div key={t.id} style={{
              background: 'var(--bg-secondary)',
              backdropFilter: 'var(--glass-blur)',
              border: `1px solid var(--border-color)`,
              borderLeft: `4px solid ${color}`,
              padding: '12px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
              animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
            }}>
              <Icon size={18} style={{ color }} />
              <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: '500' }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
