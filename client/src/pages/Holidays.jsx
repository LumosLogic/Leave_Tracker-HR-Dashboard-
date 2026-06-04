import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, CalendarDays, Globe, Star, PartyPopper, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const TYPE_CONFIG = {
  public:   { label: 'Public Holiday',  bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500',  icon: <Globe size={13} /> },
  optional: { label: 'Optional',        bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',    icon: <Star size={13} /> },
  company:  { label: 'Company Event',   bg: 'bg-[#f0f3ff]',   text: 'text-[#3525cd]',   border: 'border-[#c7c4d8]',   dot: 'bg-[#3525cd]',    icon: <PartyPopper size={13} /> },
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function HolidayModal({ open, onClose, holiday }) {
  const toast  = useToast();
  const qc     = useQueryClient();
  const isEdit = !!holiday;
  const [form, setForm] = useState(() => isEdit
    ? { name: holiday.name, date: holiday.date, type: holiday.type || 'public', description: holiday.description || '', specific_msg: holiday.specific_msg || '' }
    : { name: '', date: '', type: 'public', description: '', specific_msg: '' });

  const mut = useMutation({
    mutationFn: () => isEdit ? apiPut(`/holidays/${holiday.id}`, form) : apiPost('/holidays', form),
    onSuccess: () => { toast(isEdit ? 'Holiday updated!' : 'Holiday added!', 'success'); qc.invalidateQueries({ queryKey: ['holidays'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Holiday' : 'Add Holiday'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !form.name || !form.date}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : isEdit ? 'Save Changes' : 'Add Holiday'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Holiday Name *</label>
            <input className="form-control" placeholder="e.g. Republic Day" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Date *</label>
            <input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TYPE_CONFIG).map(([val, cfg]) => (
              <button key={val} type="button" onClick={() => set('type', val)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-bold transition-all ${form.type === val ? `${cfg.bg} ${cfg.text} ${cfg.border} border-2` : 'border-[#e7eefe] text-[#777587] hover:border-[#c7c4d8]'}`}>
                {cfg.icon}{cfg.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="form-label">Description</label>
          <input className="form-control" placeholder="Short description…" value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Custom Notification Message
            <span className="ml-1 font-normal text-[#777587] normal-case tracking-normal">(sent day before)</span>
          </label>
          <input className="form-control" placeholder="e.g. Wishing everyone a joyful holiday!" value={form.specific_msg} onChange={e => set('specific_msg', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function HolidaysPage() {
  const toast = useToast();
  const qc    = useQueryClient();
  const now   = new Date();
  const [year,       setYear]       = useState(now.getFullYear());
  const [addOpen,    setAddOpen]    = useState(false);
  const [editH,      setEditH]      = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: _hData, isLoading } = useQuery({ queryKey: ['holidays', year], queryFn: () => apiGet('/holidays', { year }) });
  const holidays = Array.isArray(_hData) ? _hData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/holidays/${id}`),
    onSuccess: () => { toast('Holiday removed', 'warning'); qc.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: e => toast(e.message, 'error'),
  });

  // Group by month
  const byMonth = {};
  holidays.forEach(h => {
    const m = h.date.substring(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  });

  const today     = now.toISOString().split('T')[0];
  const upcoming  = holidays.filter(h => h.date >= today).length;
  const past      = holidays.filter(h => h.date < today).length;
  const publicH   = holidays.filter(h => h.type === 'public').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Holidays</h1>
          <p className="page-subtitle">{holidays.length} holidays in {year} · {upcoming} upcoming</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year picker */}
          <div className="flex items-center gap-1 bg-white border border-[#c7c4d8] rounded-lg px-2 py-1.5 shadow-sm">
            <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="font-black text-[#151c27] min-w-[3rem] text-center text-sm">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} />Add Holiday</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Holidays',  value: holidays.length, color: 'from-[#f0f3ff] to-[#e7eefe]', top: '#3525cd', text: 'text-[#3525cd]' },
          { label: 'Upcoming',        value: upcoming,         color: 'from-emerald-50 to-emerald-100', top: '#10B981', text: 'text-emerald-700' },
          { label: 'Public Holidays', value: publicH,          color: 'from-amber-50 to-amber-100', top: '#F59E0B', text: 'text-amber-700' },
          { label: 'Past',            value: past,             color: 'from-[#f9f9ff] to-[#f0f3ff]', top: '#c7c4d8', text: 'text-[#777587]' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-5 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-card relative overflow-hidden`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-3xl font-black leading-none ${s.text}`}>{s.value}</div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading holidays…</div>
      ) : holidays.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No holidays for {year}</p>
          <p className="text-sm mb-4">Add public holidays and company events for the year</p>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={14} />Add First Holiday</button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byMonth).sort().map(([month, items]) => {
            const [y, m] = month.split('-');
            return (
              <div key={month}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-xs font-black uppercase tracking-widest text-[#777587]">{MONTHS_SHORT[Number(m) - 1]} {y}</div>
                  <div className="flex-1 h-px bg-[#f0f3ff]" />
                  <span className="text-xs font-bold text-[#c7c4d8]">{items.length} holiday{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(h => {
                    const cfg    = TYPE_CONFIG[h.type] || TYPE_CONFIG.public;
                    const d      = new Date(h.date + 'T12:00:00');
                    const dow    = d.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = d.getDate();
                    const isPast = h.date < today;
                    return (
                      <div key={h.id} className={`card p-4 flex items-center gap-4 hover:shadow-card-hover transition-all duration-200 ${isPast ? 'opacity-60' : ''}`}>
                        {/* Date badge */}
                        <div className="flex-shrink-0 w-14 text-center">
                          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#777587]">{dow}</div>
                          <div className="text-2xl font-black text-[#3525cd] leading-tight">{dayNum}</div>
                          <div className="text-[0.6rem] font-bold text-[#777587]">{MONTHS_SHORT[d.getMonth()]}</div>
                        </div>
                        {/* Divider */}
                        <div className="w-px h-10 flex-shrink-0" style={{ background: cfg.dot.replace('bg-', '') + '40' }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-[#151c27] truncate">{h.name}</div>
                          {h.description && <div className="text-xs text-[#777587] mt-0.5 truncate">{h.description}</div>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`badge ${cfg.bg} ${cfg.text} ${cfg.border} flex items-center gap-1 border`}>
                            {cfg.icon}{cfg.label}
                          </span>
                          <button className="btn btn-ghost btn-icon text-[#777587] hover:text-[#3525cd]" onClick={() => setEditH(h)}><Pencil size={13} /></button>
                          <button className="btn btn-ghost btn-icon text-[#777587] hover:text-rose-500" onClick={() => setConfirmDel({ id: h.id, name: h.name })}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOpen && <HolidayModal open onClose={() => setAddOpen(false)} />}
      {editH   && <HolidayModal open onClose={() => setEditH(null)} holiday={editH} />}
      <ConfirmModal open={!!confirmDel} title="Remove Holiday"
        message={`Remove "${confirmDel?.name}" from the holiday calendar?`}
        confirmLabel="Remove" onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
