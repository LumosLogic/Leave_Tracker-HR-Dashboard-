import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, CheckSquare, Square, Plus, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const STATUS_CFG = {
  pending:   { cls: 'badge-pending',   label: 'Pending',    strip: '#F59E0B' },
  approved:  { cls: 'badge-approved',  label: 'Accepted',   strip: '#10B981' },
  rejected:  { cls: 'badge-rejected',  label: 'Rejected',   strip: '#EF4444' },
  completed: { cls: 'badge-approved',  label: 'Completed',  strip: '#10B981' },
};

const CLEARANCE_FIELDS = [
  { key: 'clearance_it',      label: 'IT Clearance',      icon: '💻' },
  { key: 'clearance_hr',      label: 'HR Clearance',      icon: '👥' },
  { key: 'clearance_finance', label: 'Finance Clearance', icon: '💰' },
  { key: 'clearance_admin',   label: 'Admin Clearance',   icon: '📋' },
];

function ResignModal({ open, onClose }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [form, setForm] = useState({ resignation_date: new Date().toISOString().split('T')[0], reason: '', notice_period_days: 30 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => apiPost('/exit', form),
    onSuccess: () => { toast('Resignation submitted', 'success'); qc.invalidateQueries({ queryKey: ['exit-requests'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  const lwd = new Date(form.resignation_date);
  lwd.setDate(lwd.getDate() + Number(form.notice_period_days || 30));

  return (
    <Modal open={open} onClose={onClose} title="Submit Resignation" size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Submitting…</> : <><LogOut size={14} />Submit Resignation</>}
          </button>
        </div>
      }>
      <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 mb-4 flex items-start gap-2.5">
        <AlertTriangle size={15} className="text-rose-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-rose-700 leading-relaxed">This will notify HR and initiate the offboarding process. Please ensure you've discussed this with your manager.</p>
      </div>
      <div className="space-y-4">
        <div><label className="form-label">Resignation Date *</label><input type="date" className="form-control" value={form.resignation_date} onChange={e => set('resignation_date', e.target.value)} /></div>
        <div>
          <label className="form-label">Notice Period (days)</label>
          <input type="number" className="form-control" min={0} value={form.notice_period_days} onChange={e => set('notice_period_days', e.target.value)} />
          <p className="form-hint">Estimated last working day: <strong>{lwd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>
        </div>
        <div><label className="form-label">Reason <span className="font-normal text-[#777587] normal-case tracking-normal">(optional)</span></label><textarea className="form-control" rows={3} placeholder="Share your reasons…" value={form.reason} onChange={e => set('reason', e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function ExitCard({ req, isAdmin }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CFG[req.status] || STATUS_CFG.pending;
  const clearanceCount = CLEARANCE_FIELDS.filter(f => req[f.key]).length;

  const updateMut = useMutation({
    mutationFn: data => apiPut(`/exit/${req.id}`, data),
    onSuccess: () => { toast('Updated!', 'success'); qc.invalidateQueries({ queryKey: ['exit-requests'] }); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-all duration-200">
      <div className="h-1 w-full" style={{ background: cfg.strip }} />
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-4 cursor-pointer" onClick={() => setOpen(o => !o)}>
          {isAdmin && <Avatar name={req.user_name} color={req.user_avatar_color} size={42} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-black text-[#151c27]">{isAdmin ? req.user_name : 'My Resignation'}</span>
              <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 text-xs">
              <div><span className="text-[#777587]">Resigned on</span> · <span className="font-semibold text-[#151c27]">{fmtDate(req.resignation_date)}</span></div>
              {req.last_working_day && <div><span className="text-[#777587]">Last day</span> · <span className="font-semibold text-[#151c27]">{fmtDate(req.last_working_day)}</span></div>}
              <div><span className="text-[#777587]">Notice</span> · <span className="font-semibold text-[#151c27]">{req.notice_period_days} days</span></div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Clearance progress */}
            <div className="text-center hidden sm:block">
              <div className="text-sm font-black text-[#3525cd]">{clearanceCount}/{CLEARANCE_FIELDS.length}</div>
              <div className="text-[0.62rem] text-[#777587] uppercase tracking-wide">Clearance</div>
            </div>
            {open ? <ChevronUp size={15} className="text-[#777587]" /> : <ChevronDown size={15} className="text-[#777587]" />}
          </div>
        </div>

        {/* Expanded details */}
        {open && (
          <div className="mt-4 pt-4 border-t border-[#f0f3ff] space-y-4">
            {req.reason && (
              <div className="bg-[#f9f9ff] rounded-xl p-3 text-xs">
                <span className="text-[#777587]">Reason: </span>
                <span className="text-[#464555] italic">"{req.reason}"</span>
              </div>
            )}

            {/* Clearance checklist */}
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587] mb-3">Clearance Checklist</p>
              <div className="grid grid-cols-2 gap-2">
                {CLEARANCE_FIELDS.map(f => (
                  <div key={f.key}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${req[f.key] ? 'bg-emerald-50 border-emerald-200' : 'bg-[#f9f9ff] border-[#e7eefe]'} ${isAdmin ? 'cursor-pointer hover:shadow-sm' : ''}`}
                    onClick={() => isAdmin && updateMut.mutate({ [f.key]: !req[f.key] })}>
                    <span className="text-base">{f.icon}</span>
                    <span className={`text-xs font-semibold flex-1 ${req[f.key] ? 'text-emerald-700' : 'text-[#464555]'}`}>{f.label}</span>
                    {req[f.key]
                      ? <CheckSquare size={15} className="text-emerald-500 flex-shrink-0" />
                      : <Square size={15} className="text-[#c7c4d8] flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Clearance progress bar */}
            <div>
              <div className="flex justify-between text-xs text-[#777587] mb-1.5">
                <span>Clearance Progress</span>
                <span className="font-bold">{clearanceCount}/{CLEARANCE_FIELDS.length}</span>
              </div>
              <div className="h-2 bg-[#f0f3ff] rounded-full overflow-hidden">
                <div className="h-full bg-[#3525cd] rounded-full transition-all" style={{ width: `${(clearanceCount / CLEARANCE_FIELDS.length) * 100}%` }} />
              </div>
            </div>

            {/* Admin actions */}
            {isAdmin && (
              <div className="flex gap-2 pt-2">
                {req.status === 'pending' && (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => updateMut.mutate({ status: 'approved' })} disabled={updateMut.isPending}>Accept Resignation</button>
                    <button className="btn btn-outline btn-sm text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => updateMut.mutate({ status: 'rejected' })} disabled={updateMut.isPending}>Reject</button>
                  </>
                )}
                {req.status === 'approved' && clearanceCount === CLEARANCE_FIELDS.length && (
                  <button className="btn btn-primary btn-sm" onClick={() => updateMut.mutate({ status: 'completed' })} disabled={updateMut.isPending}>
                    <CheckSquare size={13} />Mark Offboarding Complete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExitManagement() {
  const { isAdmin, isEmployee } = useAuth();
  const wrap = isEmployee ? 'p-5 md:p-8 max-w-4xl mx-auto' : '';
  const [resignOpen, setResignOpen] = useState(false);

  const { data: _exitData, isLoading } = useQuery({ queryKey: ['exit-requests'], queryFn: () => apiGet('/exit') });
  const requests = Array.isArray(_exitData) ? _exitData : [];

  const activeCount    = requests.filter(r => ['pending','approved'].includes(r.status)).length;
  const completedCount = requests.filter(r => r.status === 'completed').length;

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Exit Management</h1>
          <p className="page-subtitle">{isAdmin ? `${activeCount} active resignation${activeCount !== 1 ? 's' : ''} · ${completedCount} completed` : 'Manage your resignation and offboarding'}</p>
        </div>
        {!isAdmin && !requests.length && (
          <button className="btn btn-danger btn-sm" onClick={() => setResignOpen(true)}>
            <LogOut size={14} />Submit Resignation
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Pending',   value: requests.filter(r => r.status === 'pending').length,   color: 'from-amber-50 to-amber-100',     top: '#F59E0B', text: 'text-amber-700' },
            { label: 'Approved',  value: requests.filter(r => r.status === 'approved').length,  color: 'from-emerald-50 to-emerald-100', top: '#10B981', text: 'text-emerald-700' },
            { label: 'Completed', value: completedCount,                                         color: 'from-[#f0f3ff] to-[#e7eefe]',    top: '#3525cd', text: 'text-[#3525cd]' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-5 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-card relative overflow-hidden`}>
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
              <div className={`text-3xl font-black ${s.text}`}>{s.value}</div>
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading…</div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <LogOut size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">{isAdmin ? 'No exit requests' : 'No resignation submitted'}</p>
          <p className="text-sm">{isAdmin ? 'Employee resignations will appear here' : 'Submit your resignation to start the offboarding process'}</p>
          {!isAdmin && <button className="btn btn-danger mt-4 btn-sm" onClick={() => setResignOpen(true)}><LogOut size={13} />Submit Resignation</button>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map(r => <ExitCard key={r.id} req={r} isAdmin={isAdmin} />)}
        </div>
      )}

      {resignOpen && <ResignModal open onClose={() => setResignOpen(false)} />}
    </div>
  );
}
