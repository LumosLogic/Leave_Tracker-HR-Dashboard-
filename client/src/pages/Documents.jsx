import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, FolderOpen, File, Trash2, Download, AlertCircle, FileText,
  Image, Archive, X, ExternalLink, Eye, Users, Info, CheckCircle,
  CheckCircle2, Clock, XCircle, ChevronLeft, ChevronRight, RefreshCw,
  Phone, BookOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiDelete } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const CATEGORIES = [
  { value: 'id_proof',      label: 'ID Proof',       icon: '🪪', desc: 'Aadhaar, PAN, Passport, Driving License' },
  { value: 'address_proof', label: 'Address Proof',  icon: '🏠', desc: 'Utility Bills, Rent Agreement, etc.' },
  { value: 'bank_details',  label: 'Bank Details',   icon: '🏦', desc: 'Passbook, Cancelled Cheque, etc.' },
  { value: 'education',     label: 'Education',      icon: '🎓', desc: 'Certificates, Mark Sheets, Degrees' },
  { value: 'employment',    label: 'Employment',     icon: '💼', desc: 'Experience Letter, Offer Letter, etc.' },
  { value: 'other',         label: 'Other',          icon: '📁', desc: 'Any other documents' },
  // Legacy — kept for backward compat display
  { value: 'offer_letter',  label: 'Employment',     icon: '💼', desc: 'Offer / Appointment Letters' },
  { value: 'contract',      label: 'Employment',     icon: '💼', desc: 'Employment Contracts' },
  { value: 'certificate',   label: 'Education',      icon: '🎓', desc: 'Certificates' },
];

// Only tabs shown in filter bar (no legacy duplicates)
const FILTER_TABS = CATEGORIES.slice(0, 6);
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const DOC_STATUS = {
  pending_review: { label: 'Pending Review', cls: 'bg-amber-50 text-amber-700 border-amber-200',   icon: <Clock size={11} /> },
  verified:       { label: 'Verified',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
  rejected:       { label: 'Rejected',       cls: 'bg-rose-50 text-rose-700 border-rose-200',      icon: <XCircle size={11} /> },
};

const PAGE_SIZE = 6;

function fmtBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fileIcon(type = '', size = 16) {
  if (type.includes('image')) return <Image size={size} className="text-emerald-500" />;
  if (type.includes('pdf'))   return <FileText size={size} className="text-rose-500" />;
  return <Archive size={size} className="text-[#3525cd]" />;
}
function canPreview(type = '') { return type.includes('image') || type.includes('pdf'); }

// ── Preview Modal ──────────────────────────────────────────────────────────────
function PreviewModal({ doc, onClose }) {
  if (!doc) return null;
  const isImage = doc.file_type?.includes('image');
  const isPdf   = doc.file_type?.includes('pdf');
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.85)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-[#c7c4d8] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f3ff] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] flex items-center justify-center">{fileIcon(doc.file_type)}</div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[#151c27] text-sm truncate">{doc.name}</p>
            <p className="text-xs text-[#777587]">{fmtBytes(doc.file_size)} · {doc.file_type}</p>
          </div>
          <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#3525cd] bg-[#f0f3ff] hover:bg-[#e7eefe] transition-colors">
            <Download size={12} /> Download
          </a>
          <button onClick={onClose} className="p-2 rounded-lg text-[#777587] hover:bg-[#f0f3ff] transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto bg-[#f9f9ff] flex items-center justify-center p-4">
          {isImage && <img src={doc.file_url} alt={doc.name} className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />}
          {isPdf   && <iframe src={doc.file_url} title={doc.name} className="w-full rounded-xl border border-[#c7c4d8]" style={{ height: 'calc(90vh - 140px)', minHeight: 400 }} />}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Documents() {
  const { isAdmin, isEmployee } = useAuth();
  const toast  = useToast();
  const qc     = useQueryClient();
  const fileRef = useRef();

  const [uploading,   setUploading]   = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [upForm,      setUpForm]      = useState({ name: '', category: '', expiry_date: '' });
  const [activeTab,   setActiveTab]   = useState('all');
  const [preview,     setPreview]     = useState(null);
  const [empFilter,   setEmpFilter]   = useState('all');
  const [page,        setPage]        = useState(1);

  const { data: _docsData, isLoading } = useQuery({
    queryKey: ['documents', empFilter],
    queryFn: () => apiGet('/documents', empFilter !== 'all' ? { userId: empFilter } : {}),
  });
  const docs = Array.isArray(_docsData) ? _docsData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/documents/${id}`),
    onSuccess: () => { toast('Document deleted', 'warning'); qc.invalidateQueries({ queryKey: ['documents'] }); setConfirmDel(null); },
    onError: e => toast(e.message, 'error'),
  });

  async function handleStatusChange(docId, status) {
    try {
      const token = localStorage.getItem('lt_token');
      const res   = await fetch(`/api/documents/${docId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast(`Document marked as ${DOC_STATUS[status]?.label}`, 'success');
      qc.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleUpload() {
    if (!pendingFile || !upForm.name) { toast('Enter a name for the document', 'error'); return; }
    if (!upForm.category)              { toast('Select a document type', 'error'); return; }
    setUploading(true);
    try {
      const token = localStorage.getItem('lt_token');
      const fd    = new FormData();
      fd.append('file', pendingFile);
      fd.append('name',     upForm.name);
      fd.append('category', upForm.category);
      if (upForm.expiry_date) fd.append('expiry_date', upForm.expiry_date);
      const res  = await fetch('/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast('Document uploaded!', 'success');
      qc.invalidateQueries({ queryKey: ['documents'] });
      setPendingFile(null);
      setUpForm({ name: '', category: '', expiry_date: '' });
    } catch (err) { toast(err.message, 'error'); }
    finally { setUploading(false); }
  }

  const today    = new Date().toISOString().split('T')[0];
  const soon     = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];
  const expired  = docs.filter(d => d.expiry_date && d.expiry_date < today);
  const expiring = docs.filter(d => d.expiry_date && d.expiry_date >= today && d.expiry_date <= soon);

  const filtered = activeTab === 'all' ? docs : docs.filter(d => {
    const cat = CAT_MAP[d.category];
    if (activeTab === 'employment') return ['employment','offer_letter','contract'].includes(d.category);
    if (activeTab === 'education')  return ['education','certificate'].includes(d.category);
    return d.category === activeTab;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const verified  = docs.filter(d => d.status === 'verified').length;
  const pendingR  = docs.filter(d => !d.status || d.status === 'pending_review').length;
  const rejected  = docs.filter(d => d.status === 'rejected').length;

  const uniqueEmployees = isAdmin
    ? [...new Map(docs.map(d => [d.user_id, { id: d.user_id, name: d.owner?.name, avatar_color: d.owner?.avatar_color }])).values()].filter(e => e.name)
    : [];

  function onTabChange(v) { setActiveTab(v); setPage(1); }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">My Documents</h1>
          <p className="page-subtitle">Upload and manage your important documents securely.</p>
        </div>
        {isEmployee && (
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload Document
          </button>
        )}
      </div>

      <input type="file" ref={fileRef} className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
        onChange={e => {
          if (e.target.files[0]) {
            const f = e.target.files[0];
            setPendingFile(f);
            setUpForm(v => ({ ...v, name: f.name.replace(/\.[^.]+$/, '') }));
          }
        }} />

      {/* Upload panel */}
      {pendingFile && (
        <div className="card p-5 mb-5 border-[#3525cd]/20 bg-[#f0f3ff]/30">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#e7eefe]">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#c7c4d8] flex items-center justify-center">{fileIcon(pendingFile.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#151c27] text-sm truncate">{pendingFile.name}</p>
              <p className="text-xs text-[#777587]">{fmtBytes(pendingFile.size)} · {pendingFile.type || 'file'}</p>
            </div>
            <button className="p-1.5 rounded-lg text-[#777587] hover:text-rose-500 hover:bg-rose-50 transition-colors" onClick={() => setPendingFile(null)}><X size={16} /></button>
          </div>
          <div className="flex items-center gap-2 p-2.5 mb-4 rounded-lg bg-white border border-[#e7eefe] text-xs text-[#777587]">
            <Info size={12} className="text-[#3525cd] flex-shrink-0" />
            <span>Accepted: <strong className="text-[#464555]">PDF, JPG, PNG, WEBP, DOC, DOCX</strong> · Max: <strong className="text-[#464555]">10 MB</strong></span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Document Name <span className="text-rose-500">*</span></label>
              <input className="form-control" value={upForm.name} onChange={e => setUpForm(v => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Expiry Date <span className="font-normal text-[#777587] normal-case">(if applicable)</span></label>
              <input type="date" className="form-control" value={upForm.expiry_date} onChange={e => setUpForm(v => ({ ...v, expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label">Document Type <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {FILTER_TABS.map(c => (
                <button key={c.value} type="button" onClick={() => setUpForm(v => ({ ...v, category: c.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    upForm.category === c.value ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50'}`}>
                  <span>{c.icon}</span> {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-outline" onClick={() => { setPendingFile(null); setUpForm({ name: '', category: '', expiry_date: '' }); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !upForm.name || !upForm.category}>
              {uploading ? <><span className="spinner w-4 h-4" />Uploading…</> : <><Upload size={14} />Upload Document</>}
            </button>
          </div>
        </div>
      )}

      {/* Expiry alerts */}
      {expired.length > 0 && (
        <div className="card p-4 mb-4 border-rose-200 bg-rose-50 flex items-start gap-3">
          <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-rose-800 mb-1">Expired Documents ({expired.length})</p>
            {expired.map(d => <p key={d.id} className="text-xs text-rose-700">{d.name} — expired {fmtDate(d.expiry_date)}</p>)}
          </div>
        </div>
      )}
      {expiring.length > 0 && (
        <div className="card p-4 mb-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-amber-800 mb-1">Expiring Soon ({expiring.length})</p>
            {expiring.map(d => <p key={d.id} className="text-xs text-amber-700">{d.name} — expires {fmtDate(d.expiry_date)}</p>)}
          </div>
        </div>
      )}

      {/* Admin employee filter */}
      {isAdmin && uniqueEmployees.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Users size={14} className="text-[#777587] flex-shrink-0" />
          <span className="text-xs font-bold text-[#464555]">Filter by employee:</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setEmpFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${empFilter === 'all' ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
              All employees
            </button>
            {uniqueEmployees.map(emp => (
              <button key={emp.id} onClick={() => setEmpFilter(String(emp.id))}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${empFilter === String(emp.id) ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
                {emp.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading documents…</div>
      ) : docs.length === 0 && !isAdmin ? (
        /* Empty state guide for employees */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#f0f3ff] border border-[#3525cd]/20">
              <Info size={16} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-[#151c27] mb-0.5">What documents should I upload?</p>
                <p className="text-xs text-[#464555]">HR requires certain documents for onboarding. Upload PDF, JPG, PNG, WEBP, DOC, DOCX (max 10 MB).</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: '🪪', label: 'Identity Documents',   ex: ['Aadhaar Card', 'PAN Card', 'Passport'], bg: 'border-[#3525cd]/20 bg-[#f0f3ff]/60' },
                { icon: '🏠', label: 'Address Proof',        ex: ['Utility Bill', 'Bank Statement', 'Rent Agreement'], bg: 'border-amber-200 bg-amber-50/60' },
                { icon: '🎓', label: 'Educational Records',  ex: ['Degree Certificate', 'Marksheets', 'Diplomas'], bg: 'border-emerald-200 bg-emerald-50/60' },
                { icon: '💼', label: 'Employment Documents', ex: ['Offer Letter', 'Appointment Letter', 'NDA'], bg: 'border-purple-200 bg-purple-50/60' },
              ].map(g => (
                <div key={g.label} className={`rounded-xl border p-4 ${g.bg}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-lg flex-shrink-0">{g.icon}</div>
                    <p className="text-sm font-black text-[#151c27]">{g.label}</p>
                  </div>
                  <ul className="space-y-1">
                    {g.ex.map(ex => (
                      <li key={ex} className="flex items-center gap-2 text-xs text-[#464555]">
                        <CheckCircle size={11} className="text-[#3525cd] flex-shrink-0" />{ex}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="text-center py-4">
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Upload Your First Document
              </button>
              <p className="text-xs text-[#777587] mt-2">PDF · JPG · PNG · WEBP · DOC · DOCX · Max 10 MB</p>
            </div>
          </div>
          <RightPanel />
        </div>
      ) : docs.length === 0 && isAdmin ? (
        <div className="empty-state"><FolderOpen size={48} className="mx-auto mb-3 text-[#c7c4d8]" /><p>No employee documents found</p></div>
      ) : (
        /* Main two-column layout */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div>
            {/* Category filter tabs */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {[{ value: 'all', label: 'All Documents', icon: '📂' }, ...FILTER_TABS].map(tab => (
                <button key={tab.value} onClick={() => onTabChange(tab.value)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    activeTab === tab.value ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
                  <span>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Documents', value: docs.length,  icon: <FolderOpen size={16} />, cls: 'text-[#3525cd] bg-[#f0f3ff]' },
                { label: 'Verified',        value: verified,     icon: <CheckCircle2 size={16} />, cls: 'text-emerald-600 bg-emerald-50' },
                { label: 'Pending Review',  value: pendingR,     icon: <Clock size={16} />,       cls: 'text-amber-600 bg-amber-50' },
                { label: 'Rejected',        value: rejected,     icon: <XCircle size={16} />,     cls: 'text-rose-600 bg-rose-50' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-[#c7c4d8] p-3.5 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.cls}`}>{s.icon}</div>
                  <div>
                    <p className="text-xl font-black text-[#151c27] leading-tight">{s.value}</p>
                    <p className="text-[0.65rem] text-[#777587] font-medium leading-tight">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                    <tr>
                      <th className="px-4 py-3 font-black text-[#464555]">Document Name</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Category</th>
                      {isAdmin && <th className="px-4 py-3 font-black text-[#464555]">Employee</th>}
                      <th className="px-4 py-3 font-black text-[#464555]">Upload Date</th>
                      <th className="px-4 py-3 font-black text-[#464555]">File Size</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Status</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Expiry Date</th>
                      <th className="px-4 py-3 font-black text-[#464555] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3ff]">
                    {paginated.length === 0 ? (
                      <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-10 text-[#9ca3af]">No documents in this category</td></tr>
                    ) : paginated.map(doc => {
                      const cat       = CAT_MAP[doc.category] || CAT_MAP.other;
                      const st        = DOC_STATUS[doc.status || 'pending_review'];
                      const isExpd    = doc.expiry_date && doc.expiry_date < today;
                      const isExpng   = doc.expiry_date && doc.expiry_date >= today && doc.expiry_date <= soon;
                      const prevable  = canPreview(doc.file_type);
                      return (
                        <tr key={doc.id} className="hover:bg-[#fafaff] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-[#f0f3ff] flex items-center justify-center flex-shrink-0">
                                {fileIcon(doc.file_type, 14)}
                              </div>
                              <div>
                                <p className="font-bold text-[#151c27] truncate max-w-[140px]">{doc.name}</p>
                                <p className="text-[0.65rem] text-[#9ca3af] uppercase">{doc.file_type?.split('/')[1] || 'file'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[0.65rem] font-bold bg-[#f0f3ff] text-[#464555] border border-[#c7c4d8] w-fit">
                              <span>{cat.icon}</span>{cat.label}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              {doc.owner?.name && (
                                <div className="flex items-center gap-1.5">
                                  <Avatar name={doc.owner.name} color={doc.owner.avatar_color} size={20} />
                                  <span className="font-semibold text-[#151c27] truncate max-w-[100px]">{doc.owner.name}</span>
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-[#777587]">{fmtDate(doc.created_at?.slice(0,10) || '')}</td>
                          <td className="px-4 py-3 text-[#777587]">{fmtBytes(doc.file_size)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${st.cls}`}>
                                {st.icon}{st.label}
                              </span>
                              {isAdmin && (
                                <select
                                  className="text-[0.65rem] border border-[#c7c4d8] rounded-lg px-1 py-0.5 bg-white text-[#464555] ml-1 cursor-pointer"
                                  value={doc.status || 'pending_review'}
                                  onChange={e => handleStatusChange(doc.id, e.target.value)}>
                                  <option value="pending_review">Pending</option>
                                  <option value="verified">Verified</option>
                                  <option value="rejected">Rejected</option>
                                </select>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {doc.expiry_date
                              ? <span className={`text-[0.65rem] font-semibold ${isExpd ? 'text-rose-600' : isExpng ? 'text-amber-600' : 'text-[#777587]'}`}>
                                  {isExpd ? '❌ ' : isExpng ? '⚠️ ' : ''}{fmtDate(doc.expiry_date)}
                                </span>
                              : <span className="text-[#9ca3af]">—</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {prevable ? (
                                <button title="View" onClick={() => setPreview(doc)}
                                  className="p-1.5 rounded-lg text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><Eye size={13} /></button>
                              ) : (
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Open"
                                  className="p-1.5 rounded-lg text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><ExternalLink size={13} /></a>
                              )}
                              <a href={doc.file_url} download target="_blank" rel="noopener noreferrer" title="Download"
                                className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><Download size={13} /></a>
                              {isEmployee && (
                                <button title="Replace" onClick={() => { setPendingFile(null); fileRef.current?.click(); }}
                                  className="p-1.5 rounded-lg text-[#777587] hover:text-amber-600 hover:bg-amber-50 transition-colors"><RefreshCw size={13} /></button>
                              )}
                              {(isAdmin || isEmployee) && (
                                <button title="Delete" onClick={() => setConfirmDel({ id: doc.id, name: doc.name })}
                                  className="p-1.5 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors"><Trash2 size={13} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-[#f0f3ff] flex items-center justify-between">
                  <p className="text-xs text-[#777587]">
                    Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} documents
                  </p>
                  <div className="flex items-center gap-1">
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${p === page ? 'bg-[#3525cd] text-white' : 'text-[#777587] hover:bg-[#f0f3ff]'}`}>
                        {p}
                      </button>
                    ))}
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                      className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              {totalPages <= 1 && filtered.length > 0 && (
                <div className="px-4 py-2.5 border-t border-[#f0f3ff]">
                  <p className="text-xs text-[#777587]">Showing all {filtered.length} document{filtered.length !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <RightPanel onUpload={isEmployee ? () => fileRef.current?.click() : null} />
        </div>
      )}

      {preview    && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      <ConfirmModal open={!!confirmDel} title="Delete Document"
        message={`Permanently delete "${confirmDel?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => delMut.mutate(confirmDel.id)}
        onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

// ── Right Panel ────────────────────────────────────────────────────────────────
function RightPanel({ onUpload }) {
  return (
    <div className="space-y-4">
      {/* Upload Guidelines */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#f0f3ff] flex items-center gap-2">
          <Info size={14} className="text-[#3525cd]" />
          <span className="font-black text-[#151c27] text-xs">Upload Guidelines</span>
        </div>
        <div className="p-4 space-y-2">
          {[
            'Supported formats: PDF, JPG, JPEG, PNG',
            'Maximum file size: 5 MB',
            'Please upload clear and valid documents.',
            'Use original documents for verification.',
          ].map(g => (
            <div key={g} className="flex items-start gap-2 text-xs text-[#464555]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3525cd] flex-shrink-0 mt-1.5" />
              {g}
            </div>
          ))}
          {onUpload && (
            <button onClick={onUpload} className="btn btn-primary w-full mt-3 text-xs">
              <Upload size={13} /> Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Document Categories */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#f0f3ff] flex items-center gap-2">
          <BookOpen size={14} className="text-[#3525cd]" />
          <span className="font-black text-[#151c27] text-xs">Document Categories</span>
        </div>
        <div className="p-4 space-y-3">
          {FILTER_TABS.map(c => (
            <div key={c.value} className="flex items-start gap-2.5">
              <span className="text-base flex-shrink-0 mt-0.5">{c.icon}</span>
              <div>
                <p className="text-xs font-bold text-[#151c27]">{c.label}</p>
                <p className="text-[0.65rem] text-[#9ca3af]">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Need Help */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] p-4">
        <p className="text-xs font-black text-[#151c27] mb-1">Need Help?</p>
        <p className="text-xs text-[#777587] mb-3">If you face any issue while uploading documents, please contact HR.</p>
        <button className="btn btn-primary w-full text-xs">
          <Phone size={13} /> Contact HR
        </button>
      </div>

      {/* Status Legend */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] p-4">
        <p className="text-xs font-black text-[#151c27] mb-3">Status Indicators</p>
        <div className="space-y-2">
          {Object.entries(DOC_STATUS).map(([key, s]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${s.cls}`}>
                {s.icon}{s.label}
              </span>
              <span className="text-[0.65rem] text-[#9ca3af]">
                {key === 'verified' ? '— Document is verified by admin'
                  : key === 'pending_review' ? '— Document is under review'
                  : '— Document rejected (see reason)'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
