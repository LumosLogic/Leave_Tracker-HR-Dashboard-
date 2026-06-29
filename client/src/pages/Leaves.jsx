import React, { useState } from 'react';
import { Plus, Clock, Calendar, Edit, Trash2, CheckCircle, X, Home, CheckCircle2, Inbox, AlertTriangle, RotateCcw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtDateRange, fmtTime, fmtHours, initials, todayStr, cn } from '@/lib/utils';

const LEAVE_TYPES = ['casual','sick','annual','maternity','paternity','bereavement','unpaid'];

const ATT_STATUS_CFG = {
  present:  { label: 'Present',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  wfh:      { label: 'WFH',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  half_day: { label: 'Half Day', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  on_leave: { label: 'On Leave', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  absent:   { label: 'Absent',   cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export default function Leaves() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab,        setTab]        = useState(isAdmin ? 'all' : 'mine');
  const [filterDate, setFilterDate] = useState(null);
  const [applyModal, setApplyModal] = useState(false);
  const [editLeave,  setEditLeave]  = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: leaves = [], refetch: refetchLeaves } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => apiGet('/leaves'),
  });

  const { data: todayAtt = [] } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => apiGet('/attendance', { date: todayStr() }),
    enabled: isAdmin,
  });

  const { data: clockifyLive } = useQuery({
    queryKey: ['clockify-live'],
    queryFn: () => apiGet('/clockify/live'),
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const all = await apiGet('/employees');
      return all.filter(e => e.role === 'employee');
    },
  });

  const myLeaves  = leaves.filter(l => l.user_id === user?.id);
  const allLeaves = isAdmin ? leaves : myLeaves;

  async function approve(id) {
    try { await apiPut(`/leaves/${id}/approve`, {}); toast('Leave approved', 'success'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function reject(id) {
    try { await apiPut(`/leaves/${id}/reject`, {}); toast('Leave rejected', 'warning'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function revert(id) {
    try { await apiPut(`/leaves/${id}/revert`, {}); toast('Leave reverted', 'info'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function cancel(id) {
    try { await apiDelete(`/leaves/${id}`); toast('Leave cancelled', 'info'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function deleteLeave(id) {
    try { await apiDelete(`/leaves/${id}`); toast('Leave deleted', 'success'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }

  const activeList = (() => {
    if (tab === 'today') return [];
    let src = tab === 'all' ? allLeaves : (tab === 'wfh' ? allLeaves : myLeaves);
    if (tab === 'wfh') {
      src = src.filter(l => l.leave_time === 'wfh');
      if (filterDate) src = src.filter(l => l.start_date <= filterDate && l.end_date >= filterDate);
      return src;
    }
    src = src.filter(l => l.leave_time !== 'wfh');
    if (filterDate) src = src.filter(l => l.start_date <= filterDate && l.end_date >= filterDate);
    return src;
  })();

  const pendingCount = leaves.filter(l => l.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Leave Management</div>
          <div className="page-subtitle">Track and manage employee leaves</div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => setApplyModal(true)}><Plus size={14} /> Apply Leave</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          {/* Date filter — hidden for Today tab */}
          {tab !== 'today' && (
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <label className="text-xs font-semibold text-[#777587] flex items-center gap-1"><Calendar size={12} />
                Filter by Date (leaves covering this date):
              </label>
              <input type="date" className="form-control w-auto py-1.5 px-3 text-xs" value={filterDate || ''}
                onChange={e => setFilterDate(e.target.value || null)} />
              {filterDate && <button className="btn btn-ghost btn-sm text-xs" onClick={() => setFilterDate(null)}><X size={12} /> Clear</button>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-4">
            {isAdmin && (
              <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
                All Leaves {pendingCount > 0 && <span className="ml-1 bg-rose-500 text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
              </TabBtn>
            )}
            <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>My Leaves</TabBtn>
            <TabBtn active={tab === 'wfh'}  onClick={() => setTab('wfh')}><Home size={13} /> WFH</TabBtn>
            {isAdmin && (
              <TabBtn active={tab === 'today'} onClick={() => setTab('today')}><Clock size={13} /> Today</TabBtn>
            )}
          </div>

          {/* List */}
          <div className="flex flex-col gap-3">
            {tab === 'today'
              ? <TodayAttendanceTab employees={employees} attendance={todayAtt} clockifyData={clockifyLive} />
              : activeList.length === 0
                ? <div className="empty-state"><Inbox size={36} className="mx-auto mb-2 opacity-30" /><p>No leave records</p></div>
                : activeList.map(l => (
                    <LeaveCard key={l.id} leave={l} isAdmin={isAdmin} user={user}
                      onApprove={approve} onReject={reject} onRevert={revert} onCancel={cancel}
                      onEdit={() => setEditLeave(l)}
                      onDelete={() => setConfirmDel({ id: l.id, name: l.name })} />
                  ))
            }
          </div>
        </div>

        {/* Summary */}
        <div className="card self-start">
          <div className="px-5 py-4 border-b border-[#f0f3ff] font-black text-[#151c27]">Leave Summary</div>
          <div className="p-5">
            {LEAVE_TYPES.map(t => {
              const approved = myLeaves.filter(l => l.leave_type === t && l.status === 'approved').length;
              const pending  = myLeaves.filter(l => l.leave_type === t && l.status === 'pending').length;
              return (
                <div key={t} className="flex items-center justify-between py-2 border-b border-[#f0f3ff] last:border-0">
                  <LeaveTypeBadge type={t} />
                  <div className="flex gap-1.5">
                    {approved > 0 && <StatusBadge status="approved">{approved} approved</StatusBadge>}
                    {pending  > 0 && <StatusBadge status="pending">{pending} pending</StatusBadge>}
                    {!approved && !pending && <span className="text-xs text-[#777587]">None</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      {applyModal && <ApplyLeaveModal employees={employees} isAdmin={isAdmin} onClose={() => setApplyModal(false)} onSuccess={refetchLeaves} />}
      {editLeave  && <EditLeaveModal  leave={editLeave} isAdmin={isAdmin} onClose={() => setEditLeave(null)} onSuccess={refetchLeaves} />}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Leave Record"
        message={`Delete the leave record for ${confirmDel?.name || 'this employee'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteLeave(confirmDel.id)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1',
      active ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]')}>
      {children}
    </button>
  );
}

// ── Leave Card ────────────────────────────────────────────────────────────────
const STATUS_CARD = {
  pending:   { border: 'border-l-4 border-l-amber-400',   bg: 'bg-amber-50/40' },
  approved:  { border: 'border-l-4 border-l-emerald-400', bg: '' },
  rejected:  { border: 'border-l-4 border-l-rose-400',    bg: '' },
  cancelled: { border: 'border-l-4 border-l-slate-400',   bg: 'bg-slate-50/40' },
};

function LeaveCard({ leave: l, isAdmin, user, onApprove, onReject, onRevert, onCancel, onEdit, onDelete }) {
  const sc = STATUS_CARD[l.status] || {};
  return (
    <div className={`card px-4 py-3.5 flex items-start gap-3.5 hover:border-[#3525cd] hover:shadow-card-hover hover:translate-x-0.5 transition-all duration-150 ${sc.border || ''} ${sc.bg || ''}`}>
      <Avatar name={l.name} color={l.avatar_color} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-black">{l.name}</span>
          <LeaveTypeBadge type={l.leave_type} />
          {l.leave_time === 'half' && (
            <span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd]">
              {l.half_type === 'second_half' ? 'Second Half' : 'First Half'}
            </span>
          )}
          {l.leave_time === 'wfh' && <span className="badge badge-wfh flex items-center gap-1"><Home size={10} /> WFH</span>}
          {l.leave_time === 'full' && <span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#464555]">Full Day</span>}
          <StatusBadge status={l.status} />
        </div>
        <div className="text-xs text-[#777587] mt-1 flex items-center gap-1"><Calendar size={11} /> {fmtDateRange(l.start_date, l.end_date)}</div>
        {l.reason && <div className="text-xs text-[#777587] italic mt-0.5">"{l.reason}"</div>}
        {l.approver_name && <div className="text-xs text-[#777587] mt-0.5">By: {l.approver_name}</div>}
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {isAdmin && l.status === 'pending' && (
            <>
              <button className="btn btn-success btn-sm text-xs" onClick={() => onApprove(l.id)}><CheckCircle size={12} /> Approve</button>
              <button className="btn btn-danger btn-sm text-xs"  onClick={() => onReject(l.id)}><X size={12} /> Reject</button>
            </>
          )}
          {l.status === 'approved' && (isAdmin || l.user_id === user?.id) && (
            <button className="btn btn-outline btn-sm text-xs border-amber-300 text-amber-800 hover:bg-amber-50" onClick={() => onRevert(l.id)}>
              <RotateCcw size={12} /> Revert Leave
            </button>
          )}
          {l.status === 'pending' && l.user_id === user?.id && (
            <button className="btn btn-outline btn-sm text-xs" onClick={() => onCancel(l.id)}><X size={12} /> Cancel</button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={onEdit}><Edit size={12} /> Edit</button>
        {isAdmin && (
          <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={onDelete}><Trash2 size={12} /></button>
        )}
      </div>
    </div>
  );
}

// ── Today's Attendance Tab ────────────────────────────────────────────────────
function TodayAttendanceTab({ employees, attendance, clockifyData }) {
  const attMap = {};
  for (const rec of attendance) {
    attMap[rec.user_id] = rec;
  }

  const timers = clockifyData?.timers || {};

  const STATUS_ORDER = { present: 0, wfh: 1, half_day: 2, on_leave: 3, absent: 4 };

  const rows = employees.map(emp => {
    const att   = attMap[emp.id];
    const timer = timers[emp.id];
    return {
      ...emp,
      status:        att?.status || 'absent',
      check_in:      att?.check_in  || null,
      check_out:     att?.check_out || null,
      clockify_live: timer?.running || false,
    };
  });

  rows.sort((a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5));

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
        <p>No employees found</p>
      </div>
    );
  }

  const presentCount = rows.filter(r => ['present', 'wfh', 'half_day'].includes(r.status)).length;
  const todayLabel   = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-xs text-[#777587]">
        <Calendar size={12} />
        <span className="font-semibold">{todayLabel}</span>
        <span className="ml-auto">
          <span className="font-black text-emerald-600">{presentCount}</span>
          <span> / {rows.length} in office</span>
        </span>
      </div>
      {rows.map(emp => {
        const cfg = ATT_STATUS_CFG[emp.status] || ATT_STATUS_CFG.absent;
        return (
          <div key={emp.id} className="card px-4 py-3.5 flex items-center gap-3.5 hover:shadow-card-hover transition-all duration-150">
            <Avatar name={emp.name} color={emp.avatar_color} size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black">{emp.name}</span>
                <span className={`badge border text-xs ${cfg.cls}`}>{cfg.label}</span>
                {emp.clockify_live && (
                  <span className="badge border flex items-center gap-1 text-xs bg-green-50 text-green-700 border-green-200">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                    Clockify
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-xs text-[#777587] flex-wrap">
                <span>{emp.department}</span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────
function ApplyLeaveModal({ employees, isAdmin, onClose, onSuccess }) {
  const toast = useToast();
  const blank = () => ({ emp: '', type: 'casual', time: 'full', half: 'first_half', start: '', end: '', reason: '' });
  const [forms, setForms] = useState([blank()]);

  function update(i, k, v) { setForms(fs => fs.map((f, idx) => idx === i ? { ...f, [k]: v } : f)); }
  function add()    { setForms(fs => [...fs, blank()]); }
  function remove(i){ setForms(fs => fs.filter((_, idx) => idx !== i)); }

  async function submit() {
    for (const [i, f] of forms.entries()) {
      if (!f.start || !f.end) { toast(`Fill start/end date for request ${i + 1}`, 'warning'); return; }
      if (isAdmin && !f.emp) { toast('Select an employee', 'warning'); return; }
    }
    try {
      await Promise.all(forms.map(f => {
        const body = { leave_type: f.type, start_date: f.start, end_date: f.end, reason: f.reason, leave_time: f.time, half_type: f.time === 'half' ? f.half : null };
        if (isAdmin && f.emp) body.user_id = parseInt(f.emp);
        return apiPost('/leaves', body);
      }));
      toast(`${forms.length} leave request${forms.length > 1 ? 's' : ''} submitted!`, 'success');
      onClose(); onSuccess();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Modal open onClose={onClose} title="Apply for Leave" size="lg"
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit All</button></>}>
      {{
        body: (
          <>
            {forms.map((f, i) => (
              <div key={i} className="border border-[#c7c4d8] rounded-xl p-4 mb-3 bg-[#f0f3ff]/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#3525cd]">{i === 0 ? 'Leave Request' : `Leave Request #${i + 1}`}</span>
                  {i > 0 && <button className="btn btn-ghost btn-sm text-xs text-rose-400" onClick={() => remove(i)}><X size={12} /> Remove</button>}
                </div>
                {isAdmin && (
                  <div className="mb-3"><label className="form-label">Employee</label>
                    <select className="form-control" value={f.emp} onChange={e => update(i, 'emp', e.target.value)}>
                      <option value="">Select employee…</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Leave Type</label>
                    <select className="form-control" value={f.type} onChange={e => update(i, 'type', e.target.value)}>
                      {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Leave Time</label>
                    <select className="form-control" value={f.time} onChange={e => update(i, 'time', e.target.value)}>
                      <option value="full">Full Leave</option>
                      <option value="half">Half Leave</option>
                      <option value="wfh">Work from Home</option>
                    </select>
                  </div>
                </div>
                {f.time === 'half' && (
                  <div className="mb-3"><label className="form-label">Which Half?</label>
                    <select className="form-control" value={f.half} onChange={e => update(i, 'half', e.target.value)}>
                      <option value="first_half">First Half (Morning)</option>
                      <option value="second_half">Second Half (Afternoon)</option>
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Start Date</label><input type="date" className="form-control" value={f.start} onChange={e => update(i, 'start', e.target.value)} /></div>
                  <div><label className="form-label">End Date</label><input type="date" className="form-control" value={f.end} onChange={e => update(i, 'end', e.target.value)} /></div>
                </div>
                <div><label className="form-label">Reason</label><textarea className="form-control" rows="2" placeholder="Optional reason…" value={f.reason} onChange={e => update(i, 'reason', e.target.value)} /></div>
              </div>
            ))}
            <button className="btn btn-outline btn-sm text-xs" onClick={add}><Plus size={12} /> Add Another</button>
          </>
        ),
      }}
    </Modal>
  );
}

// ── Edit Leave Modal ──────────────────────────────────────────────────────────
function EditLeaveModal({ leave: l, isAdmin, onClose, onSuccess }) {
  const toast = useToast();
  const canEdit = l.status !== 'approved' || isAdmin;
  const [form, setForm] = useState({ type: l.leave_type, time: l.leave_time, half: l.half_type || 'first_half', start: l.start_date, end: l.end_date, reason: l.reason || '' });
  const [confirmDel, setConfirmDel] = useState(false);

  async function save() {
    if (!form.start || !form.end) return toast('Fill dates', 'warning');
    if (form.start > form.end)    return toast('Start must be before end', 'warning');
    try {
      await apiPut(`/leaves/${l.id}`, { leave_type: form.type, start_date: form.start, end_date: form.end, reason: form.reason, leave_time: form.time, half_type: form.time === 'half' ? form.half : null });
      toast('Updated!', 'success'); onClose(); onSuccess();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function del() {
    try { await apiDelete(`/leaves/${l.id}`); toast('Deleted', 'success'); onClose(); onSuccess(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Edit Leave" size="md"
        footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button>{canEdit && <button className="btn btn-primary" onClick={save}>Save</button>}</>}>
        {{
          header: <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={() => setConfirmDel(true)}><Trash2 size={12} /> Delete</button>,
          body: (
            <div className="space-y-3">
              <div><label className="form-label">Employee</label><input className="form-control" value={l.name} disabled /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Leave Type</label>
                  <select className="form-control" value={form.type} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Leave Time</label>
                  <select className="form-control" value={form.time} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}>
                    <option value="full">Full Leave</option><option value="half">Half Leave</option><option value="wfh">WFH</option>
                  </select>
                </div>
              </div>
              {form.time === 'half' && (
                <div><label className="form-label">Which Half?</label>
                  <select className="form-control" value={form.half} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, half: e.target.value }))}>
                    <option value="first_half">First Half</option><option value="second_half">Second Half</option>
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Start Date</label><input type="date" className="form-control" value={form.start} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
                <div><label className="form-label">End Date</label><input type="date" className="form-control" value={form.end} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} /></div>
              </div>
              <div><label className="form-label">Reason</label><textarea className="form-control" rows="2" value={form.reason} disabled={!canEdit} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
              {!canEdit && <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={12} /> Approved leave — only admin can edit</p>}
              <div className="flex items-center gap-2 mt-1"><StatusBadge status={l.status} />{l.approver_name && <span className="text-xs text-[#777587]">By: {l.approver_name}</span>}</div>
            </div>
          ),
        }}
      </Modal>
      <ConfirmModal
        open={confirmDel}
        title="Delete Leave Record"
        message={`Delete ${l.name}'s leave record? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}
