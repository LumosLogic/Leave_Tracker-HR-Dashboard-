import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, Filter, Building2, Mail, Phone, Globe, MessageSquare, ClipboardList } from 'lucide-react';
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

function RequestCard({ req, onApprove, onReject, isActing }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState(null);

  function confirmAction(act) { setAction(act); setNotesOpen(true); }
  function submit() {
    if (action === 'approve') onApprove(req.id, notes);
    else onReject(req.id, notes);
    setNotesOpen(false); setNotes(''); setAction(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e7eefe] overflow-hidden hover:border-[#c7c4d8] transition-colors">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base font-black text-[#151c27]">{req.company_name}</h3>
              <StatusBadge status={req.status} />
            </div>
            <p className="text-xs text-[#777587]">Submitted {fmtDate(req.created_at)}</p>
          </div>
          <span className="text-xs text-[#777587] font-mono bg-[#f0f3ff] px-2.5 py-1 rounded-lg flex-shrink-0 border border-[#e7eefe]">#{req.id}</span>
        </div>

        {/* Details grid */}
        <div className="grid sm:grid-cols-2 gap-2.5 mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={13} className="text-[#777587] flex-shrink-0" />
            <span className="text-sm text-[#464555]">{req.contact_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail size={13} className="text-[#777587] flex-shrink-0" />
            <span className="text-sm text-[#464555] truncate">{req.email}</span>
          </div>
          {req.phone && (
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-[#777587] flex-shrink-0" />
              <span className="text-sm text-[#464555]">{req.phone}</span>
            </div>
          )}
          {req.website && (
            <div className="flex items-center gap-2">
              <Globe size={13} className="text-[#777587] flex-shrink-0" />
              <a href={req.website} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#3525cd] hover:text-[#4f46e5] truncate transition-colors">{req.website}</a>
            </div>
          )}
        </div>

        {req.message && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
            <MessageSquare size={13} className="text-[#777587] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#464555] italic leading-relaxed">{req.message}</p>
          </div>
        )}

        {req.reviewer_notes && (
          <div className="mb-4 p-3 rounded-xl border border-[#c7c4d8] bg-[#f0f3ff]">
            <p className="text-[0.65rem] text-[#777587] font-black uppercase tracking-widest mb-1.5">Review Notes</p>
            <p className="text-sm text-[#464555]">{req.reviewer_notes}</p>
            {req.reviewed_at && <p className="text-xs text-[#777587] mt-1.5">Reviewed {fmtDate(req.reviewed_at)}</p>}
          </div>
        )}

        {req.status === 'approved' && req.organization_id && (
          <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
            <p className="text-xs text-emerald-700 font-semibold">
              ✓ Organization created (ID: {req.organization_id}). Login credentials emailed to {req.email}.
            </p>
          </div>
        )}

        {/* Action buttons */}
        {req.status === 'pending' && !notesOpen && (
          <div className="flex gap-2.5">
            <button onClick={() => confirmAction('approve')} disabled={isActing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40">
              <CheckCircle2 size={15} /> Approve
            </button>
            <button onClick={() => confirmAction('reject')} disabled={isActing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all disabled:opacity-40">
              <XCircle size={15} /> Reject
            </button>
          </div>
        )}

        {notesOpen && (
          <div className="space-y-2.5">
            <p className="text-xs text-[#464555] font-semibold">
              {action === 'approve' ? 'Approval note (optional — included in email):' : 'Rejection reason (optional — included in email):'}
            </p>
            <textarea
              autoFocus rows={2}
              className="w-full px-3 py-2.5 rounded-xl text-sm border border-[#c7c4d8] text-[#151c27] placeholder-[#777587] bg-white focus:outline-none focus:border-[#3525cd] focus:ring-2 focus:ring-[#3525cd]/20 resize-none transition-all"
              placeholder={action === 'approve' ? 'Welcome message…' : 'Reason for rejection…'}
              value={notes} onChange={e => setNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={submit} disabled={isActing}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all ${action === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                {isActing ? 'Processing…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`}
              </button>
              <button onClick={() => { setNotesOpen(false); setNotes(''); setAction(null); }}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#464555] border border-[#c7c4d8] hover:bg-[#f0f3ff] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlatformRequests() {
  const [filter, setFilter] = useState('pending');
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['platform-requests', filter],
    queryFn: () => paGet('/requests', { status: filter }),
    refetchInterval: 30000,
  });

  const { mutate: approve, isPending: isApproving } = useMutation({
    mutationFn: ({ id, notes }) => paPost(`/requests/${id}/approve`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-requests'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
  });

  const { mutate: reject, isPending: isRejecting } = useMutation({
    mutationFn: ({ id, notes }) => paPost(`/requests/${id}/reject`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-requests'] }); qc.invalidateQueries({ queryKey: ['platform-stats'] }); },
  });

  const FILTERS = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#151c27] tracking-tight">Organization Requests</h1>
          <p className="text-sm text-[#464555] mt-0.5">Review and approve new company registrations</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={13} className="text-[#777587]" />
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                filter === f.key
                  ? 'bg-[#3525cd] text-white border-[#3525cd]'
                  : 'bg-white text-[#464555] border-[#c7c4d8] hover:bg-[#f0f3ff] hover:text-[#3525cd]'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#e7eefe] border-t-[#3525cd] rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-[#e7eefe]">
          <div className="w-14 h-14 rounded-2xl bg-[#f0f3ff] flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={28} className="text-[#3525cd]/40" />
          </div>
          <p className="text-[#464555] font-bold">No {filter === 'all' ? '' : filter} requests</p>
          <p className="text-[#777587] text-sm mt-1">
            {filter === 'pending' ? 'New registration requests will appear here' : `No ${filter} requests found`}
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {requests.map(req => (
          <RequestCard key={req.id} req={req}
            onApprove={(id, notes) => approve({ id, notes })}
            onReject={(id, notes) => reject({ id, notes })}
            isActing={isApproving || isRejecting}
          />
        ))}
      </div>
    </div>
  );
}
