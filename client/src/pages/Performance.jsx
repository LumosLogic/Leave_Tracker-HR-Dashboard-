import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Target, Star, TrendingUp, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';

const GOAL_STATUS_CFG = {
  active:    { cls: 'badge-pending',   strip: '#F59E0B', label: 'Active'    },
  completed: { cls: 'badge-approved',  strip: '#10B981', label: 'Completed' },
  cancelled: { cls: 'badge-cancelled', strip: '#c7c4d8', label: 'Cancelled' },
};

const REVIEW_STATUS_CFG = {
  pending:     { cls: 'badge-pending',   label: 'Pending',    strip: '#F59E0B' },
  in_progress: { cls: 'badge-pending',   label: 'In Progress',strip: '#3525cd' },
  completed:   { cls: 'badge-approved',  label: 'Completed',  strip: '#10B981' },
};

function StarRating({ value, max = 5, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="focus:outline-none transition-transform hover:scale-110">
          <Star size={20}
            className={`transition-colors ${(hovered || value) >= n ? 'text-amber-400 fill-amber-400' : 'text-[#e7eefe]'}`} />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-sm font-black text-[#151c27]">{value}/5</span>}
    </div>
  );
}

function GoalModal({ open, onClose, goal, employees, isAdmin }) {
  const toast  = useToast();
  const qc     = useQueryClient();
  const isEdit = !!goal;
  const [form, setForm] = useState(() => isEdit
    ? { title: goal.title, description: goal.description || '', category: goal.category, target_date: goal.target_date || '', review_cycle: goal.review_cycle, progress: goal.progress, status: goal.status, user_id: goal.user_id }
    : { title: '', description: '', category: 'individual', target_date: '', review_cycle: String(new Date().getFullYear()), progress: 0, status: 'active', user_id: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => isEdit ? apiPut(`/performance/goals/${goal.id}`, form) : apiPost('/performance/goals', form),
    onSuccess: () => { toast(isEdit ? 'Goal updated!' : 'Goal added!', 'success'); qc.invalidateQueries({ queryKey: ['perf-goals'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Goal' : 'Add Goal'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !form.title}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : 'Save Goal'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {isAdmin && !isEdit && (
          <div>
            <label className="form-label">Employee <span className="font-normal text-[#777587] normal-case tracking-normal">(leave blank for yourself)</span></label>
            <select className="form-control" value={form.user_id} onChange={e => set('user_id', e.target.value)}>
              <option value="">— My goal —</option>
              {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">Goal Title *</label>
          <input className="form-control" placeholder="e.g. Complete React certification" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={2} placeholder="What does success look like?" value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Category</label>
            <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="individual">Individual</option>
              <option value="team">Team</option>
              <option value="department">Department</option>
            </select>
          </div>
          <div>
            <label className="form-label">Target Date</label>
            <input type="date" className="form-control" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Progress — {form.progress}%</label>
          <div className="flex items-center gap-3">
            <input type="range" className="flex-1 accent-[#3525cd]" min={0} max={100} step={5} value={form.progress} onChange={e => set('progress', e.target.value)} />
            <span className="text-sm font-black text-[#3525cd] min-w-[2.5rem] text-right">{form.progress}%</span>
          </div>
          <div className="h-2 bg-[#f0f3ff] rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-[#3525cd] rounded-full transition-all" style={{ width: `${form.progress}%` }} />
          </div>
        </div>
        {isEdit && (
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReviewCard({ rv }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc    = useQueryClient();
  const [open,           setOpen]           = useState(false);
  const [selfRating,     setSelfRating]     = useState(rv.self_rating || 0);
  const [selfComments,   setSelfComments]   = useState(rv.self_comments || '');
  const [managerRating,  setManagerRating]  = useState(rv.manager_rating || 0);
  const [managerComments,setManagerComments]= useState(rv.manager_comments || '');
  const cfg = REVIEW_STATUS_CFG[rv.status] || REVIEW_STATUS_CFG.pending;

  const mut = useMutation({
    mutationFn: data => apiPut(`/performance/reviews/${rv.id}`, data),
    onSuccess: () => { toast('Saved!', 'success'); qc.invalidateQueries({ queryKey: ['perf-reviews'] }); setOpen(false); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <div className="card overflow-hidden hover:shadow-card-hover transition-all duration-200">
      <div className="h-1 w-full" style={{ background: cfg.strip }} />
      <div className="p-5">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <Avatar name={rv.user_name} color={rv.user_avatar_color} size={40} />
          <div className="flex-1 min-w-0">
            <div className="font-black text-[#151c27]">{rv.user_name}</div>
            <div className="text-xs text-[#777587]">{rv.review_cycle} · {rv.review_type} review</div>
          </div>
          <div className="flex items-center gap-3">
            {rv.final_rating > 0 && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-xs font-black text-amber-700">{rv.final_rating}/5</span>
              </div>
            )}
            <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
            {open ? <ChevronUp size={15} className="text-[#777587]" /> : <ChevronDown size={15} className="text-[#777587]" />}
          </div>
        </div>

        {open && (
          <div className="mt-4 pt-4 border-t border-[#f0f3ff] space-y-5">
            {/* Self Assessment */}
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587] mb-3">Self Assessment</p>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Self Rating</label>
                  <StarRating value={selfRating} onChange={setSelfRating} />
                </div>
                <div>
                  <label className="form-label">Comments</label>
                  <textarea className="form-control" rows={2} placeholder="Describe your achievements…" value={selfComments} onChange={e => setSelfComments(e.target.value)} />
                </div>
                {!isAdmin && (
                  <button className="btn btn-outline btn-sm" onClick={() => mut.mutate({ self_rating: selfRating, self_comments: selfComments })} disabled={mut.isPending}>
                    {mut.isPending ? <><span className="spinner w-3 h-3" />Saving…</> : 'Save Self Assessment'}
                  </button>
                )}
              </div>
            </div>

            {/* Manager Assessment (admin only) */}
            {isAdmin && (
              <div>
                <p className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587] mb-3">Manager Assessment</p>
                <div className="space-y-3">
                  <div>
                    <label className="form-label">Manager Rating</label>
                    <StarRating value={managerRating} onChange={setManagerRating} />
                  </div>
                  <div>
                    <label className="form-label">Manager Comments</label>
                    <textarea className="form-control" rows={2} value={managerComments} onChange={e => setManagerComments(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => mut.mutate({ self_rating: selfRating, self_comments: selfComments, manager_rating: managerRating, manager_comments: managerComments, final_rating: managerRating || selfRating, status: 'completed' })}
                    disabled={mut.isPending}>
                    {mut.isPending ? <><span className="spinner w-3 h-3" />Submitting…</> : 'Submit Final Review'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Performance() {
  const { isAdmin, isEmployee } = useAuth();
  const wrap = isEmployee ? 'p-5 md:p-8 max-w-4xl mx-auto' : '';
  const toast = useToast();
  const qc    = useQueryClient();
  const [tab,        setTab]        = useState('goals');
  const [addGoal,    setAddGoal]    = useState(false);
  const [editGoal,   setEditGoal]   = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [cycle,      setCycle]      = useState(String(new Date().getFullYear()));

  const { data: _goalsData,   isLoading: gLoad } = useQuery({ queryKey: ['perf-goals',   cycle], queryFn: () => apiGet('/performance/goals',   { cycle }) });
  const { data: _reviewsData, isLoading: rLoad } = useQuery({ queryKey: ['perf-reviews', cycle], queryFn: () => apiGet('/performance/reviews', { cycle }) });
  const { data: _empData }                       = useQuery({ queryKey: ['employees'],           queryFn: () => apiGet('/employees'), enabled: isAdmin });
  const goals     = Array.isArray(_goalsData)   ? _goalsData   : [];
  const reviews   = Array.isArray(_reviewsData) ? _reviewsData : [];
  const employees = Array.isArray(_empData)     ? _empData     : [];

  const delGoal = useMutation({
    mutationFn: id => apiDelete(`/performance/goals/${id}`),
    onSuccess: () => { toast('Goal deleted', 'warning'); qc.invalidateQueries({ queryKey: ['perf-goals'] }); },
    onError: e => toast(e.message, 'error'),
  });

  const initReview = useMutation({
    mutationFn: userId => apiPost('/performance/reviews', { user_id: userId, review_cycle: cycle }),
    onSuccess: () => { toast('Review started!', 'success'); qc.invalidateQueries({ queryKey: ['perf-reviews'] }); },
    onError: e => toast(e.message, 'error'),
  });

  const completedGoals = goals.filter(g => g.status === 'completed').length;
  const avgProgress    = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0;

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Performance</h1>
          <p className="page-subtitle">Goals and reviews for cycle <span className="font-bold text-[#3525cd]">{cycle}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-[#c7c4d8] rounded-lg px-2 py-1.5 shadow-sm">
            <button onClick={() => setCycle(c => String(Number(c) - 1))} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff]">‹</button>
            <span className="font-black text-[#151c27] min-w-[3rem] text-center text-sm">{cycle}</span>
            <button onClick={() => setCycle(c => String(Number(c) + 1))} className="w-7 h-7 flex items-center justify-center rounded text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff]">›</button>
          </div>
          {tab === 'goals' && <button className="btn btn-primary" onClick={() => setAddGoal(true)}><Plus size={15} />Add Goal</button>}
          {tab === 'reviews' && isAdmin && (
            <select className="form-control w-auto" defaultValue="" onChange={e => { if (e.target.value) { initReview.mutate(e.target.value); e.target.value = ''; } }}>
              <option value="">Start Review for…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Goals',    value: goals.length,    color: 'from-[#f0f3ff] to-[#e7eefe]',    top: '#3525cd', text: 'text-[#3525cd]' },
          { label: 'Completed',      value: completedGoals,  color: 'from-emerald-50 to-emerald-100',  top: '#10B981', text: 'text-emerald-700' },
          { label: 'Avg. Progress',  value: `${avgProgress}%`,color: 'from-amber-50 to-amber-100',    top: '#F59E0B', text: 'text-amber-700' },
          { label: 'Reviews',        value: reviews.length,  color: 'from-[#f0f3ff] to-[#e7eefe]',    top: '#712ae2', text: 'text-[#712ae2]' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-5 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-card relative overflow-hidden`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-3xl font-black leading-none ${s.text}`}>{s.value}</div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-6">
        {[{ key: 'goals', label: 'Goals', icon: <Target size={13} /> }, { key: 'reviews', label: 'Reviews', icon: <Star size={13} /> }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${tab === t.key ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Goals */}
      {tab === 'goals' && (
        gLoad ? <div className="loading"><div className="spinner" />Loading…</div>
          : goals.length === 0
            ? <div className="empty-state"><Target size={48} className="mx-auto mb-3 text-[#c7c4d8]" /><p className="font-semibold text-[#464555] mb-1">No goals for {cycle}</p><p className="text-sm">Set goals to track your progress and achievements</p><button className="btn btn-primary mt-4" onClick={() => setAddGoal(true)}><Plus size={14} />Add First Goal</button></div>
            : <div className="flex flex-col gap-3">
                {goals.map(g => {
                  const cfg = GOAL_STATUS_CFG[g.status] || GOAL_STATUS_CFG.active;
                  return (
                    <div key={g.id} className="card p-5 hover:shadow-card-hover transition-all duration-200">
                      <div className="flex items-start gap-4">
                        {isAdmin && <Avatar name={g.user_name} color={g.user_avatar_color} size={36} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {isAdmin && <span className="text-xs text-[#777587]">{g.user_name}</span>}
                                <span className="font-black text-[#151c27]">{g.title}</span>
                                <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                                <span className="badge badge-cancelled capitalize">{g.category}</span>
                              </div>
                              {g.description && <p className="text-xs text-[#777587] mt-1">{g.description}</p>}
                              {g.target_date && <p className="text-xs text-[#777587] mt-0.5">Target: <span className="font-semibold">{g.target_date}</span></p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button className="btn btn-ghost btn-icon text-[#777587] hover:text-[#3525cd]" onClick={() => setEditGoal(g)}><Pencil size={13} /></button>
                              <button className="btn btn-ghost btn-icon text-[#777587] hover:text-rose-500" onClick={() => setConfirmDel({ id: g.id, name: g.title })}><Trash2 size={13} /></button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-[#f0f3ff] rounded-full h-2">
                              <div className="h-full rounded-full transition-all" style={{ width: `${g.progress}%`, background: g.status === 'completed' ? '#10B981' : '#3525cd' }} />
                            </div>
                            <span className="text-xs font-black min-w-[2.5rem] text-right" style={{ color: g.status === 'completed' ? '#059669' : '#3525cd' }}>{g.progress}%</span>
                            {g.status === 'completed' && <CheckCircle2 size={14} className="text-emerald-500" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
      )}

      {/* Reviews */}
      {tab === 'reviews' && (
        rLoad ? <div className="loading"><div className="spinner" />Loading…</div>
          : reviews.length === 0
            ? <div className="empty-state"><Star size={48} className="mx-auto mb-3 text-[#c7c4d8]" /><p className="font-semibold text-[#464555] mb-1">No reviews for {cycle}</p><p className="text-sm">{isAdmin ? 'Start a performance review for your team members' : 'Your manager has not initiated a review yet'}</p></div>
            : <div className="flex flex-col gap-3">{reviews.map(r => <ReviewCard key={r.id} rv={r} />)}</div>
      )}

      {addGoal  && <GoalModal open onClose={() => setAddGoal(false)} employees={employees} isAdmin={isAdmin} />}
      {editGoal && <GoalModal open onClose={() => setEditGoal(null)} goal={editGoal} employees={employees} isAdmin={isAdmin} />}
      <ConfirmModal open={!!confirmDel} title="Delete Goal" message={`Delete goal "${confirmDel?.name}"?`}
        confirmLabel="Delete" onConfirm={() => { delGoal.mutate(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
