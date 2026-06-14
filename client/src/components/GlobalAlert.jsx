import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { registerAlerts } from '../utils/Alerts';
import { AlertCircle } from 'lucide-react';

export const GlobalAlert = () => {
  const [alertConfig, setAlertConfig] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [promptConfig, setPromptConfig] = useState(null);
  const [promptInput, setPromptInput] = useState('');

  useEffect(() => {
    registerAlerts(
      (message) => {
        return new Promise((resolve) => {
          setAlertConfig({ message, resolve });
        });
      },
      (message) => {
        return new Promise((resolve) => {
          setConfirmConfig({ message, resolve });
        });
      },
      (message, defaultValue) => {
        return new Promise((resolve) => {
          setPromptInput(defaultValue || '');
          setPromptConfig({ message, resolve });
        });
      }
    );
  }, []);

  const handleAlertClose = () => {
    if (alertConfig) {
      alertConfig.resolve(true);
      setAlertConfig(null);
    }
  };

  const handleConfirm = (result) => {
    if (confirmConfig) {
      confirmConfig.resolve(result);
      setConfirmConfig(null);
    }
  };

  const handlePrompt = (result) => {
    if (promptConfig) {
      promptConfig.resolve(result);
      setPromptConfig(null);
    }
  };

  if (!alertConfig && !confirmConfig && !promptConfig) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999
    }}>
      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {alertConfig && (
        <div className="glass-panel" style={{ width: '400px', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <AlertCircle size={24} color="#3b82f6" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Alert</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            {alertConfig.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleAlertClose} className="glow-btn" style={{ padding: '8px 24px' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {confirmConfig && (
        <div className="glass-panel" style={{ width: '400px', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <AlertCircle size={24} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Confirm Action</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
            {confirmConfig.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => handleConfirm(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 24px', borderRadius: '8px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => handleConfirm(true)} className="glow-btn" style={{ padding: '8px 24px', background: 'linear-gradient(135deg, #f43f5e, #ef4444)' }}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {promptConfig && (
        <div className="glass-panel" style={{ width: '400px', padding: '24px', animation: 'scaleIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <AlertCircle size={24} color="#8b5cf6" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Input Required</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
            {promptConfig.message}
          </p>
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handlePrompt(promptInput);
              if (e.key === 'Escape') handlePrompt(null);
            }}
            style={{
              width: '100%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '10px 12px',
              borderRadius: '8px',
              outline: 'none',
              marginBottom: '24px',
              fontSize: '1rem'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => handlePrompt(null)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 24px', borderRadius: '8px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => handlePrompt(promptInput)} className="glow-btn" style={{ padding: '8px 24px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
              Submit
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
