import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', variant = 'danger', onConfirm, onCancel }) {
  if (!open) return null;
  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-[#c7c4d8] w-full max-w-sm p-6 animate-in">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-[#777587] hover:text-[#151c27] p-1 rounded-lg hover:bg-[#f0f3ff] transition-colors"
        >
          <X size={18} />
        </button>

        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDanger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
          {isDanger ? <Trash2 size={22} /> : <AlertTriangle size={22} />}
        </div>

        <h3 className="text-base font-black text-[#151c27] text-center mb-2">{title}</h3>
        <p className="text-sm text-[#777587] text-center mb-6 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn btn-outline">Cancel</button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className={`flex-1 btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
