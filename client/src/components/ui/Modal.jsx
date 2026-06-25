import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({ open, onClose, title, children, footer, size = 'md', className, disableOutsideClick = false }) {
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }[size] || 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-5"
      style={{ background: 'rgba(21,28,39,.6)', backdropFilter: 'blur(14px) saturate(180%)' }}
      onClick={!disableOutsideClick ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}
    >
      <div
        className={cn(
          'bg-white rounded-xl w-full flex flex-col max-h-[90vh]',
          'shadow-[0_32px_80px_rgba(0,0,0,.18)] border border-[#c7c4d8]',
          'relative overflow-hidden',
          sizeClass, className
        )}
      >
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl"
          style={{ background: 'linear-gradient(90deg, #3525cd, #4f46e5, #712ae2, #8a4cfc)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#f0f3ff] flex-shrink-0">
          <h2 className="text-base font-black tracking-tight text-[#151c27]">{title}</h2>
          <div className="flex items-center gap-2">
            {children?.header}
            <button onClick={onClose} className="btn btn-ghost btn-icon text-[#777587] hover:text-[#151c27]">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {children?.body ?? children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[#f0f3ff] flex gap-2.5 justify-end flex-shrink-0 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
