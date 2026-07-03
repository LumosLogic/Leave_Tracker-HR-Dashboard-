import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Calendar, Edit, Trash2, CheckCircle, X, Home, CheckCircle2, Inbox, AlertTriangle, RotateCcw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { fmtDate, fmtDateRange, fmtTime, fmtHours, initials, todayStr, cn, countWorkingDaysInRange } from '@/lib/utils';


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
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam    = searchParams.get('tab');
  const dateParam   = searchParams.get('date');
  const statusParam = searchParams.get('status');

  // Initialise tab from URL param; fall back to role-based default
  const [tab, setTab] = useState(() => {
    if (['all', 'mine', 'wfh'].includes(tabParam)) return tabParam;
    if (statusParam === 'pending') return 'all';
    return isAdmin ? 'all' : 'mine';
  });

  // Initialise date filter from URL param ('today' resolves to today's date string)
  const [filterDate, setFilterDate] = useState(() => {
    if (dateParam === 'today') return todayStr();
    return dateParam || null;
  });
  const [applyModal, setApplyModal] = useState(false);
  const [editLeave,  setEditLeave]  = useState(null);
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [confirmRevert, setConfirmRevert] = useState(null);

  const { data: leaves = [], refetch: refetchLeaves } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => apiGet('/leaves'),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ['leave-policies'],
    queryFn: () => apiGet('/leave-policies'),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const all = await apiGet('/employees');
      return all.filter(e => e.role === 'employee');
    },
  });

  const myLeaves      = leaves.filter(l => l.user_id === user?.id);
  const allLeaves     = isAdmin ? leaves : myLeaves;
  const summaryLeaves = isAdmin ? allLeaves : myLeaves;

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
    let src = tab === 'all' ? allLeaves : (tab === 'wfh' ? allLeaves : myLeaves);
    if (tab === 'wfh') {
      src = src.filter(l => l.leave_time === 'wfh' || l.leave_type === 'wfh');
      if (filterDate) src = src.filter(l => l.start_date <= filterDate && l.end_date >= filterDate);
      return src;
    }
    src = src.filter(l => l.leave_time !== 'wfh' && l.leave_type !== 'wfh');
    if (filterDate) src = src.filter(l => l.start_date <= filterDate && l.end_date >= filterDate);
    return src;
  })();

  const pendingCount    = allLeaves.filter(l => l.status === 'pending' && l.leave_time !== 'wfh' && l.leave_type !== 'wfh').length;
  const wfhPendingCount = allLeaves.filter(l => l.status === 'pending' && (l.leave_time === 'wfh' || l.leave_type === 'wfh')).length;

  // When navigated with ?status=pending, narrow the list to pending leaves only
  const pendingOnly = statusParam === 'pending';
  const displayList = pendingOnly ? activeList.filter(l => l.status === 'pending') : activeList;

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
          {/* Active filter badges */}
          {pendingOnly && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <AlertTriangle size={11} /> Pending approvals only
              </span>
              <button className="text-xs text-[#3525cd] hover:underline font-semibold"
                onClick={() => setSearchParams(p => { const n = new URLSearchParams(p); n.delete('status'); return n; }, { replace: true })}>
                Clear filter
              </button>
            </div>
          )}

          {/* Date filter */}
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            <label className="text-xs font-semibold text-[#777587] flex items-center gap-1"><Calendar size={12} />
              Filter by Date (leaves covering this date):
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
            <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')}>My Leaves</TabBtn>
            <TabBtn active={tab === 'wfh'}  onClick={() => setTab('wfh')}><Home size={13} /> WFH {wfhPendingCount > 0 && <span className="ml-1 bg-rose-500 text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">{wfhPendingCount}</span>}</TabBtn>
          </div>

          {/* List */}
          <div className="flex flex-col gap-3">
            {displayList.length === 0
              ? <div className="empty-state"><Inbox size={36} className="mx-auto mb-2 opacity-30" /><p>{pendingOnly ? 'No pending approvals' : 'No leave records'}</p></div>
              : displayList.map(l => (
                  <LeaveCard key={l.id} leave={l} isAdmin={isAdmin} user={user}
                    onApprove={approve} onReject={reject} onRevert={(id) => setConfirmRevert(id)} onCancel={cancel}
                    onEdit={() => setEditLeave(l)}
                    onDelete={() => setConfirmDel({ id: l.id, name: l.name })} />
                ))
            }
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 self-start">
          {/* Leave Quotas */}
          <div className="card">
            <div className="px-5 py-4 border-b border-[#f0f3ff] font-black text-[#151c27] text-sm">Leave Quotas</div>
            <div className="p-5 space-y-0">
              {policies.length === 0
                ? <p className="text-xs text-[#9ca3af] text-center py-4">No leave policies configured</p>
                : policies.filter(p => p.active).map(p => (
                  <div key={p.leave_type} className="flex items-center justify-between py-2.5 border-b border-[#f0f3ff] last:border-0">
                    <LeaveTypeBadge type={p.leave_type} />
                    <span className="text-xs font-semibold text-[#464555]">
                      {p.annual_quota > 0 ? `${p.annual_quota} days / yr` : '—'}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Upcoming Leaves */}
          <div className="card">
            <div className="px-5 py-4 border-b border-[#f0f3ff] font-black text-[#151c27] text-sm flex items-center gap-2">
              <Calendar size={14} className="text-[#3525cd]" /> Upcoming Leaves
            </div>
            <div className="divide-y divide-[#f0f3ff]">
              {(() => {
                const today = todayStr();
                const upcoming = allLeaves
                  .filter(l => l.status === 'approved' && l.start_date >= today && l.leave_time !== 'wfh' && l.leave_type !== 'wfh')
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .slice(0, 6);
                if (upcoming.length === 0) return (
                  <div className="py-6 text-center">
                    <CheckCircle size={22} className="text-emerald-400 mx-auto mb-1" />
                    <p className="text-xs text-[#777587]">No upcoming leaves</p>
                  </div>
                );
                return upcoming.map(l => (
                  <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                    {isAdmin && <Avatar name={l.name} color={l.avatar_color} size={26} />}
                    <div className="flex-1 min-w-0">
                      {isAdmin && <p className="text-xs font-bold text-[#151c27] truncate">{l.name}</p>}
                      <p className="text-[0.65rem] text-[#777587]">{fmtDateRange(l.start_date, l.end_date)}</p>
                    </div>
                    <LeaveTypeBadge type={l.leave_type} />
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {applyModal && <ApplyLeaveModal employees={employees} isAdmin={isAdmin} allLeaves={allLeaves} policies={policies} onClose={() => setApplyModal(false)} onSuccess={refetchLeaves} />}
      {editLeave  && <EditLeaveModal  leave={editLeave} isAdmin={isAdmin} onClose={() => setEditLeave(null)} onSuccess={refetchLeaves} />}
      <ConfirmModal
        open={!!confirmRevert}
        title="Confirm Revert Leave"
        message="Are you sure you want to revert this leave request? The leave will be cancelled and attendance records for those days will be removed."
        confirmLabel="Revert"
        variant="warning"
        onConfirm={() => revert(confirmRevert)}
        onCancel={() => setConfirmRevert(null)}
      />
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
          {/* WFH is not a leave type — show WFH badge only, never the leave_type badge */}
          {(l.leave_time === 'wfh' || l.leave_type === 'wfh') ? (
            <span className="badge badge-wfh flex items-center gap-1"><Home size={10} /> WFH</span>
          ) : (
            <LeaveTypeBadge type={l.leave_type} />
          )}
          {l.leave_time === 'half' && (
            <span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd]">
              {l.half_type === 'second_half' ? 'Second Half' : 'First Half'}
            </span>
          )}
          {l.leave_time === 'full' && l.leave_type !== 'wfh' && <span className="text-[0.7rem] font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#464555]">Full Day</span>}
          <StatusBadge status={l.status} />
        </div>
        <div className="text-xs text-[#777587] mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDateRange(l.start_date, l.end_date)}</span>
          <span className="text-[0.68rem] font-bold px-2 py-0.5 rounded bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
            {l.leave_time === 'half' ? '0.5 Working Day' : `${countWorkingDaysInRange(l.start_date, l.end_date)} Working Days`}
          </span>
        </div>

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
        {(isAdmin || l.status !== 'approved') && (
          <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={onEdit}><Edit size={12} /> Edit</button>
        )}
        {isAdmin && (
          <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={onDelete}><Trash2 size={12} /></button>
        )}
      </div>
    </div>
  );
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────
function ApplyLeaveModal({ employees, isAdmin, allLeaves, policies, onClose, onSuccess }) {
  const toast = useToast();
  const blank = () => ({ emp: '', type: 'casual', time: 'full', half: 'first_half', start: '', end: '', reason: '' });
  const [forms, setForms] = useState([blank()]);

  function update(i, k, v) { setForms(fs => fs.map((f, idx) => idx === i ? { ...f, [k]: v } : f)); }
  function add()    { setForms(fs => [...fs, blank()]); }
  function remove(i){ setForms(fs => fs.filter((_, idx) => idx !== i)); }

  function getEmpBalance(empId) {
    if (!empId || !isAdmin) return null;
    const empLeaves = (allLeaves || []).filter(l => String(l.user_id) === String(empId) && l.status === 'approved');
    const activePolicies = (policies || []).filter(p => p.active && p.annual_quota > 0);
    return activePolicies.map(p => {
      const used = empLeaves
        .filter(l => l.leave_type === p.leave_type && l.leave_time !== 'wfh' && l.leave_type !== 'wfh')
        .reduce((s, l) => s + (l.leave_time === 'half' ? 0.5 : countWorkingDaysInRange(l.start_date, l.end_date)), 0);
      const remaining = Math.max(0, p.annual_quota - used);
      return { type: p.leave_type, quota: p.annual_quota, used, remaining };
    }).filter(b => ['casual', 'sick', 'annual', 'emergency'].includes(b.type));
  }

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
                  <div className="mb-3">
                    <label className="form-label">Employee</label>
                    <select className="form-control" value={f.emp} onChange={e => update(i, 'emp', e.target.value)}>
                      <option value="">Select employee…</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    {f.emp && (() => {
                      const balance = getEmpBalance(f.emp);
                      if (!balance || balance.length === 0) return null;
                      return (
                        <div className="mt-2 p-3 rounded-xl bg-[#f0f3ff] border border-[#c7c4d8]">
                          <p className="text-[0.65rem] font-black text-[#3525cd] uppercase tracking-wider mb-2">Leave Balance</p>
                          <div className="flex flex-wrap gap-3">
                            {balance.map(b => (
                              <div key={b.type} className="text-xs">
                                <span className="capitalize text-[#464555] font-semibold">{b.type}: </span>
                                <span className={b.remaining === 0 ? 'text-rose-600 font-black' : b.remaining <= 2 ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}>
                                  {b.remaining}
                                </span>
                                <span className="text-[#9ca3af]">/{b.quota} days</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="form-label">Leave Type</label>
                    <select className="form-control" value={f.type} onChange={e => update(i, 'type', e.target.value)}>
                      {LEAVE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Leave Time</label>
                    <select className="form-control" value={f.time} onChange={e => {
                      const t = e.target.value;
                      update(i, 'time', t);
                      if (t === 'wfh') update(i, 'type', 'wfh');
                    }}>
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
                  <select className="form-control" value={form.time} disabled={!canEdit} onChange={e => {
                    const t = e.target.value;
                    setForm(f => ({ ...f, time: t, ...(t === 'wfh' ? { type: 'wfh' } : {}) }));
                  }}>
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
