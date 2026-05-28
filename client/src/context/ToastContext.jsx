import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const remove = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-7 right-7 z-[9999] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map(t => <Toast key={t.id} toast={t} onRemove={remove} />)}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast: t, onRemove }) {
  const cfg = {
    success: { bg: 'bg-[rgba(6,46,35,.95)]',  text: 'text-emerald-100', bar: 'bg-emerald-500', Icon: CheckCircle },
    error:   { bg: 'bg-[rgba(40,8,20,.95)]',   text: 'text-rose-100',    bar: 'bg-rose-500',    Icon: XCircle },
    warning: { bg: 'bg-[rgba(49,25,5,.95)]',   text: 'text-amber-100',   bar: 'bg-amber-500',   Icon: AlertTriangle },
    info:    { bg: 'bg-[rgba(4,20,48,.95)]',   text: 'text-blue-100',    bar: 'bg-cyan-500',    Icon: Info },
  }[t.type] || { bg: 'bg-[#2a313d]', text: 'text-white', bar: 'bg-[#4f46e5]', Icon: Info };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold pointer-events-auto max-w-sm relative overflow-hidden',
        'shadow-[0_20px_60px_rgba(0,0,0,.3)] border border-white/10',
        cfg.bg, cfg.text
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', cfg.bar)} />
      <cfg.Icon size={18} className="flex-shrink-0 ml-1" />
      <span className="flex-1">{t.message}</span>
      <button onClick={() => onRemove(t.id)} className="text-white/60 hover:text-white ml-1">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
