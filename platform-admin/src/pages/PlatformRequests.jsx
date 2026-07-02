import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, Clock, Building2, Mail, Phone,
  Globe, MessageSquare, ClipboardList, Inbox,
} from 'lucide-react';
import { paGet, paPost } from '@/lib/platformApi';

function StatusBadge({ status }) {
  const map = {
    pending:  { icon: <Clock size={11} />,        cls: 'bg-amber-50 text-amber-700 border-amber-200',      label: 'Pending' },
    approved: { icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Approved' },
    rejected: { icon: <XCircle size={11} />,      cls: 'bg-rose-50 text-rose-700 border-rose-200',         label: 'Rejected' },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

function RequestCard({ req, onApprove, onReject, isActing, compact }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes]         = useState('');
  const [action, setAction]       = useState(null);

  function submit() {
    if (action === 'approve') onApprove(req.id, notes);
    else onReject(req.id, notes);
    setNotesOpen(false); setNotes(''); setAction(null);
  }

  return (
    <div className={`bg-white rounded-2xl border border-[#e7eefe] overflow-hidden hover:border-[#c7c4d8] transition-colors ${compact ? '' : ''}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h3 className={`font-black text-[#151c27] ${compact ? 'text-sm' : 'text-base'}`}>{req.company_name}</h3>
              {compact && <StatusBadge status={req.status} />}
            </div>
            <p className="text-xs text-[#777587]">{fmtDate(req.created_at)}</p>
          </div>
          <span className="text-xs text-[#777587] font-mono bg-[#f0f3ff] px-2 py-1 rounded-lg flex-shrink-0 border border-[#e7eefe]">#{req.id}</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={12} className="text-[#777587] flex-shrink-0" />
            <span className="text-xs text-[#464555]">{req.contact_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail size={12} className="text-[#777587] flex-shrink-0" />
            <span className="text-xs text-[#464555] truncate">{req.email}</span>
          </div>
          {req.phone && (
            <div className="flex items-center gap-2">
              <Phone size={12} className="text-[#777587] flex-shrink-0" />
              <span className="text-xs text-[#464555]">{req.phone}</span>
            </div>
          )}
          {req.website && (
            <div className="flex items-center gap-2">
              <Globe size={12} className="text-[#777587] flex-shrink-0" />
              <a href={req.website} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#3525cd] hover:text-[#4f46e5] truncate transition-colors">{req.website}</a>
            </div>
          )}
        </div>

        {req.message && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
            <MessageSquare size={12} className="text-[#777587] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#464555] italic leading-relaxed">{req.message}</p>
          </div>
        )}

        {req.reviewer_notes && (
          <div className="mb-3 p-2.5 rounded-xl border border-[#c7c4d8] bg-[#f0f3ff]">
            <p className="text-[0.6rem] text-[#777587] font-black uppercase tracking-widest mb-1">Review Notes</p>
            <p className="text-xs text-[#464555]">{req.reviewer_notes}</p>
            {req.reviewed_at && <p className="text-[0.65rem] text-[#777587] mt-1">Reviewed {fmtDate(req.reviewed_at)}</p>}
          </div>
        )}

        {req.status === 'approved' && req.organization_id && (
          <div className="mb-3 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
            <p className="text-xs text-emerald-700 font-semibold">
              ✓ Organization created (ID: {req.organization_id}). Login credentials emailed to {req.email}.
            </p>
          </div>
        )}

        {req.status === 'pending' && !notesOpen && (
          <div className="flex gap-2">
            <button onClick={() => { setAction('approve'); setNotesOpen(true); }} disabled={isActing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40">
              <CheckCircle2 size={13} /> Approve
            </button>
            <button onClick={() => { setAction('reject'); setNotesOpen(true); }} disabled={isActing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all disabled:opacity-40">
              <XCircle size={13} /> Reject
            </button>
          </div>
        )}

        {notesOpen && (
          <div className="space-y-2">
            <p className="text-xs text-[#464555] font-semibold">
              {action === 'approve' ? 'Approval note (optional):' : 'Rejection reason (optional):'}
            </p>
            <textarea autoFocus rows={2}
              className="w-full px-3 py-2 rounded-xl text-xs border border-[#c7c4d8] text-[#151c27] placeholder-[#777587] bg-white focus:outline-none focus:border-[#3525cd] focus:ring-2 focus:ring-[#3525cd]/20 resize-none transition-all"
              placeholder={action === 'approve' ? 'Welcome message…' : 'Reason…'}
              value={notes} onChange={e => setNotes(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={submit} disabled={isActing}
                className={`flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 transition-all ${action === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                {isActing ? 'Processing…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
              </button>
              <button onClick={() => { setNotesOpen(false); setNotes(''); setAction(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#464555] border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCol({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 bg-white rounded-2xl border border-dashed border-[#c7c4d8]">
      <Inbox size={24} className="text-[#c7c4d8] mb-2" />
      <p className="text-xs text-[#777587] font-semibold">No {label} requests</p>
    </div>
  );
}

export default function PlatformRequests() {
  const qc = useQueryClient();

  const { data: all = [], isLoading } = useQuery({
    queryKey: ['platform-requests-all'],
    queryFn: () => paGet('/requests', { status: 'all' }),
    refetchInterval: 30000,
  });

  const { mutate: approve, isPending: isApproving } = useMutation({
    mutationFn: ({ id, notes }) => paPost(`/requests/${id}/approve`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-requests-all'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
  });
  const { mutate: reject, isPending: isRejecting } = useMutation({
    mutationFn: ({ id, notes }) => paPost(`/requests/${id}/reject`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-requests-all'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
  });

  const pending  = all.filter(r => r.status === 'pending');
  const approved = all.filter(r => r.status === 'approved');
  const rejected = all.filter(r => r.status === 'rejected');
  const isActing = isApproving || isRejecting;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[#151c27] tracking-tight">Organization Requests</h1>
        <p className="text-sm text-[#464555] mt-0.5">Review and approve new company registrations</p>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Pending',  count: pending.length,  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Approved', count: approved.length, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          { label: 'Rejected', count: rejected.length, cls: 'bg-rose-50 text-rose-700 border-rose-200' },
        ].map(s => (
          <span key={s.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${s.cls}`}>
            {s.label}: {s.count}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#e7eefe] border-t-[#3525cd] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending — full width on top */}
          <section>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Clock size={12} className="text-amber-600" />
              </div>
              <h2 className="text-base font-black text-[#151c27]">Pending Reviews</h2>
              {pending.length > 0 && (
                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pending.length}</span>
              )}
            </div>
            {pending.length === 0 ? (
              <div className="flex items-center gap-3 py-6 px-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-emerald-700">All caught up! No pending requests right now.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pending.map(req => (
                  <RequestCard key={req.id} req={req}
                    onApprove={(id, notes) => approve({ id, notes })}
                    onReject={(id, notes) => reject({ id, notes })}
                    isActing={isActing} />
                ))}
              </div>
            )}
          </section>

          {/* Approved + Rejected side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Approved */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={12} className="text-emerald-600" />
                </div>
                <h2 className="text-base font-black text-[#151c27]">Approved</h2>
                {approved.length > 0 && (
                  <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{approved.length}</span>
                )}
              </div>
              {approved.length === 0 ? <EmptyCol label="approved" /> : (
                <div className="space-y-3">
                  {approved.map(req => (
                    <RequestCard key={req.id} req={req} compact
                      onApprove={(id, notes) => approve({ id, notes })}
                      onReject={(id, notes) => reject({ id, notes })}
                      isActing={isActing} />
                  ))}
                </div>
              )}
            </section>

            {/* Rejected */}
            <section>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <XCircle size={12} className="text-rose-600" />
                </div>
                <h2 className="text-base font-black text-[#151c27]">Rejected</h2>
                {rejected.length > 0 && (
                  <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{rejected.length}</span>
                )}
              </div>
              {rejected.length === 0 ? <EmptyCol label="rejected" /> : (
                <div className="space-y-3">
                  {rejected.map(req => (
                    <RequestCard key={req.id} req={req} compact
                      onApprove={(id, notes) => approve({ id, notes })}
                      onReject={(id, notes) => reject({ id, notes })}
                      isActing={isActing} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
