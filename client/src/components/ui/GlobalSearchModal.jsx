import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Umbrella, FileText, Megaphone, ArrowRight, X } from 'lucide-react';
import { apiGet } from '@/lib/api';

export function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ employees: [], leaves: [], documents: [], announcements: [] });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) onClose(); else setQuery('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!query.trim() || !open) {
      setResults({ employees: [], leaves: [], documents: [], announcements: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.toLowerCase();
        const [emps, lvs, docs, anns] = await Promise.all([
          apiGet('/employees').catch(() => []),
          apiGet('/leaves').catch(() => []),
          apiGet('/documents').catch(() => []),
          apiGet('/announcements').catch(() => [])
        ]);

        setResults({
          employees: (emps || []).filter(e => e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)).slice(0, 4),
          leaves: (lvs || []).filter(l => l.employee_name?.toLowerCase().includes(q) || l.leave_type?.toLowerCase().includes(q) || l.reason?.toLowerCase().includes(q)).slice(0, 4),
          documents: (docs || []).filter(d => d.title?.toLowerCase().includes(q) || d.category?.toLowerCase().includes(q)).slice(0, 4),
          announcements: (anns || []).filter(a => a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q)).slice(0, 4),
        });
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const handleSelect = (path) => {
    onClose();
    navigate(path);
  };

  const hasResults = results.employees.length > 0 || results.leaves.length > 0 || results.documents.length > 0 || results.announcements.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-[#04060e]/60 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#c7c4d8] overflow-hidden flex flex-col z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center px-4 py-3.5 border-b border-[#e7eefe] gap-3">
          <Search size={18} className="text-[#3525cd] shrink-0" />
          <input
            autoFocus
            className="flex-1 bg-transparent border-none text-base font-medium text-[#151c27] placeholder-[#777587] focus:outline-none"
            placeholder="Search employees, leaves, documents, announcements... (ESC to close)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <span className="spinner w-4 h-4 shrink-0" />}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f0f3ff] text-[#777587] hover:text-[#151c27]">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-4 divide-y divide-[#f0f3ff]">
          {!query.trim() && (
            <div className="py-8 text-center text-xs text-[#777587]">
              Type to search across organization resources. Press <kbd className="px-1.5 py-0.5 rounded bg-[#f0f3ff] border border-[#c7c4d8] font-mono text-[0.65rem]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-[#f0f3ff] border border-[#c7c4d8] font-mono text-[0.65rem]">K</kbd> anytime.
            </div>
          )}

          {query.trim() && !loading && !hasResults && (
            <div className="py-8 text-center text-xs text-[#777587]">
              No matching records found for "{query}".
            </div>
          )}

          {results.employees.length > 0 && (
            <div className="py-2.5">
              <div className="text-[0.65rem] font-black uppercase tracking-wider text-[#777587] flex items-center gap-1.5 mb-2">
                <Users size={12} className="text-[#3525cd]" /> Employees
              </div>
              <div className="space-y-1">
                {results.employees.map(e => (
                  <div key={e.id} onClick={() => handleSelect('/employees')} className="flex items-center justify-between p-2 rounded-xl hover:bg-[#f0f3ff] cursor-pointer transition-colors group">
                    <div>
                      <div className="text-xs font-bold text-[#151c27] group-hover:text-[#3525cd]">{e.name}</div>
                      <div className="text-[0.65rem] text-[#777587]">{e.department} · {e.email}</div>
                    </div>
                    <ArrowRight size={14} className="text-[#c7c4d8] group-hover:text-[#3525cd] transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.leaves.length > 0 && (
            <div className="py-2.5">
              <div className="text-[0.65rem] font-black uppercase tracking-wider text-[#777587] flex items-center gap-1.5 mb-2">
                <Umbrella size={12} className="text-amber-600" /> Leave Requests
              </div>
              <div className="space-y-1">
                {results.leaves.map(l => (
                  <div key={l.id} onClick={() => handleSelect('/leaves')} className="flex items-center justify-between p-2 rounded-xl hover:bg-[#f0f3ff] cursor-pointer transition-colors group">
                    <div>
                      <div className="text-xs font-bold text-[#151c27] group-hover:text-[#3525cd]">{l.employee_name} ({l.leave_type})</div>
                      <div className="text-[0.65rem] text-[#777587]">{l.start_date} to {l.end_date} · Status: {l.status}</div>
                    </div>
                    <ArrowRight size={14} className="text-[#c7c4d8] group-hover:text-[#3525cd] transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.documents.length > 0 && (
            <div className="py-2.5">
              <div className="text-[0.65rem] font-black uppercase tracking-wider text-[#777587] flex items-center gap-1.5 mb-2">
                <FileText size={12} className="text-indigo-600" /> Documents
              </div>
              <div className="space-y-1">
                {results.documents.map(d => (
                  <div key={d.id} onClick={() => handleSelect('/documents')} className="flex items-center justify-between p-2 rounded-xl hover:bg-[#f0f3ff] cursor-pointer transition-colors group">
                    <div>
                      <div className="text-xs font-bold text-[#151c27] group-hover:text-[#3525cd]">{d.title}</div>
                      <div className="text-[0.65rem] text-[#777587]">{d.category || 'Company Doc'}</div>
                    </div>
                    <ArrowRight size={14} className="text-[#c7c4d8] group-hover:text-[#3525cd] transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
