import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FolderOpen, File, Trash2, Download, AlertCircle, FileText, Image, Archive } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiDelete } from '@/lib/api';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
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

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type = '') {
  if (type.includes('image')) return <Image size={18} className="text-emerald-500" />;
  if (type.includes('pdf'))   return <FileText size={18} className="text-rose-500" />;
  return <Archive size={18} className="text-[#3525cd]" />;
}

export default function Documents() {
  const { isAdmin, isEmployee } = useAuth();
  const wrap = isEmployee ? 'p-5 md:p-8 max-w-4xl mx-auto' : '';
  const toast = useToast();
  const qc    = useQueryClient();
  const fileRef = useRef();

  const [uploading,   setUploading]   = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [upForm,      setUpForm]      = useState({ name: '', category: 'other', expiry_date: '' });
  const [activeTab,   setActiveTab]   = useState('all');

  const { data: _docsData, isLoading } = useQuery({ queryKey: ['documents'], queryFn: () => apiGet('/documents') });
  const docs = Array.isArray(_docsData) ? _docsData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/documents/${id}`),
    onSuccess: () => { toast('Document deleted', 'warning'); qc.invalidateQueries({ queryKey: ['documents'] }); },
    onError: e => toast(e.message, 'error'),
  });

  async function handleUpload() {
    if (!pendingFile || !upForm.name) { toast('Please enter a name for the document', 'error'); return; }
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
      setUpForm({ name: '', category: 'other', expiry_date: '' });
    } catch (err) { toast(err.message, 'error'); }
    finally { setUploading(false); }
  }

  const today      = new Date().toISOString().split('T')[0];
  const soon       = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];
  const expiring   = docs.filter(d => d.expiry_date && d.expiry_date >= today && d.expiry_date <= soon);
  const expired    = docs.filter(d => d.expiry_date && d.expiry_date < today);

  const filtered   = activeTab === 'all' ? docs : docs.filter(d => d.category === activeTab);
  const usedCats   = [...new Set(docs.map(d => d.category))];

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Documents</h1>
          <p className="page-subtitle">{docs.length} document{docs.length !== 1 ? 's' : ''} · securely stored</p>
        </div>
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          <Upload size={15} />Upload Document
        </button>
      </div>

      <input type="file" ref={fileRef} className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        onChange={e => { if (e.target.files[0]) { const f = e.target.files[0]; setPendingFile(f); setUpForm(v => ({ ...v, name: f.name.replace(/\.[^.]+$/, '') })); } }} />

      {/* Upload panel */}
      {pendingFile && (
        <div className="card p-5 mb-6 border-[#3525cd]/20 bg-[#f0f3ff]/30">
          <div className="flex items-center gap-3 mb-4">
            {fileIcon(pendingFile.type)}
            <div className="flex-1">
              <p className="font-bold text-[#151c27] text-sm">{pendingFile.name}</p>
              <p className="text-xs text-[#777587]">{fmtBytes(pendingFile.size)}</p>
            </div>
            <button className="btn btn-ghost btn-icon text-[#777587] hover:text-rose-500" onClick={() => setPendingFile(null)}>✕</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="form-label">Document Name *</label>
              <input className="form-control" value={upForm.name} onChange={e => setUpForm(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Aadhaar Card" />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select className="form-control" value={upForm.category} onChange={e => setUpForm(v => ({ ...v, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Expiry Date <span className="font-normal text-[#777587] normal-case tracking-normal">(if applicable)</span></label>
              <input type="date" className="form-control" value={upForm.expiry_date} onChange={e => setUpForm(v => ({ ...v, expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-outline" onClick={() => setPendingFile(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !upForm.name}>
              {uploading ? <><span className="spinner w-4 h-4" />Uploading…</> : <><Upload size={14} />Upload</>}
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
        <div className="empty-state">
          <FolderOpen size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No documents uploaded yet</p>
          <p className="text-sm">Upload your ID, contracts, certificates and other documents</p>
          <button className="btn btn-primary mt-4" onClick={() => fileRef.current?.click()}><Upload size={14} />Upload First Document</button>
        </div>
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
              return (
                <div key={doc.id} className={`card overflow-hidden hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 ${isExpd ? 'border-rose-200' : isExpng ? 'border-amber-200' : ''}`}>
                  <div className="p-5">
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
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-[#3525cd] bg-[#f0f3ff] hover:bg-[#e7eefe] transition-colors">
                        <Download size={12} />View / Download
                      </a>
                      <button className="p-2 rounded-lg text-[#c7c4d8] hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        onClick={() => setConfirmDel({ id: doc.id, name: doc.name })}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ConfirmModal open={!!confirmDel} title="Delete Document"
        message={`Permanently delete "${confirmDel?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
