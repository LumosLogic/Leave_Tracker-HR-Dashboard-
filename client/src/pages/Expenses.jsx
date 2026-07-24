import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Upload, ExternalLink, CheckCircle2, XCircle, Clock, Trash2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const CATEGORIES = ['travel','meals','accommodation','fuel','office_supplies','internet','medical','parking','training','client_entertainment','communication','other'];
const CAT_ICONS  = { travel:'✈️', meals:'🍽️', accommodation:'🏨', fuel:'⛽', office_supplies:'🖊️', internet:'🌐', medical:'🏥', parking:'🅿️', training:'📚', client_entertainment:'🤝', communication:'📱', other:'🧾' };
const CAT_LABELS = { travel:'Travel', meals:'Meals', accommodation:'Accommodation', fuel:'Fuel', office_supplies:'Office Supplies', internet:'Internet', medical:'Medical', parking:'Parking', training:'Training', client_entertainment:'Client Entertainment', communication:'Communication', other:'Other' };
const STATUS_CFG = {
  pending:  { cls: 'badge-pending',  icon: <Clock size={11} />,        label: 'Pending'  },
  approved: { cls: 'badge-approved', icon: <CheckCircle2 size={11} />, label: 'Approved' },
  rejected: { cls: 'badge-rejected', icon: <XCircle size={11} />,      label: 'Rejected' },
};

const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function ExpenseModal({ open, onClose, expense }) {
  const toast  = useToast();
  const qc     = useQueryClient();
  const isEdit = !!expense;
  const fileRef  = useRef();
  const [uploading,    setUploading]    = useState(false);
  const [pendingFile,  setPendingFile]  = useState(null);
  const [amountErr,    setAmountErr]    = useState('');
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState(() => isEdit
    ? { title: expense.title, category: expense.category, amount: expense.amount, expense_date: expense.expense_date, description: expense.description || '', receipt_url: expense.receipt_url || '' }
    : { title: '', category: 'travel', amount: '', expense_date: today, description: '', receipt_url: '' });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function validateAmount(val) {
    const n = parseFloat(val);
    if (!val) { setAmountErr('Amount is required'); return false; }
    if (isNaN(n) || n <= 0) { setAmountErr('Enter a positive amount'); return false; }
    setAmountErr('');
    return true;
  }

  async function handleReceipt(file) {
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) { toast('File too large — max 5 MB', 'error'); return; }
    const ok = ['application/pdf','image/jpeg','image/png','image/jpg'].includes(file.type);
    if (!ok) { toast('Unsupported format — use PDF, JPG, or PNG', 'error'); return; }
    setPendingFile(file);
    setUploading(true);
    try {
      const token = localStorage.getItem('lt_token');
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/expenses/upload-receipt', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      set('receipt_url', data.url);
      toast('Receipt uploaded!', 'success');
    } catch (err) { toast(err.message, 'error'); setPendingFile(null); }
    finally { setUploading(false); }
  }

  const mut = useMutation({
    mutationFn: () => isEdit ? apiPut(`/expenses/${expense.id}`, form) : apiPost('/expenses', form),
    onSuccess: () => {
      toast(isEdit ? 'Expense updated!' : 'Expense claim submitted successfully. Waiting for manager approval.', 'success');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onClose();
    },
    onError: e => toast(e.message, 'error'),
  });

  function handleSubmit() {
    if (!form.title.trim()) { toast('Enter a title for the expense', 'warning'); return; }
    if (!validateAmount(form.amount)) { return; }
    if (!form.expense_date) { toast('Select an expense date', 'warning'); return; }
    if (!form.receipt_url) { toast('Receipt is required. Please upload a receipt before submitting.', 'warning'); return; }
    mut.mutate();
  }

  const fmtFileSize = b => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Expense' : 'Submit Expense Claim'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={mut.isPending || !form.title || !form.amount || !form.receipt_url}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Submitting…</> : isEdit ? 'Save Changes' : 'Submit Claim'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {/* Title with char counter */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label mb-0">Title <span className="text-rose-500">*</span></label>
            <span className="text-[0.65rem] text-[#9ca3af]">{form.title.length}/80</span>
          </div>
          <input className="form-control" maxLength={80} placeholder="e.g. Cab to client office" value={form.title}
            onChange={e => set('title', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Category</label>
            <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICONS[c]} {CAT_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Amount (₹) <span className="text-rose-500">*</span></label>
            <input type="number" className={`form-control ${amountErr ? 'border-rose-400' : ''}`}
              min={0.01} step={0.01} placeholder="0.00" value={form.amount}
              onChange={e => { set('amount', e.target.value); validateAmount(e.target.value); }} />
            {amountErr && <p className="text-[0.65rem] text-rose-500 mt-1">{amountErr}</p>}
          </div>
        </div>

        <div>
          <label className="form-label">Expense Date <span className="text-rose-500">*</span></label>
          <input type="date" className="form-control" max={today} value={form.expense_date}
            onChange={e => set('expense_date', e.target.value)} />
          <p className="text-[0.65rem] text-[#9ca3af] mt-1">Future dates are not allowed</p>
        </div>

        {/* Description with char counter */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label mb-0">Description</label>
            <span className="text-[0.65rem] text-[#9ca3af]">{form.description.length}/200</span>
          </div>
          <textarea className="form-control" rows={2} maxLength={200} placeholder="Additional details about this expense…"
            value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        {/* Receipt upload */}
        <div>
          <label className="form-label">Receipt <span className="text-rose-500">*</span></label>
          <div className="flex items-center gap-2 p-2.5 mb-2 rounded-lg bg-[#f0f3ff] border border-[#e7eefe] text-xs text-[#777587]">
            <span className="text-[#3525cd]">ℹ</span>
            <span>Accepted: <strong className="text-[#464555]">PDF, JPG, PNG</strong> · Max size: <strong className="text-[#464555]">5 MB</strong></span>
          </div>
          <input type="file" ref={fileRef} className="hidden" accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => e.target.files[0] && handleReceipt(e.target.files[0])} />
          {form.receipt_url ? (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 truncate">{pendingFile?.name || 'Receipt uploaded'}</p>
                  {pendingFile && <p className="text-[0.65rem] text-emerald-600">{fmtFileSize(pendingFile.size)}</p>}
                </div>
                <a href={form.receipt_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#3525cd] flex items-center gap-1 hover:underline flex-shrink-0">
                  <ExternalLink size={11} />View
                </a>
                <button className="text-xs text-rose-500 hover:underline flex-shrink-0"
                  onClick={() => { set('receipt_url', ''); setPendingFile(null); }}>Remove</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <><span className="spinner w-3 h-3" />Uploading…</> : <><Upload size={13} />Upload Receipt</>}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReviewModal({ open, onClose, expense }) {
  const toast = useToast();
  const qc    = useQueryClient();
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: status => apiPut(`/expenses/${expense.id}/review`, { status, reviewer_notes: notes }),
    onSuccess: () => { toast('Review saved!', 'success'); qc.invalidateQueries({ queryKey: ['expenses'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Review Expense Claim" size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => mut.mutate('rejected')} disabled={mut.isPending}>Reject</button>
          <button className="btn btn-primary" onClick={() => mut.mutate('approved')} disabled={mut.isPending}>Approve</button>
        </div>
      }>
      <div className="space-y-3">
        <div className="rounded-xl bg-[#f9f9ff] border border-[#e7eefe] p-4 space-y-2 text-xs">
          <p className="font-bold text-[#151c27]">{expense.title}</p>
          <p><span className="text-[#777587]">Amount:</span> <span className="font-black text-[#3525cd] text-base">{fmt(expense.amount)}</span></p>
          <p><span className="text-[#777587]">Date:</span> <span className="font-semibold">{fmtDate(expense.expense_date)}</span></p>
          <p><span className="text-[#777587]">Category:</span> <span className="capitalize">{expense.category}</span></p>
          {expense.receipt_url && (
            <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#3525cd] hover:underline mt-1"><ExternalLink size={11} />View Receipt</a>
          )}
        </div>
        <div>
          <label className="form-label">Notes <span className="font-normal text-[#777587] normal-case tracking-normal">(sent to employee)</span></label>
          <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function ExpensesPage() {
  const { isAdmin, isEmployee } = useAuth();
  const wrap = '';
  const toast = useToast();
  const qc    = useQueryClient();
  const [searchParams] = useSearchParams();
  const [addOpen,   setAddOpen]   = useState(false);
  const [editExp,   setEditExp]   = useState(null);
  const [reviewExp, setReviewExp] = useState(null);
  const [confirmDel,setConfirmDel]= useState(null);
  const [filter,    setFilter]    = useState('all');

  // Auto-open submit form from quick actions
  useEffect(() => {
    if (!isAdmin && searchParams.get('action') === 'apply') {
      setAddOpen(true);
    }
  }, []);

  const { data: _expData, isLoading } = useQuery({ queryKey: ['expenses', filter], queryFn: () => apiGet('/expenses', filter !== 'all' ? { status: filter } : {}) });
  const expenses = Array.isArray(_expData) ? _expData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/expenses/${id}`),
    onSuccess: () => { toast('Claim deleted', 'warning'); qc.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: e => toast(e.message, 'error'),
  });

  const totalAmt   = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const pendingAmt = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount || 0), 0);
  const approvedAmt= expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">{expenses.length} claim{expenses.length !== 1 ? 's' : ''} · total {fmt(totalAmt)}</p>
        </div>
        {!isAdmin && <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} />Submit Claim</button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Claims',    value: fmt(totalAmt),    color: 'from-[#f0f3ff] to-[#e7eefe]',    top: '#3525cd', text: 'text-[#3525cd]' },
          { label: 'Pending',         value: fmt(pendingAmt),  color: 'from-amber-50 to-amber-100',      top: '#F59E0B', text: 'text-amber-700' },
          { label: 'Approved',        value: fmt(approvedAmt), color: 'from-emerald-50 to-emerald-100',  top: '#10B981', text: 'text-emerald-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-5 bg-gradient-to-br ${s.color} border border-[#c7c4d8] shadow-card relative overflow-hidden`}>
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.top }} />
            <div className={`text-xl font-black leading-none ${s.text}`}>{s.value}</div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#777587] mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all','pending','approved','rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-all ${filter === f ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <Receipt size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No expense claims</p>
          <p className="text-sm">{!isAdmin ? 'Submit a claim to get reimbursed for work-related expenses' : 'No expense claims submitted yet'}</p>
          {!isAdmin && <button className="btn btn-primary mt-4" onClick={() => setAddOpen(true)}><Plus size={14} />Submit First Claim</button>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {expenses.map(e => {
            const cfg = STATUS_CFG[e.status] || STATUS_CFG.pending;
            return (
              <div key={e.id} className="card p-4 hover:shadow-card-hover transition-all duration-200">
                <div className="flex items-start gap-4">
                  {isAdmin && <Avatar name={e.user_name || ''} color={e.user_avatar_color} size={38} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {isAdmin && <span className="font-bold text-[#151c27]">{e.user_name}</span>}
                          <span className={isAdmin ? 'text-sm font-semibold text-[#464555]' : 'font-bold text-[#151c27]'}>{e.title}</span>
                          <span className="text-lg">{CAT_ICONS[e.category] || '🧾'}</span>
                          <span className={`badge ${cfg.cls} flex items-center gap-1`}>{cfg.icon}{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#777587] mt-1">
                          <span className="capitalize">{e.category}</span>
                          <span>·</span>
                          <span>{fmtDate(e.expense_date)}</span>
                          {e.description && <><span>·</span><span className="truncate max-w-[200px]">{e.description}</span></>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-black text-xl text-[#3525cd]">{fmt(e.amount)}</div>
                        {e.receipt_url && (
                          <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
                            className="text-[0.68rem] text-[#3525cd] hover:underline flex items-center gap-0.5 justify-end mt-0.5">
                            <ExternalLink size={10} />Receipt
                          </a>
                        )}
                      </div>
                    </div>
                    {e.reviewer_notes && (
                      <div className="text-xs bg-[#f9f9ff] border border-[#f0f3ff] rounded-lg px-3 py-2 text-[#464555] mt-2">
                        <span className="text-[#777587]">HR:</span> {e.reviewer_notes}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {isAdmin && e.status === 'pending' && (
                      <button className="btn btn-outline btn-sm" onClick={() => setReviewExp(e)}>Review <ChevronRight size={12} /></button>
                    )}
                    {!isAdmin && e.status === 'pending' && (
                      <>
                        <button className="btn btn-ghost btn-icon text-[#777587] hover:text-[#3525cd]" onClick={() => setEditExp(e)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button className="btn btn-ghost btn-icon text-[#777587] hover:text-rose-500" onClick={() => setConfirmDel({ id: e.id, name: e.title })}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOpen    && <ExpenseModal open onClose={() => setAddOpen(false)} />}
      {editExp    && <ExpenseModal open onClose={() => setEditExp(null)} expense={editExp} />}
      {reviewExp  && <ReviewModal  open onClose={() => setReviewExp(null)} expense={reviewExp} />}
      <ConfirmModal open={!!confirmDel} title="Delete Expense" message={`Delete expense "${confirmDel?.name}"?`}
        confirmLabel="Delete" onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
