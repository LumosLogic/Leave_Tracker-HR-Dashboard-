import React, { useState } from 'react';
import { Plus, Clock, Calendar, Edit, Trash2, CheckCircle, X, Home, AlarmClock, CheckCircle2, Inbox, AlertTriangle, LogOut as EarlyExitIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtDateRange, fmtTime, fmtHours, initials, todayStr, cn } from '@/lib/utils';

const LEAVE_TYPES  = ['casual','sick','annual','maternity','paternity','bereavement','unpaid'];
const TABS = ['all', 'mine', 'wfh', 'late_early'];

export default function Leaves() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab,        setTab]        = useState(isAdmin ? 'all' : 'mine');
  const [filterDate, setFilterDate] = useState(null);
  const [applyModal, setApplyModal] = useState(false);
  const [lateModal,  setLateModal]  = useState(false);
  const [editLeave,  setEditLeave]  = useState(null);
  const [editLE,     setEditLE]     = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: leaves = [], refetch: refetchLeaves } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => apiGet('/leaves'),
  });

  const { data: lateEarly = [], refetch: refetchLE } = useQuery({
    queryKey: ['late-early', filterDate],
    queryFn: () => apiGet('/attendance/late-early', filterDate ? { date: filterDate } : {}),
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
  async function cancel(id) {
    try { await apiDelete(`/leaves/${id}`); toast('Leave cancelled', 'info'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function deleteLeave(id) {
    try { await apiDelete(`/leaves/${id}`); toast('Leave deleted', 'success'); refetchLeaves(); }
    catch (err) { toast(err.message, 'error'); }
  }

  // Filtered list for active tab
  const activeList = (() => {
    if (tab === 'late_early') return [];
    let src = tab === 'all' ? allLeaves : (tab === 'wfh' ? allLeaves : myLeaves);
    if (tab === 'wfh')  return src.filter(l => l.leave_time === 'wfh');
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
          <button className="btn btn-outline" onClick={() => setLateModal(true)}><Clock size={14} /> Late / Early Exit</button>
          <button className="btn btn-primary" onClick={() => setApplyModal(true)}><Plus size={14} /> Apply Leave</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div>
          {/* Date filter */}
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <label className="text-xs font-semibold text-[#777587] flex items-center gap-1"><Calendar size={12} />
              {tab === 'late_early' ? 'Filter by Date' : 'Filter by Date (leaves covering this date):'}
            </label>
            <input type="date" className="form-control w-auto py-1.5 px-3 text-xs" value={filterDate || ''}
              onChange={e => setFilterDate(e.target.value || null)} />
            {filterDate && <button className="btn btn-ghost btn-sm text-xs" onClick={() => setFilterDate(null)}><X size={12} /> Clear</button>}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-4">
            {isAdmin && (
              <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
                All Leaves {pendingCount > 0 && <span className="ml-1 bg-rose-500 text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
              </TabBtn>
            )}
            <TabBtn active={tab === 'mine'}       onClick={() => setTab('mine')}>My Leaves</TabBtn>
            <TabBtn active={tab === 'wfh'}        onClick={() => setTab('wfh')}><Home size={13} /> WFH</TabBtn>
            <TabBtn active={tab === 'late_early'} onClick={() => setTab('late_early')}>
              <AlarmClock size={13} /> Late / Early {lateEarly.length > 0 && <span className="ml-1 bg-rose-500 text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">{lateEarly.length}</span>}
            </TabBtn>
          </div>

          {/* List */}
          <div className="flex flex-col gap-3">
            {tab === 'late_early'
              ? lateEarly.length === 0
                ? <div className="empty-state"><CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" /><p>No late arrivals or early exits</p></div>
                : lateEarly.map(r => <LateEarlyCard key={r.id} record={r} onEdit={() => setEditLE(r)} />)
              : activeList.length === 0
                ? <div className="empty-state"><Inbox size={36} className="mx-auto mb-2 opacity-30" /><p>No leave records</p></div>
                : activeList.map(l => (
                    <LeaveCard key={l.id} leave={l} isAdmin={isAdmin} user={user}
                      onApprove={approve} onReject={reject} onCancel={cancel}
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
      {lateModal  && <LateEarlyModal  employees={employees} onClose={() => setLateModal(false)} onSuccess={() => { refetchLE(); }} />}
      {editLeave  && <EditLeaveModal  leave={editLeave} isAdmin={isAdmin} onClose={() => setEditLeave(null)} onSuccess={refetchLeaves} />}
      {editLE     && <EditLateEarlyModal record={editLE} onClose={() => setEditLE(null)} onSuccess={refetchLE} />}
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
function LeaveCard({ leave: l, isAdmin, user, onApprove, onReject, onCancel, onEdit, onDelete }) {
  return (
    <div className="card px-4 py-3.5 flex items-start gap-3.5 hover:border-[#3525cd]/30 hover:shadow-card-hover hover:translate-x-0.5 transition-all duration-150">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(180deg, #3525cd, #712ae2)' }} />
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

// ── Late/Early Card ───────────────────────────────────────────────────────────
function LateEarlyCard({ record: r, onEdit }) {
  return (
    <div className="card px-4 py-3.5 flex items-start gap-3.5 cursor-pointer hover:border-[#3525cd]/30 transition-all duration-150" onClick={onEdit}>
      <Avatar name={r.name} color={r.avatar_color} size={36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-black">{r.name}</span>
          {r.is_late       && <span className="badge badge-late flex items-center gap-1"><AlarmClock size={10} /> Late Come</span>}
          {r.is_early_exit && <span className="badge badge-early_exit">◀ Early Exit</span>}
          <StatusBadge status={r.status} />
        </div>
        <div className="text-xs text-[#777587] mt-1 flex items-center gap-1"><Calendar size={11} /> {fmtDate(r.date)}</div>
        <div className="flex gap-4 mt-1.5 flex-wrap">
          {r.is_late && r.check_in  && <span className="text-xs text-[#777587]">Arrived: <strong className="text-orange-500">{fmtTime(r.check_in)}</strong></span>}
          {r.is_early_exit && r.check_out && <span className="text-xs text-[#777587]">Left: <strong className="text-purple-500">{fmtTime(r.check_out)}</strong></span>}
          {r.work_hours && <span className="text-xs text-[#777587]">Hours: <strong>{fmtHours(r.work_hours)}</strong></span>}
        </div>
        <div className="text-xs text-[#777587] mt-0.5">{r.department}</div>
      </div>
      <span className="text-xs text-[#777587] border border-[#c7c4d8] rounded px-2 py-1 shrink-0"><Edit size={11} className="inline" /> Edit</span>
    </div>
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

// ── Late/Early Modal ──────────────────────────────────────────────────────────
function LateEarlyModal({ employees, onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ emp: '', date: todayStr(), late: 'none', lateTime: '', early: 'none', earlyTime: '' });

  async function submit() {
    if (!form.emp)  return toast('Select an employee', 'warning');
    if (!form.date) return toast('Select a date', 'warning');
    if (form.late === 'yes'  && !form.lateTime)  return toast('Enter the late arrival time', 'warning');
    if (form.early === 'yes' && !form.earlyTime) return toast('Enter the early exit time', 'warning');
    if (form.late === 'none' && form.early === 'none') return toast('Select at least one', 'warning');
    try {
      await apiPost('/attendance/late-early', {
        user_id: parseInt(form.emp), date: form.date,
        late_come: form.late, late_come_time: form.late === 'yes' ? form.lateTime : null,
        early_exit: form.early, early_exit_time: form.early === 'yes' ? form.earlyTime : null,
      });
      toast('Recorded!', 'success');
      onClose(); onSuccess();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Modal open onClose={onClose} title="Record Late Come / Early Exit" size="md"
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Save Record</button></>}>
      {{
        body: (
          <div className="space-y-3">
            <div><label className="form-label">Employee *</label>
              <select className="form-control" value={form.emp} onChange={e => setForm(f => ({ ...f, emp: e.target.value }))}>
                <option value="">— Select Employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department || ''}</option>)}
              </select>
            </div>
            <div><label className="form-label">Date *</label><input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="border border-[#c7c4d8] rounded-xl p-3.5">
              <div className="text-xs font-bold text-orange-500 mb-2.5 flex items-center gap-1.5"><AlarmClock size={13} /> Late Come</div>
              <select className="form-control mb-2" value={form.late} onChange={e => setForm(f => ({ ...f, late: e.target.value }))}>
                <option value="none">None</option><option value="yes">Late Come</option>
              </select>
              {form.late === 'yes' && <div><label className="form-label">Arrival Time</label><input type="time" className="form-control" value={form.lateTime} onChange={e => setForm(f => ({ ...f, lateTime: e.target.value }))} /></div>}
            </div>
            <div className="border border-[#c7c4d8] rounded-xl p-3.5">
              <div className="text-xs font-bold text-purple-500 mb-2.5 flex items-center gap-1.5"><EarlyExitIcon size={13} /> Early Exit</div>
              <select className="form-control mb-2" value={form.early} onChange={e => setForm(f => ({ ...f, early: e.target.value }))}>
                <option value="none">None</option><option value="yes">Early Exit</option>
              </select>
              {form.early === 'yes' && <div><label className="form-label">Exit Time</label><input type="time" className="form-control" value={form.earlyTime} onChange={e => setForm(f => ({ ...f, earlyTime: e.target.value }))} /></div>}
            </div>
          </div>
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

// ── Edit Late/Early Modal ─────────────────────────────────────────────────────
function EditLateEarlyModal({ record: r, onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ late: r.is_late ? 'yes' : 'none', lateTime: r.check_in?.slice(0, 5) || '', early: r.is_early_exit ? 'yes' : 'none', earlyTime: r.check_out?.slice(0, 5) || '' });
  const [confirmDel, setConfirmDel] = useState(false);

  async function save() {
    if (form.late === 'yes' && !form.lateTime)   return toast('Enter arrival time', 'warning');
    if (form.early === 'yes' && !form.earlyTime) return toast('Enter exit time', 'warning');
    // Both 'none' is valid when editing — it clears the late/early flags from the record
    try {
      await apiPut(`/attendance/late-early/${r.id}`, { late_come: form.late, late_come_time: form.late === 'yes' ? form.lateTime : null, early_exit: form.early, early_exit_time: form.early === 'yes' ? form.earlyTime : null });
      toast('Updated!', 'success'); onClose(); onSuccess();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function del() {
    try { await apiDelete(`/attendance/late-early/${r.id}`); toast('Deleted', 'success'); onClose(); onSuccess(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Edit Late / Early Exit" size="md"
        footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
        {{
          header: <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={() => setConfirmDel(true)}><Trash2 size={12} /> Delete</button>,
          body: (
            <div className="space-y-3">
              <div><label className="form-label">Employee</label><input className="form-control" value={r.name} disabled /></div>
              <div><label className="form-label">Date</label><input type="date" className="form-control" value={r.date} disabled /></div>
              <div className="border border-[#c7c4d8] rounded-xl p-3.5">
                <div className="text-xs font-bold text-orange-500 mb-2.5 flex items-center gap-1.5"><AlarmClock size={13} /> Late Come</div>
                <select className="form-control mb-2" value={form.late} onChange={e => setForm(f => ({ ...f, late: e.target.value }))}>
                  <option value="none">None</option><option value="yes">Late Come</option>
                </select>
                {form.late === 'yes' && <div><label className="form-label">Arrival Time</label><input type="time" className="form-control" value={form.lateTime} onChange={e => setForm(f => ({ ...f, lateTime: e.target.value }))} /></div>}
              </div>
              <div className="border border-[#c7c4d8] rounded-xl p-3.5">
                <div className="text-xs font-bold text-purple-500 mb-2.5 flex items-center gap-1.5"><EarlyExitIcon size={13} /> Early Exit</div>
                <select className="form-control mb-2" value={form.early} onChange={e => setForm(f => ({ ...f, early: e.target.value }))}>
                  <option value="none">None</option><option value="yes">Early Exit</option>
                </select>
                {form.early === 'yes' && <div><label className="form-label">Exit Time</label><input type="time" className="form-control" value={form.earlyTime} onChange={e => setForm(f => ({ ...f, earlyTime: e.target.value }))} /></div>}
              </div>
            </div>
          ),
        }}
      </Modal>
      <ConfirmModal
        open={confirmDel}
        title="Remove Record"
        message={`Remove this late/early exit record for ${r.name}?`}
        confirmLabel="Remove"
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}
