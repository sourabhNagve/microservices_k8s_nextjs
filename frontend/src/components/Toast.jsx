'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const success = useCallback((msg, dur) => addToast(msg, 'success', dur), [addToast]);
  const error   = useCallback((msg, dur) => addToast(msg, 'error',   dur), [addToast]);
  const warning = useCallback((msg, dur) => addToast(msg, 'warning', dur), [addToast]);
  const info    = useCallback((msg, dur) => addToast(msg, 'info',    dur), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, removeToast }) => (
  <div aria-live="polite" aria-atomic="false" className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {toasts.map(toast => (
      <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
    ))}
  </div>
);

const STYLES = {
  success: { bar: 'bg-emerald-500 text-white',    progress: 'bg-white/40' },
  error:   { bar: 'bg-red-500 text-white',        progress: 'bg-white/40' },
  warning: { bar: 'bg-amber-400 text-gray-900',   progress: 'bg-black/20' },
  info:    { bar: 'bg-blue-500 text-white',        progress: 'bg-white/40' },
};

const ICONS = {
  success: <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>,
  error:   <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>,
  warning: <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
  info:    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>,
};

const Toast = ({ toast, onClose }) => {
  const { id, message, type, duration = 3000 } = toast;
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);
  const styles = STYLES[type] ?? STYLES.info;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // ✅ Single timer — reads duration from toast object, not hardcoded 3000
  useEffect(() => {
    if (duration <= 0) return;
    timerRef.current = setTimeout(startExit, duration);
    return () => clearTimeout(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startExit = () => {
    setExiting(true);
    setTimeout(onClose, 300);
  };

  const handleClose = () => {
    clearTimeout(timerRef.current);
    startExit();
  };

  return (
    <div
      role="alert"
      className={`
        pointer-events-auto ${styles.bar}
        rounded-lg shadow-lg overflow-hidden
        min-w-[280px] max-w-sm w-full
        transition-all duration-300 ease-in-out
        ${visible && !exiting ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {ICONS[type] ?? ICONS.info}
        <span className="flex-1 text-sm font-medium leading-snug">{message}</span>
        <button
          onClick={handleClose}
          aria-label="Dismiss notification"
          className="ml-1 shrink-0 opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {duration > 0 && (
        <div className={`h-0.5 w-full ${styles.progress}`}>
          <div className="h-full bg-current opacity-60 origin-left" style={{ animation: `shrink ${duration}ms linear forwards` }} />
        </div>
      )}

      <style>{`@keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </div>
  );
};