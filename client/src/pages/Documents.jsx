import React, { useState, useRef } from 'react';
import {
  Upload, FolderOpen, Trash2, Download, AlertCircle, FileText,
  Image, Archive, X, ExternalLink, Eye, Users, Info, CheckCircle2,
  ChevronLeft, ChevronRight, Phone,
  BookOpen, Globe, Lock, UserCheck, Share2, Edit2, RefreshCw,
  CreditCard, Landmark, Camera, GraduationCap, Briefcase, ScanLine, User, Home,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiDelete } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

// ── Categories ──────────────────────────────────────────────────────────────────
const EMPLOYEE_CATEGORIES = [
  { value: 'aadhaar',    label: 'Aadhaar Card',             icon: <CreditCard size={13} />,    desc: 'Aadhaar Card (front & back)' },
  { value: 'pan',        label: 'PAN Card',                 icon: <ScanLine size={13} />,      desc: 'PAN Card' },
  { value: 'bank_proof', label: 'Bank Account Proof',       icon: <Landmark size={13} />,      desc: 'Cancelled Cheque or Bank Statement' },
  { value: 'photo',      label: 'Passport Photo',           icon: <Camera size={13} />,        desc: 'Recent passport-size photograph' },
  { value: 'edu_cert',   label: 'Educational Certificates', icon: <GraduationCap size={13} />, desc: 'Degree, Marksheets, Diplomas' },
  { value: 'exp_letter', label: 'Experience / Offer Letter',icon: <Briefcase size={13} />,     desc: 'Offer Letter, Experience Letter, Relieving Letter' },
];

// Legacy values kept for backward-compatible display of existing documents
const LEGACY_CATEGORIES = [
  { value: 'id_proof',      label: 'ID Proof',      icon: <CreditCard size={13} />,    desc: 'Aadhaar, PAN, Passport' },
  { value: 'address_proof', label: 'Address Proof', icon: <Home size={13} />,          desc: 'Utility Bills, Rent Agreement' },
  { value: 'bank_details',  label: 'Bank Details',  icon: <Landmark size={13} />,      desc: 'Passbook, Cancelled Cheque' },
  { value: 'education',     label: 'Education',     icon: <GraduationCap size={13} />, desc: 'Certificates, Mark Sheets, Degrees' },
  { value: 'employment',    label: 'Employment',    icon: <Briefcase size={13} />,     desc: 'Experience Letter, Offer Letter' },
  { value: 'other',         label: 'Other',         icon: <FolderOpen size={13} />,    desc: 'Any other documents' },
  { value: 'offer_letter',  label: 'Employment',    icon: <Briefcase size={13} />,     desc: 'Offer / Appointment Letters' },
  { value: 'contract',      label: 'Employment',    icon: <FileText size={13} />,      desc: 'Employment Contracts' },
  { value: 'certificate',   label: 'Education',     icon: <GraduationCap size={13} />, desc: 'Certificates' },
];

// Build CAT_MAP: new categories take priority over legacy
const CAT_MAP = {};
for (const c of [...LEGACY_CATEGORIES, ...EMPLOYEE_CATEGORIES]) CAT_MAP[c.value] = c;

// ── Visibility config ───────────────────────────────────────────────────────────
const VIS_CFG = {
  self:       { label: 'Employee Only',   icon: <UserCheck size={10} />, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  all:        { label: 'All Employees',   icon: <Globe size={10} />,     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  specific:   { label: 'Shared',          icon: <Share2 size={10} />,    cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  admin_only: { label: 'Admins Only',     icon: <Lock size={10} />,      cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};


const PAGE_SIZE = 6;
const INIT_FORM = { name: '', category: '', expiry_date: '', visibility: 'self', targetUserId: '', shareWith: [] };

// ── Helpers ─────────────────────────────────────────────────────────────────────
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

// ── Preview Modal ────────────────────────────────────────────────────────────────
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

// ── Main Page ────────────────────────────────────────────────────────────────────
export default function Documents() {
  const { isAdmin, isEmployee, user } = useAuth();
  const toast   = useToast();
  const qc      = useQueryClient();
  const fileRef = useRef();

  const [uploading,   setUploading]   = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [upForm,      setUpForm]      = useState(INIT_FORM);
  const [activeTab,   setActiveTab]   = useState('all');
  const [preview,     setPreview]     = useState(null);
  const [empFilter,   setEmpFilter]   = useState('all');
  const [page,        setPage]        = useState(1);
  const [shareSearch, setShareSearch] = useState('');
  const [editDoc,     setEditDoc]     = useState(null);

  const set = (k, v) => setUpForm(f => ({ ...f, [k]: v }));

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: _docsData, isLoading } = useQuery({
    queryKey: ['documents', empFilter],
    queryFn: () => apiGet('/documents', empFilter !== 'all' ? { userId: empFilter } : {}),
  });
  const docs = Array.isArray(_docsData) ? _docsData : [];

  // Colleagues list for sharing picker (available to all authenticated users)
  const { data: colleagues = [] } = useQuery({
    queryKey: ['doc-colleagues'],
    queryFn: () => apiGet('/documents/colleagues'),
  });

  // Full employee list for admin target-employee selector
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-list-docs'],
    queryFn: async () => {
      const all = await apiGet('/employees');
      return all.filter(e => e.role === 'employee');
    },
    enabled: isAdmin,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const delMut = useMutation({
    mutationFn: id => apiDelete(`/documents/${id}`),
    onSuccess:  () => { toast('Document deleted', 'warning'); qc.invalidateQueries({ queryKey: ['documents'] }); setConfirmDel(null); },
    onError:    e  => toast(e.message, 'error'),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!pendingFile || !upForm.name) { toast('Enter a document name', 'error'); return; }
    if (!upForm.category)             { toast('Select a document type', 'error'); return; }
    if (isAdmin && upForm.visibility === 'self' && !upForm.targetUserId) {
      toast('Select the employee for "Particular Employee"', 'error'); return;
    }
    if (isAdmin && upForm.visibility === 'specific' && upForm.shareWith.length === 0) {
      toast('Select at least one employee for the group', 'error'); return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem('lt_token');
      const fd    = new FormData();
      fd.append('file',       pendingFile);
      fd.append('name',       upForm.name);
      fd.append('category',   upForm.category);
      fd.append('visibility', upForm.visibility);
      if (upForm.expiry_date) fd.append('expiry_date', upForm.expiry_date);
      if (isAdmin && upForm.targetUserId) fd.append('userId', upForm.targetUserId);
      if (upForm.visibility === 'specific' && upForm.shareWith.length > 0)
        fd.append('shared_with', JSON.stringify(upForm.shareWith));

      const res  = await fetch('/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast('Document uploaded successfully!', 'success');
      qc.invalidateQueries({ queryKey: ['documents'] });
      resetUpload();
    } catch (err) { toast(err.message, 'error'); }
    finally { setUploading(false); }
  }

  function resetUpload() {
    setPendingFile(null);
    setUpForm(INIT_FORM);
    setShareSearch('');
  }

  function toggleShareWith(id) {
    const sid = String(id);
    set('shareWith', upForm.shareWith.includes(sid)
      ? upForm.shareWith.filter(x => x !== sid)
      : [...upForm.shareWith, sid]
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const today    = new Date().toISOString().split('T')[0];
  const soon     = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];
  const expired  = docs.filter(d => d.expiry_date && d.expiry_date < today);
  const expiring = docs.filter(d => d.expiry_date && d.expiry_date >= today && d.expiry_date <= soon);

  const filtered   = activeTab === 'all' ? docs : docs.filter(d => d.category === activeTab);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);


  const uniqueEmployees = isAdmin
    ? [...new Map(docs.map(d => [d.user_id, { id: d.user_id, name: d.owner?.name, avatar_color: d.owner?.avatar_color }])).values()].filter(e => e.name)
    : [];

  // Sharing targets for picker
  const sharingPool = isEmployee ? colleagues : allEmployees.filter(e => String(e.id) !== upForm.targetUserId);
  const filteredShareTargets = shareSearch
    ? sharingPool.filter(e => e.name?.toLowerCase().includes(shareSearch.toLowerCase()))
    : sharingPool;

  function onTabChange(v) { setActiveTab(v); setPage(1); }

  // Admin visibility options (upload form)
  const adminVisOpts = [
    { value: 'all',        Icon: Globe, label: 'All Employees',           desc: 'Visible to every employee in the organization' },
    { value: 'self',       Icon: User,  label: 'Particular Employee',     desc: 'Only the selected employee can see this' },
    { value: 'specific',   Icon: Users, label: 'Group of Employees',      desc: 'Select specific employees who can see this' },
    { value: 'admin_only', Icon: Lock,  label: 'None (Only HR & Admins)', desc: 'Not visible to any employee' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">{isAdmin ? 'Documents' : 'My Documents'}</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Upload and manage employee documents.' : 'Upload and manage your important documents securely.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Upload Document
        </button>
      </div>

      <input type="file" ref={fileRef} className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) {
            setPendingFile(f);
            setUpForm({ ...INIT_FORM, name: f.name.replace(/\.[^.]+$/, ''), visibility: isEmployee ? 'self' : 'admin_only' });
          }
          e.target.value = '';
        }} />

      {/* ── Upload Panel ── */}
      {pendingFile && (
        <div className="card p-5 mb-5 border-[#3525cd]/20 bg-[#f0f3ff]/30">
          {/* File info row */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#e7eefe]">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#c7c4d8] flex items-center justify-center">
              {fileIcon(pendingFile.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#151c27] text-sm truncate">{pendingFile.name}</p>
              <p className="text-xs text-[#777587]">{fmtBytes(pendingFile.size)} · {pendingFile.type || 'file'}</p>
            </div>
            <button className="p-1.5 rounded-lg text-[#777587] hover:text-rose-500 hover:bg-rose-50 transition-colors" onClick={resetUpload}>
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 p-2.5 mb-4 rounded-lg bg-white border border-[#e7eefe] text-xs text-[#777587]">
            <Info size={12} className="text-[#3525cd] flex-shrink-0" />
            <span>Accepted: <strong className="text-[#464555]">PDF, JPG, PNG, WEBP, DOC, DOCX</strong> · Max: <strong className="text-[#464555]">10 MB</strong></span>
          </div>

          {/* Name + Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Document Name <span className="text-rose-500">*</span></label>
              <input className="form-control" value={upForm.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Aadhaar Card" />
            </div>
            <div>
              <label className="form-label">
                Expiry Date <span className="font-normal text-[#777587] normal-case">(if applicable)</span>
              </label>
              <input type="date" className="form-control" value={upForm.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </div>
          </div>

          {/* Document type */}
          <div className="mb-4">
            <label className="form-label">Document Type <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EMPLOYEE_CATEGORIES.map(c => (
                <button key={c.value} type="button" onClick={() => set('category', c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    upForm.category === c.value
                      ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm'
                      : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50'}`}>
                  <span>{c.icon}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visibility / Sharing — admin only */}
          {isAdmin && (
          <div className="mb-4 p-4 rounded-xl bg-white border border-[#e7eefe]">
            <p className="form-label mb-3 flex items-center gap-1.5">
              <Share2 size={13} className="text-[#3525cd]" />
              Who can see this document?
            </p>

            {isAdmin ? (
              <div className="space-y-2">
                {adminVisOpts.map(opt => (
                  <div key={opt.value}>
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      upForm.visibility === opt.value ? 'border-[#3525cd] bg-[#f0f3ff]' : 'border-[#e7eefe] hover:border-[#c7c4d8]'}`}>
                      <input type="radio" name="visibility" value={opt.value}
                        checked={upForm.visibility === opt.value}
                        onChange={e => { set('visibility', e.target.value); if (e.target.value !== 'self') set('targetUserId', ''); if (e.target.value !== 'specific') set('shareWith', []); }}
                        className="text-[#3525cd]" />
                      <opt.Icon size={16} className="text-[#3525cd] flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-[#151c27]">{opt.label}</p>
                        <p className="text-[0.65rem] text-[#9ca3af]">{opt.desc}</p>
                      </div>
                    </label>
                    {/* Particular Employee — inline picker */}
                    {opt.value === 'self' && upForm.visibility === 'self' && (
                      <div className="ml-10 mt-2">
                        <select className="form-control text-xs"
                          value={upForm.targetUserId}
                          onChange={e => set('targetUserId', e.target.value)}>
                          <option value="">— Select employee —</option>
                          {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </div>
                    )}
                    {/* Group of Employees — inline multi-select */}
                    {opt.value === 'specific' && upForm.visibility === 'specific' && (
                      <div className="ml-10 mt-2">
                        <input type="text" placeholder="Search employees…"
                          className="form-control text-xs mb-2"
                          value={shareSearch} onChange={e => setShareSearch(e.target.value)} />
                        <div className="max-h-40 overflow-y-auto border border-[#e7eefe] rounded-xl bg-[#fafaff] p-1.5 space-y-0.5">
                          {filteredShareTargets.length === 0
                            ? <p className="text-xs text-[#9ca3af] text-center py-3">No employees found</p>
                            : filteredShareTargets.map(e => (
                              <label key={e.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors">
                                <input type="checkbox"
                                  checked={upForm.shareWith.includes(String(e.id))}
                                  onChange={() => toggleShareWith(e.id)}
                                  className="text-[#3525cd] rounded" />
                                <Avatar name={e.name} color={e.avatar_color} size={22} />
                                <div>
                                  <p className="text-xs font-semibold text-[#151c27]">{e.name}</p>
                                  {e.department && <p className="text-[0.6rem] text-[#9ca3af]">{e.department}</p>}
                                </div>
                              </label>
                            ))}
                        </div>
                        {upForm.shareWith.length > 0 && (
                          <p className="text-xs text-[#3525cd] font-semibold mt-1.5">
                            {upForm.shareWith.length} {upForm.shareWith.length === 1 ? 'employee' : 'employees'} selected
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

          </div>
          )}

          <div className="flex gap-3">
            <button className="btn btn-outline" onClick={resetUpload}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpload}
              disabled={uploading || !upForm.name || !upForm.category}>
              {uploading
                ? <><span className="spinner w-4 h-4" /> Uploading…</>
                : <><Upload size={14} /> Upload Document</>}
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
        <div className="loading"><div className="spinner" /> Loading documents…</div>

      ) : docs.length === 0 && isEmployee ? (
        /* Empty state with onboarding category guide */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#f0f3ff] border border-[#3525cd]/20">
              <Info size={16} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-[#151c27] mb-0.5">Required Onboarding Documents</p>
                <p className="text-xs text-[#464555]">Please upload the following documents for HR verification. Max 10 MB per file.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EMPLOYEE_CATEGORIES.map(c => (
                <div key={c.value} className="rounded-xl border border-[#c7c4d8] bg-white p-4 flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{c.icon}</span>
                  <div>
                    <p className="text-xs font-black text-[#151c27]">{c.label}</p>
                    <p className="text-[0.65rem] text-[#9ca3af]">{c.desc}</p>
                  </div>
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
        <div className="empty-state">
          <FolderOpen size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p>No documents found</p>
        </div>

      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          <div>
            {/* Category filter tabs */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {[{ value: 'all', label: 'All Documents', icon: '📂' }, ...EMPLOYEE_CATEGORIES].map(tab => (
                <button key={tab.value} onClick={() => onTabChange(tab.value)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    activeTab === tab.value
                      ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm'
                      : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
                  <span>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>

            {/* Total docs count */}
            <div className="mb-4">
              <div className="bg-white rounded-xl border border-[#c7c4d8] p-3.5 flex items-center gap-3 w-fit">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[#3525cd] bg-[#f0f3ff]">
                  <FolderOpen size={16} />
                </div>
                <div>
                  <p className="text-xl font-black text-[#151c27] leading-tight">{docs.length}</p>
                  <p className="text-[0.65rem] text-[#777587] font-medium leading-tight">Total Documents</p>
                </div>
              </div>
            </div>

            {/* Documents table */}
            <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f0f3ff] border-b border-[#c7c4d8]">
                    <tr>
                      <th className="px-4 py-3 font-black text-[#464555]">Document Name</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Category</th>
                      {isAdmin && <th className="px-4 py-3 font-black text-[#464555]">Employee</th>}
                      <th className="px-4 py-3 font-black text-[#464555]">Upload Date</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Size</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Visibility</th>
                      <th className="px-4 py-3 font-black text-[#464555]">Expiry</th>
                      <th className="px-4 py-3 font-black text-[#464555] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3ff]">
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="text-center py-10 text-[#9ca3af]">
                          No documents in this category
                        </td>
                      </tr>
                    ) : paginated.map(doc => {
                      const cat = CAT_MAP[doc.category] || { icon: '📄', label: doc.category || 'Other' };
                      const vis = VIS_CFG[doc.visibility || 'self'];
                      const isExpd  = doc.expiry_date && doc.expiry_date < today;
                      const isExpng = doc.expiry_date && doc.expiry_date >= today && doc.expiry_date <= soon;
                      const prev    = canPreview(doc.file_type);
                      const isOwner = doc.user_id === user?.id;
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
                          <td className="px-4 py-3 text-[#777587]">{fmtDate(doc.created_at?.slice(0, 10) || '')}</td>
                          <td className="px-4 py-3 text-[#777587]">{fmtBytes(doc.file_size)}</td>
                          <td className="px-4 py-3">
                            {vis ? (
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border w-fit ${vis.cls}`}>
                                {vis.icon}{vis.label}
                              </span>
                            ) : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {doc.expiry_date
                              ? <span className={`text-[0.65rem] font-semibold ${isExpd ? 'text-rose-600' : isExpng ? 'text-amber-600' : 'text-[#777587]'}`}>
                                  {isExpd ? '❌ ' : isExpng ? '⚠️ ' : ''}{fmtDate(doc.expiry_date)}
                                </span>
                              : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {prev ? (
                                <button title="View" onClick={() => setPreview(doc)}
                                  className="p-1.5 rounded-lg text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
                                  <Eye size={13} />
                                </button>
                              ) : (
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Open"
                                  className="p-1.5 rounded-lg text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              <a href={doc.file_url} download target="_blank" rel="noopener noreferrer" title="Download"
                                className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
                                <Download size={13} />
                              </a>
                              {(isAdmin || (isEmployee && isOwner)) && (
                                <button title="Edit" onClick={() => setEditDoc(doc)}
                                  className="p-1.5 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors">
                                  <Edit2 size={13} />
                                </button>
                              )}
                              {(isAdmin || (isEmployee && isOwner)) && (
                                <button title="Delete" onClick={() => setConfirmDel({ id: doc.id, name: doc.name })}
                                  className="p-1.5 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors">
                                  <Trash2 size={13} />
                                </button>
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

          <RightPanel onUpload={() => fileRef.current?.click()} />
        </div>
      )}

      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      {editDoc && (
        <EditDocModal
          doc={editDoc}
          isAdmin={isAdmin}
          isEmployee={isEmployee}
          colleagues={colleagues}
          allEmployees={allEmployees}
          onClose={() => setEditDoc(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['documents'] }); setEditDoc(null); }}
        />
      )}

      <ConfirmModal
        open={!!confirmDel}
        title="Delete Document"
        message={`Permanently delete "${confirmDel?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => delMut.mutate(confirmDel.id)}
        onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

// ── Edit Document Modal ───────────────────────────────────────────────────────────
function EditDocModal({ doc, isAdmin, isEmployee, colleagues, allEmployees, onClose, onSaved }) {
  const toast = useToast();

  const existingShareIds = (doc.document_shares || []).map(s => String(s.shared_with_user_id));
  // Detect employee-uploaded doc: uploader = owner (employee uploaded their own)
  const isEmployeeDoc = doc.uploaded_by === doc.user_id;
  // Show visibility controls only for admin editing admin-uploaded docs
  const showVisibility = isAdmin && !isEmployeeDoc;

  const [form, setForm] = useState({
    name:         doc.name         || '',
    category:     doc.category     || '',
    expiry_date:  doc.expiry_date  || '',
    visibility:   doc.visibility   || 'self',
    shareWith:    existingShareIds,
    targetUserId: String(doc.user_id || ''),
  });
  const [newFile,     setNewFile]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const editFileRef = useRef();

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleShare(id) {
    const sid = String(id);
    setF('shareWith', form.shareWith.includes(sid)
      ? form.shareWith.filter(x => x !== sid)
      : [...form.shareWith, sid]
    );
  }

  // Pool for group picker — exclude target employee
  const sharingPool = allEmployees.filter(e => String(e.id) !== form.targetUserId);
  const filteredPool = shareSearch
    ? sharingPool.filter(e => e.name?.toLowerCase().includes(shareSearch.toLowerCase()))
    : sharingPool;

  const editVisOpts = [
    { value: 'all',        Icon: Globe, label: 'All Employees',           desc: 'Visible to every employee in the organization' },
    { value: 'self',       Icon: User,  label: 'Particular Employee',     desc: 'Only the selected employee can see this' },
    { value: 'specific',   Icon: Users, label: 'Group of Employees',      desc: 'Select specific employees who can see this' },
    { value: 'admin_only', Icon: Lock,  label: 'None (Only HR & Admins)', desc: 'Not visible to any employee' },
  ];

  async function handleSave() {
    if (!form.name.trim()) { toast('Document name is required', 'error'); return; }
    if (!form.category)    { toast('Select a document type', 'error');   return; }
    if (showVisibility && form.visibility === 'self' && !form.targetUserId) {
      toast('Select the employee for "Particular Employee"', 'error'); return;
    }
    if (showVisibility && form.visibility === 'specific' && form.shareWith.length === 0) {
      toast('Select at least one employee for the group', 'error'); return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('lt_token');
      const fd    = new FormData();
      fd.append('name',        form.name.trim());
      fd.append('category',    form.category);
      fd.append('expiry_date', form.expiry_date || '');
      if (showVisibility) {
        fd.append('visibility', form.visibility);
        if (form.visibility === 'self' && form.targetUserId)
          fd.append('targetUserId', form.targetUserId);
        if (form.visibility === 'specific')
          fd.append('shared_with', JSON.stringify(form.shareWith));
      }
      if (newFile) fd.append('file', newFile);

      const res  = await fetch(`/api/documents/${doc.id}`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body:    fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      toast('Document updated!', 'success');
      onSaved();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.6)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-[#c7c4d8] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#f0f3ff] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] flex items-center justify-center">
            <Edit2 size={16} className="text-[#3525cd]" />
          </div>
          <div className="flex-1">
            <p className="font-black text-[#151c27] text-sm">Edit Document</p>
            <p className="text-xs text-[#777587] truncate">{doc.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#777587] hover:bg-[#f0f3ff] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Name + Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Document Name <span className="text-rose-500">*</span></label>
              <input className="form-control" value={form.name}
                onChange={e => setF('name', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Expiry Date <span className="font-normal text-[#777587] normal-case">(if applicable)</span></label>
              <input type="date" className="form-control" value={form.expiry_date}
                onChange={e => setF('expiry_date', e.target.value)} />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="form-label">Document Type <span className="text-rose-500">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EMPLOYEE_CATEGORIES.map(c => (
                <button key={c.value} type="button" onClick={() => setF('category', c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    form.category === c.value
                      ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm'
                      : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50'}`}>
                  <span>{c.icon}</span>{c.label}
                </button>
              ))}
              {/* Show legacy category if doc has one and it's not in new list */}
              {!EMPLOYEE_CATEGORIES.find(c => c.value === form.category) && CAT_MAP[form.category] && (
                <button type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-[#3525cd] text-white border-[#3525cd] shadow-sm">
                  <span>{CAT_MAP[form.category].icon}</span>{CAT_MAP[form.category].label}
                </button>
              )}
            </div>
          </div>

          {/* Visibility — only for admin editing admin-uploaded docs */}
          {showVisibility && (
          <div className="p-4 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
            <p className="form-label mb-3 flex items-center gap-1.5">
              <Share2 size={13} className="text-[#3525cd]" /> Who can see this document?
            </p>

            <div className="space-y-2">
              {editVisOpts.map(opt => (
                <div key={opt.value}>
                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.visibility === opt.value ? 'border-[#3525cd] bg-[#f0f3ff]' : 'border-[#e7eefe] hover:border-[#c7c4d8]'}`}>
                    <input type="radio" name="edit-vis" value={opt.value}
                      checked={form.visibility === opt.value}
                      onChange={e => {
                        setF('visibility', e.target.value);
                        if (e.target.value !== 'specific') setF('shareWith', []);
                      }}
                      className="text-[#3525cd]" />
                    <opt.Icon size={16} className="text-[#3525cd] flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#151c27]">{opt.label}</p>
                      <p className="text-[0.65rem] text-[#9ca3af]">{opt.desc}</p>
                    </div>
                  </label>

                  {/* Particular Employee — inline picker */}
                  {opt.value === 'self' && form.visibility === 'self' && (
                    <div className="ml-10 mt-2">
                      <select className="form-control text-xs"
                        value={form.targetUserId}
                        onChange={e => setF('targetUserId', e.target.value)}>
                        <option value="">— Select employee —</option>
                        {allEmployees.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Group of Employees — inline multi-select */}
                  {opt.value === 'specific' && form.visibility === 'specific' && (
                    <div className="ml-10 mt-2">
                      <input type="text" placeholder="Search employees…"
                        className="form-control text-xs mb-2"
                        value={shareSearch} onChange={e => setShareSearch(e.target.value)} />
                      <div className="max-h-36 overflow-y-auto border border-[#e7eefe] rounded-xl bg-white p-1.5 space-y-0.5">
                        {filteredPool.length === 0
                          ? <p className="text-xs text-[#9ca3af] text-center py-2">No employees found</p>
                          : filteredPool.map(e => (
                            <label key={e.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[#f9f9ff] cursor-pointer transition-colors">
                              <input type="checkbox"
                                checked={form.shareWith.includes(String(e.id))}
                                onChange={() => toggleShare(e.id)} />
                              <Avatar name={e.name} color={e.avatar_color} size={22} />
                              <div>
                                <p className="text-xs font-semibold text-[#151c27]">{e.name}</p>
                                {e.department && <p className="text-[0.6rem] text-[#9ca3af]">{e.department}</p>}
                              </div>
                            </label>
                          ))}
                      </div>
                      {form.shareWith.length > 0 && (
                        <p className="text-xs text-[#3525cd] font-semibold mt-1.5">
                          {form.shareWith.length} {form.shareWith.length === 1 ? 'employee' : 'employees'} selected
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}


          {/* File replacement — hidden for admin editing employee-uploaded docs */}
          {!isEmployeeDoc && (
          <div className="p-4 rounded-xl bg-[#f9f9ff] border border-[#e7eefe]">
            <p className="form-label mb-2 flex items-center gap-1.5">
              <RefreshCw size={13} className="text-[#3525cd]" /> Replace File
            </p>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#e7eefe] mb-3">
              {fileIcon(doc.file_type, 14)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#151c27] truncate">{doc.name}</p>
                <p className="text-[0.65rem] text-[#9ca3af]">{fmtBytes(doc.file_size)} · current file</p>
              </div>
            </div>
            {newFile ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-2">
                {fileIcon(newFile.type, 14)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-800 truncate">{newFile.name}</p>
                  <p className="text-[0.65rem] text-emerald-600">{fmtBytes(newFile.size)} · will replace current file</p>
                </div>
                <button onClick={() => setNewFile(null)} className="p-1 rounded text-emerald-600 hover:bg-emerald-100 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : null}
            <input type="file" ref={editFileRef} className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              onChange={e => { if (e.target.files?.[0]) setNewFile(e.target.files[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => editFileRef.current?.click()}
              className="btn btn-outline text-xs w-full">
              <RefreshCw size={12} /> {newFile ? 'Choose Different File' : 'Choose Replacement File'}
            </button>
            <p className="text-[0.65rem] text-[#9ca3af] mt-1.5 text-center">
              Old file will be permanently deleted from storage
            </p>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#f0f3ff] flex gap-3 flex-shrink-0">
          <button className="btn btn-outline flex-1" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner w-4 h-4" /> Saving…</> : <><CheckCircle2 size={14} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Right Panel ──────────────────────────────────────────────────────────────────
function RightPanel({ onUpload }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#f0f3ff] flex items-center gap-2">
          <Info size={14} className="text-[#3525cd]" />
          <span className="font-black text-[#151c27] text-xs">Upload Guidelines</span>
        </div>
        <div className="p-4 space-y-2">
          {[
            'Supported formats: PDF, JPG, JPEG, PNG, WEBP',
            'Maximum file size: 10 MB per document',
            'Upload clear, legible copies of originals.',
            'Documents are shared with HR by default.',
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

      <div className="bg-white rounded-xl border border-[#c7c4d8] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#f0f3ff] flex items-center gap-2">
          <BookOpen size={14} className="text-[#3525cd]" />
          <span className="font-black text-[#151c27] text-xs">Required Documents</span>
        </div>
        <div className="p-4 space-y-3">
          {EMPLOYEE_CATEGORIES.map(c => (
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

      <div className="bg-white rounded-xl border border-[#c7c4d8] p-4">
        <p className="text-xs font-black text-[#151c27] mb-1">Need Help?</p>
        <p className="text-xs text-[#777587] mb-3">If you face any issue uploading documents, please contact HR.</p>
        <button className="btn btn-primary w-full text-xs">
          <Phone size={13} /> Contact HR
        </button>
      </div>

    </div>
  );
}
