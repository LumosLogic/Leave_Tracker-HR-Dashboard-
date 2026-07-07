import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Clock, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { MONTHS, DAYS } from '@/lib/utils';

function fmtRosterDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
}

// Parse "1,2,3,4,5" → [1,2,3,4,5]; null/empty → []
function parseDays(str) {
  if (!str) return [];
  return str.split(',').map(Number).filter(n => !isNaN(n));
}

// [1,2,3,4,5] → "1,2,3,4,5"
function serializeDays(arr) {
  return arr.length ? arr.sort((a, b) => a - b).join(',') : null;
}

function ShiftModal({ open, onClose, shift }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const isEdit = !!shift;
  const [form, setForm] = useState(() => isEdit
    ? {
        name: shift.name,
        start_time: shift.start_time,
        end_time: shift.end_time,
        color: shift.color,
        description: shift.description || '',
        days_of_week: parseDays(shift.days_of_week),
      }
    : { name: '', start_time: '09:00', end_time: '18:00', color: '#3525cd', description: '', days_of_week: [] });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleDay(idx) {
    setForm(f => {
      const days = f.days_of_week.includes(idx)
        ? f.days_of_week.filter(d => d !== idx)
        : [...f.days_of_week, idx];
      return { ...f, days_of_week: days };
    });
  }

  const payload = () => ({ ...form, days_of_week: serializeDays(form.days_of_week) });

  const mut = useMutation({
    mutationFn: () => isEdit ? apiPut(`/shifts/${shift.id}`, payload()) : apiPost('/shifts', payload()),
    onSuccess: () => { toast(isEdit ? 'Shift updated!' : 'Shift created!', 'success'); qc.invalidateQueries({ queryKey: ['shifts'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Shift' : 'New Shift'} size="md"
      footer={<div className="flex justify-end gap-3"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !form.name}>{mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : 'Save'}</button></div>}>
      <div className="space-y-4">
        <div><label className="form-label">Shift Name *</label><input className="form-control" placeholder="Morning Shift" value={form.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label">Start Time</label><input type="time" className="form-control" value={form.start_time} onChange={e => set('start_time', e.target.value)} /></div>
          <div><label className="form-label">End Time</label><input type="time" className="form-control" value={form.end_time} onChange={e => set('end_time', e.target.value)} /></div>
        </div>

        {/* Days of Week */}
        <div>
          <label className="form-label">Applicable Days <span className="text-xs font-normal text-[#777587]">(select which days this shift runs)</span></label>
          <div className="flex gap-1.5 flex-wrap mt-1">
            {DAYS.map((day, idx) => {
              const active = form.days_of_week.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`w-10 h-10 rounded-lg text-xs font-bold border transition-all ${
                    active
                      ? 'text-white border-transparent'
                      : 'bg-white text-[#777587] border-[#c7c4d8] hover:border-[#3525cd] hover:text-[#3525cd]'
                  }`}
                  style={active ? { background: form.color, borderColor: form.color } : {}}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {form.days_of_week.length === 0 && (
            <p className="text-[0.7rem] text-[#a09ead] mt-1">No days selected — shift is a general template</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label">Color</label><input type="color" className="form-control h-10 p-1" value={form.color} onChange={e => set('color', e.target.value)} /></div>
          <div><label className="form-label">Description</label><input className="form-control" value={form.description} onChange={e => set('description', e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  );
}

export default function Shifts() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc    = useQueryClient();
  const now   = new Date();
  const [tab,        setTab]        = useState('shifts');
  const [addOpen,    setAddOpen]    = useState(false);
  const [editShift,  setEditShift]  = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [month,      setMonth]      = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);

  const { data: _sData,  isLoading: sLoad } = useQuery({ queryKey: ['shifts'],              queryFn: () => apiGet('/shifts') });
  const { data: _aData,  isLoading: aLoad } = useQuery({ queryKey: ['shift-assign', month], queryFn: () => apiGet('/shifts/assignments', { month }) });
  const { data: _eData }                    = useQuery({ queryKey: ['employees'],           queryFn: () => apiGet('/employees'), enabled: isAdmin });
  const shifts      = Array.isArray(_sData) ? _sData : [];
  const assignments = Array.isArray(_aData) ? _aData : [];
  const employees   = Array.isArray(_eData) ? _eData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/shifts/${id}`),
    onSuccess: () => { toast('Shift deleted', 'warning'); qc.invalidateQueries({ queryKey: ['shifts'] }); },
    onError: e => toast(e.message, 'error'),
  });

  // Group assignments by date for the roster view
  const byDate = {};
  assignments.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  return (
    <div>
      <div className="page-header mb-6">
        <div><div className="page-title">Shifts & Roster</div><div className="page-subtitle">Define shifts and manage monthly roster</div></div>
        {isAdmin && tab === 'shifts' && <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> New Shift</button>}
      </div>

      <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-6">
        {[{ key: 'shifts', label: 'Shift Definitions', icon: <Clock size={13} /> }, { key: 'roster', label: 'Monthly Roster', icon: <Calendar size={13} /> }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${tab === t.key ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'shifts' && (
        sLoad ? <div className="loading"><div className="spinner" />Loading…</div>
          : shifts.length === 0 ? (
            <div className="empty-state"><Clock size={36} className="mx-auto mb-2 opacity-30" /><p>No shifts defined</p>{isAdmin && <button className="btn btn-primary mt-4" onClick={() => setAddOpen(true)}><Plus size={14} />Create First Shift</button>}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shifts.map(s => {
                const shiftDays = parseDays(s.days_of_week);
                return (
                  <div key={s.id} className="card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color + '20' }}>
                        <Clock size={18} style={{ color: s.color }} />
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff]" onClick={() => setEditShift(s)}><Pencil size={13} /></button>
                          <button className="p-1.5 rounded-lg text-[#777587] hover:text-rose-500 hover:bg-rose-50" onClick={() => setConfirmDel({ id: s.id, name: s.name })}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    <div className="font-black text-[#151c27]">{s.name}</div>
                    <div className="text-sm font-bold mt-1" style={{ color: s.color }}>{s.start_time} – {s.end_time}</div>
                    {shiftDays.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {DAYS.map((day, idx) => (
                          <span key={idx}
                            className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded ${
                              shiftDays.includes(idx)
                                ? 'text-white'
                                : 'text-[#c7c4d8] bg-[#f9f9ff]'
                            }`}
                            style={shiftDays.includes(idx) ? { background: s.color } : {}}>
                            {day}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.description && <div className="text-xs text-[#777587] mt-1">{s.description}</div>}
                  </div>
                );
              })}
            </div>
          )
      )}

      {tab === 'roster' && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <input type="month" className="form-control w-auto" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          {aLoad ? <div className="loading"><div className="spinner" />Loading…</div>
            : assignments.length === 0 ? (
              <div className="empty-state"><Calendar size={36} className="mx-auto mb-2 opacity-30" /><p>No shifts assigned for {month}</p></div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                      <tr>
                        <th className="text-left px-4 py-3 font-black text-[#464555]">Employee</th>
                        <th className="text-left px-4 py-3 font-black text-[#464555]">Date</th>
                        <th className="text-left px-4 py-3 font-black text-[#464555]">Shift</th>
                        <th className="text-left px-4 py-3 font-black text-[#464555]">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f3ff]">
                      {assignments.map(a => (
                        <tr key={a.id} className="hover:bg-[#f9f9ff]">
                          <td className="px-4 py-3 flex items-center gap-2">
                            <Avatar name={a.user?.name || ''} color={a.user?.avatar_color} size={24} />
                            <span className="font-semibold text-[#151c27]">{a.user?.name}</span>
                          </td>
                          <td className="px-4 py-3 text-[#464555]">{fmtRosterDate(a.date)}</td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[0.68rem] font-bold" style={{ background: (a.shift?.color || '#3525cd') + '20', color: a.shift?.color || '#3525cd' }}>{a.shift?.name}</span></td>
                          <td className="px-4 py-3 text-[#464555]">{a.shift?.start_time} – {a.shift?.end_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      )}

      {addOpen   && <ShiftModal open onClose={() => setAddOpen(false)} />}
      {editShift && <ShiftModal open onClose={() => setEditShift(null)} shift={editShift} />}
      <ConfirmModal open={!!confirmDel} title="Delete Shift" message={`Delete shift "${confirmDel?.name}"?`}
        confirmLabel="Delete" onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
