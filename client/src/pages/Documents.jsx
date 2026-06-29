import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FolderOpen, File, Trash2, Download, AlertCircle, FileText, Image, Archive, X, ExternalLink, Eye, Users, Info, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiDelete } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { fmtDate } from '@/lib/utils';

const CATEGORIES = [
  { value: 'id_proof',      label: 'ID Proof',       icon: '🪪', color: 'bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8]' },
  { value: 'address_proof', label: 'Address Proof',  icon: '🏠', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'education',     label: 'Education',      icon: '🎓', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'offer_letter',  label: 'Offer Letter',   icon: '📄', color: 'bg-[#f0f3ff] text-[#712ae2] border-[#c7c4d8]' },
  { value: 'contract',      label: 'Contract',       icon: '📝', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'certificate',   label: 'Certificate',    icon: '🏆', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'other',         label: 'Other',          icon: '📁', color: 'bg-[#f0f3ff] text-[#464555] border-[#c7c4d8]' },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

// Guidance cards shown in the empty state for employees
const DOCUMENT_GUIDE = [
  {
    icon: '🪪',
    label: 'Identity Documents',
    examples: ['Aadhaar Card', 'PAN Card', 'Passport', 'Voter ID'],
    cats: ['id_proof'],
    color: 'border-[#3525cd]/20 bg-[#f0f3ff]/60',
    iconBg: 'bg-[#f0f3ff]',
  },
  {
    icon: '🏠',
    label: 'Address Proof',
    examples: ['Utility Bill', 'Bank Statement', 'Rent Agreement'],
    cats: ['address_proof'],
    color: 'border-amber-200 bg-amber-50/60',
    iconBg: 'bg-amber-50',
  },
  {
    icon: '🎓',
    label: 'Educational Records',
    examples: ['Degree Certificate', 'Marksheets', 'Diplomas', 'Transcripts'],
    cats: ['education', 'certificate'],
    color: 'border-emerald-200 bg-emerald-50/60',
    iconBg: 'bg-emerald-50',
  },
  {
    icon: '📄',
    label: 'Employment Documents',
    examples: ['Offer Letter', 'Appointment Letter', 'Employment Contract', 'NDA'],
    cats: ['offer_letter', 'contract'],
    color: 'border-purple-200 bg-purple-50/60',
    iconBg: 'bg-purple-50',
  },
];

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type = '', size = 18) {
  if (type.includes('image')) return <Image size={size} className="text-emerald-500" />;
  if (type.includes('pdf'))   return <FileText size={size} className="text-rose-500" />;
  return <Archive size={size} className="text-[#3525cd]" />;
}

function canPreview(type = '') {
  return type.includes('image') || type.includes('pdf');
}

// ── Inline Preview Modal ───────────────────────────────────────────────────────
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
          <div className="w-9 h-9 rounded-xl bg-[#f0f3ff] flex items-center justify-center">
            {fileIcon(doc.file_type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[#151c27] text-sm truncate">{doc.name}</p>
            <p className="text-xs text-[#777587]">{fmtBytes(doc.file_size)} · {doc.file_type}</p>
          </div>
          <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#3525cd] bg-[#f0f3ff] hover:bg-[#e7eefe] transition-colors flex-shrink-0">
            <Download size={12} /> Download
          </a>
          <button onClick={onClose}
            className="p-2 rounded-lg text-[#777587] hover:text-[#151c27] hover:bg-[#f0f3ff] transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#f9f9ff] flex items-center justify-center p-4">
          {isImage && (
            <img src={doc.file_url} alt={doc.name}
              className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
          )}
          {isPdf && (
            <iframe src={doc.file_url} title={doc.name}
              className="w-full rounded-xl border border-[#c7c4d8]"
              style={{ height: 'calc(90vh - 140px)', minHeight: '400px' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee guidance shown when no docs uploaded ──────────────────────────────
function DocumentGuide({ onUpload }) {
  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#f0f3ff] border border-[#3525cd]/20">
        <Info size={16} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black text-[#151c27] mb-0.5">What documents should I upload?</p>
          <p className="text-xs text-[#464555]">
            HR requires certain documents for onboarding and compliance. Upload your documents below —
            supported formats are <strong>PDF, JPG, PNG, WEBP, DOC, DOCX</strong> (max 10 MB each).
          </p>
        </div>
      </div>

      {/* Document type guide grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOCUMENT_GUIDE.map(g => (
          <div key={g.label} className={`rounded-xl border p-4 ${g.color}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl ${g.iconBg} flex items-center justify-center text-lg flex-shrink-0`}>
                {g.icon}
              </div>
              <p className="text-sm font-black text-[#151c27]">{g.label}</p>
            </div>
            <ul className="space-y-1">
              {g.examples.map(ex => (
                <li key={ex} className="flex items-center gap-2 text-xs text-[#464555]">
                  <CheckCircle size={11} className="text-[#3525cd] flex-shrink-0" />
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Upload CTA */}
      <div className="text-center py-4">
        <button className="btn btn-primary" onClick={onUpload}>
          <Upload size={15} /> Upload Your First Document
        </button>
        <p className="text-xs text-[#777587] mt-2">PDF · JPG · PNG · WEBP · DOC · DOCX &nbsp;·&nbsp; Max 10 MB</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Documents() {
  const { isAdmin, isEmployee } = useAuth();
  const toast = useToast();
  const qc    = useQueryClient();
  const fileRef = useRef();

  const [uploading,   setUploading]   = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [upForm,      setUpForm]      = useState({ name: '', category: '', expiry_date: '' });
  const [activeTab,   setActiveTab]   = useState('all');
  const [preview,     setPreview]     = useState(null);
  const [empFilter,   setEmpFilter]   = useState('all');

  const { data: _docsData, isLoading } = useQuery({
    queryKey: ['documents', empFilter],
    queryFn: () => apiGet('/documents', empFilter !== 'all' ? { userId: empFilter } : {}),
  });
  const docs = Array.isArray(_docsData) ? _docsData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/documents/${id}`),
    onSuccess: () => { toast('Document deleted', 'warning'); qc.invalidateQueries({ queryKey: ['documents'] }); },
    onError: e => toast(e.message, 'error'),
  });

  async function handleUpload() {
    if (!pendingFile || !upForm.name) { toast('Please enter a name for the document', 'error'); return; }
    if (!upForm.category) { toast('Please select a document type before uploading', 'error'); return; }
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
  const expiring = docs.filter(d => d.expiry_date && d.expiry_date >= today && d.expiry_date <= soon);
  const expired  = docs.filter(d => d.expiry_date && d.expiry_date < today);
  const filtered = activeTab === 'all' ? docs : docs.filter(d => d.category === activeTab);
  const usedCats = [...new Set(docs.map(d => d.category))];

  const uniqueEmployees = isAdmin
    ? [...new Map(docs.map(d => [d.user_id, { id: d.user_id, name: d.owner?.name, avatar_color: d.owner?.avatar_color, department: d.owner?.department }])).values()].filter(e => e.name)
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isEmployee ? 'My Documents' : 'Employee Documents'}</h1>
          <p className="page-subtitle">{docs.length} document{docs.length !== 1 ? 's' : ''} · securely stored</p>
        </div>
        {isEmployee && docs.length > 0 && (
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Upload Document
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

      {/* Upload panel (employee only) */}
      {pendingFile && (
        <div className="card p-5 mb-6 border-[#3525cd]/20 bg-[#f0f3ff]/30">
          {/* File info row */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#e7eefe]">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#c7c4d8] flex items-center justify-center flex-shrink-0">
              {fileIcon(pendingFile.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#151c27] text-sm truncate">{pendingFile.name}</p>
              <p className="text-xs text-[#777587]">{fmtBytes(pendingFile.size)} · {pendingFile.type || 'file'}</p>
            </div>
            <button className="p-1.5 rounded-lg text-[#777587] hover:text-rose-500 hover:bg-rose-50 transition-colors" onClick={() => setPendingFile(null)}>
              <X size={16} />
            </button>
          </div>

          {/* Supported formats notice */}
          <div className="flex items-center gap-2 p-2.5 mb-4 rounded-lg bg-white border border-[#e7eefe] text-xs text-[#777587]">
            <Info size={12} className="text-[#3525cd] flex-shrink-0" />
            <span>Accepted: <strong className="text-[#464555]">PDF, JPG, PNG, WEBP, DOC, DOCX</strong> &nbsp;·&nbsp; Max size: <strong className="text-[#464555]">10 MB</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">Document Name <span className="text-rose-500">*</span></label>
              <input className="form-control" value={upForm.name} onChange={e => setUpForm(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Aadhaar Card" />
            </div>
            <div>
              <label className="form-label">Expiry Date <span className="font-normal text-[#777587] normal-case tracking-normal">(if applicable)</span></label>
              <input type="date" className="form-control" value={upForm.expiry_date} onChange={e => setUpForm(v => ({ ...v, expiry_date: e.target.value }))} />
            </div>
          </div>

          {/* Document Type — visual pill selector (mandatory) */}
          <div className="mb-4">
            <label className="form-label">
              Document Type <span className="text-rose-500">*</span>
              {!upForm.category && <span className="ml-2 text-xs font-normal text-rose-500 normal-case tracking-normal">Required — please select one</span>}
            </label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setUpForm(v => ({ ...v, category: c.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    upForm.category === c.value
                      ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm'
                      : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/50 hover:text-[#3525cd]'
                  }`}
                >
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

      {/* Admin: Employee filter */}
      {isAdmin && uniqueEmployees.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Users size={15} className="text-[#777587] flex-shrink-0" />
          <span className="text-xs font-bold text-[#464555]">Filter by employee:</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setEmpFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${empFilter === 'all' ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
              All employees
            </button>
            {uniqueEmployees.map(emp => (
              <button key={emp.id} onClick={() => setEmpFilter(String(emp.id))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${empFilter === String(emp.id) ? 'bg-[#3525cd] text-white border-[#3525cd]' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
                {emp.name}
              </button>
            ))}
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
        <div className="card p-4 mb-6 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-amber-800 mb-1">Expiring Soon ({expiring.length})</p>
            {expiring.map(d => <p key={d.id} className="text-xs text-amber-700">{d.name} — expires {fmtDate(d.expiry_date)}</p>)}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading documents…</div>
      ) : docs.length === 0 ? (
        isEmployee ? (
          <DocumentGuide onUpload={() => fileRef.current?.click()} />
        ) : (
          <div className="empty-state">
            <FolderOpen size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
            <p className="font-semibold text-[#464555] mb-1">No employee documents found</p>
            <p className="text-sm">Employees can upload their documents from the Employee Portal</p>
          </div>
        )
      ) : (
        <>
          {/* Category filter tabs */}
          <div className="flex gap-2 flex-wrap mb-5">
            <button onClick={() => setActiveTab('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${activeTab === 'all' ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
              All ({docs.length})
            </button>
            {usedCats.map(cat => {
              const cfg = CAT_MAP[cat];
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${activeTab === cat ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
                  {cfg?.icon}<span>{cfg?.label || cat}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(doc => {
              const cat     = CAT_MAP[doc.category] || CAT_MAP.other;
              const isExpd  = doc.expiry_date && doc.expiry_date < today;
              const isExpng = doc.expiry_date && doc.expiry_date >= today && doc.expiry_date <= soon;
              const previewable = canPreview(doc.file_type);

              return (
                <div key={doc.id} className={`card overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 ${isExpd ? 'border-rose-200' : isExpng ? 'border-amber-200' : ''}`}>
                  <div className="p-5">
                    {isAdmin && doc.owner?.name && (
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#f0f3ff]">
                        <Avatar name={doc.owner.name} color={doc.owner.avatar_color} size={24} />
                        <span className="text-xs font-semibold text-[#464555] truncate">{doc.owner.name}</span>
                        {doc.owner.department && (
                          <span className="text-[0.65rem] text-[#777587] ml-auto flex-shrink-0">{doc.owner.department}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#f0f3ff] flex items-center justify-center flex-shrink-0">
                        {fileIcon(doc.file_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#151c27] text-sm truncate">{doc.name}</p>
                        <p className="text-xs text-[#777587] mt-0.5">{fmtBytes(doc.file_size)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-4">
                      <span className={`badge ${cat.color} flex items-center gap-1 border`}>{cat.icon}{cat.label}</span>
                      {isExpd  && <span className="badge badge-rejected">Expired</span>}
                      {isExpng && <span className="badge badge-pending">Expiring soon</span>}
                    </div>

                    {doc.expiry_date && (
                      <p className={`text-xs mb-4 ${isExpd ? 'text-rose-600' : isExpng ? 'text-amber-600' : 'text-[#777587]'} font-semibold`}>
                        {isExpd ? '❌ Expired: ' : '⚠️ Expires: '}{fmtDate(doc.expiry_date)}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-4 border-t border-[#f0f3ff]">
                      {previewable ? (
                        <button
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-[#3525cd] bg-[#f0f3ff] hover:bg-[#e7eefe] transition-colors"
                          onClick={() => setPreview(doc)}>
                          <Eye size={12} /> View
                        </button>
                      ) : (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-[#3525cd] bg-[#f0f3ff] hover:bg-[#e7eefe] transition-colors">
                          <ExternalLink size={12} /> Open
                        </a>
                      )}
                      <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"
                        title="Download">
                        <Download size={14} />
                      </a>
                      {(isAdmin || isEmployee) && (
                        <button className="p-2 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          onClick={() => setConfirmDel({ id: doc.id, name: doc.name })}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}

      <ConfirmModal open={!!confirmDel} title="Delete Document"
        message={`Permanently delete "${confirmDel?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
