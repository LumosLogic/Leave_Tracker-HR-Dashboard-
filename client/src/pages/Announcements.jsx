import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Megaphone, Pin, AlertTriangle, Info, PartyPopper, Bell, Paperclip, Upload, X, FileText, Download, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const TYPE_CFG = {
  general:     { icon: <Megaphone size={15} />,     bg: 'bg-[#f0f3ff]',  text: 'text-[#3525cd]',  border: 'border-[#c7c4d8]',  strip: '#3525cd', label: 'General' },
  urgent:      { icon: <AlertTriangle size={15} />, bg: 'bg-rose-50',    text: 'text-rose-700',   border: 'border-rose-200',   strip: '#EF4444', label: 'Urgent' },
  policy:      { icon: <Info size={15} />,          bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  strip: '#F59E0B', label: 'Policy' },
  celebration: { icon: <PartyPopper size={15} />,   bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',strip: '#10B981', label: 'Celebration' },
};

function AnnouncementModal({ open, onClose, ann }) {
  const toast  = useToast();
  const qc     = useQueryClient();
  const fileRef = useRef(null);
  const isEdit = !!ann;
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(() => isEdit
    ? { title: ann.title, content: ann.content, type: ann.type || 'general', priority: ann.priority || 'normal', target_audience: ann.target_audience || 'all', pinned: !!ann.pinned, expires_at: ann.expires_at || '', file_url: ann.file_url || null, file_name: ann.file_name || null, file_type: ann.file_type || null }
    : { title: '', content: '', type: 'general', priority: 'normal', target_audience: 'all', pinned: false, expires_at: '', file_url: null, file_name: null, file_type: null });

  const mut = useMutation({
    mutationFn: () => isEdit ? apiPut(`/announcements/${ann.id}`, form) : apiPost('/announcements', form),
    onSuccess: () => { toast(isEdit ? 'Updated!' : 'Announcement posted!', 'success'); qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
    onError: e => toast(e.message, 'error'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('lt_token');
      const res = await fetch('/api/announcements/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(f => ({ ...f, file_url: data.file_url, file_name: data.file_name, file_type: data.file_type }));
      toast('Poster / Document uploaded!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Announcement' : 'New Announcement'} size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || uploading || !form.title || !form.content}>
            {mut.isPending ? <><span className="spinner w-4 h-4" />Saving…</> : isEdit ? 'Save Changes' : 'Post Announcement'}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <label className="form-label">Title *</label>
          <input className="form-control" placeholder="Announcement title…" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Content *</label>
          <textarea className="form-control" rows={4} placeholder="Write your announcement…" value={form.content} onChange={e => set('content', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Type</label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(TYPE_CFG).map(([val, cfg]) => (
              <button key={val} type="button" onClick={() => set('type', val)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-[0.65rem] font-bold transition-all ${form.type === val ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'border-[#e7eefe] text-[#777587] hover:border-[#c7c4d8]'}`}>
                {cfg.icon}{cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Poster / Document Upload Section */}
        <div>
          <label className="form-label">Attach Poster or Document <span className="font-normal text-[#777587] normal-case tracking-normal">(Stored in Cloudinary)</span></label>
          <input type="file" ref={fileRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf,.doc,.docx" />
          {form.file_url ? (
            <div className="flex items-center justify-between p-3 bg-[#f0f3ff] border border-[#3525cd]/30 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip size={16} className="text-[#3525cd] flex-shrink-0" />
                <span className="text-xs font-bold text-[#151c27] truncate">{form.file_name || 'Attached Document'}</span>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, file_url: null, file_name: null, file_type: null }))}
                className="p-1 text-[#777587] hover:text-rose-600 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[#c7c4d8] hover:border-[#3525cd] bg-[#f9f9ff] hover:bg-[#f0f3ff] rounded-xl text-xs font-bold text-[#3525cd] transition-all">
              {uploading ? <><span className="spinner w-4 h-4" /> Uploading to Cloudinary…</> : <><Upload size={16} /> Upload Image / PDF / Doc</>}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Audience</label>
            <select className="form-control" value={form.target_audience} onChange={e => set('target_audience', e.target.value)}>
              <option value="all">Everyone</option>
              <option value="employees">Employees Only</option>
              <option value="admins">Admins Only</option>
            </select>
          </div>
          <div>
            <label className="form-label">Expires On <span className="font-normal text-[#777587] normal-case tracking-normal">(optional)</span></label>
            <input type="date" className="form-control" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer rounded-xl border border-[#e7eefe] p-3 hover:bg-[#f9f9ff] transition-colors">
          <div className={`w-10 h-5 rounded-full transition-colors relative ${form.pinned ? 'bg-[#3525cd]' : 'bg-[#c7c4d8]'}`}
            onClick={() => set('pinned', !form.pinned)}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.pinned ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <div>
            <div className="text-sm font-bold text-[#151c27]">Pin this announcement</div>
            <div className="text-xs text-[#777587]">Pinned posts appear at the top</div>
          </div>
        </label>
      </div>
    </Modal>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 7) return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return 'Just now';
}

export default function AnnouncementsPage() {
  const { isAdmin, isEmployee } = useAuth();
  const wrap = isEmployee ? 'p-5 md:p-8 max-w-4xl mx-auto' : '';
  const toast = useToast();
  const qc    = useQueryClient();
  const [addOpen,    setAddOpen]    = useState(false);
  const [editAnn,    setEditAnn]    = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [previewMedia, setPreviewMedia] = useState(null);

  const { data: _annData, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: () => apiGet('/announcements') });
  const announcements = Array.isArray(_annData) ? _annData : [];

  const delMut = useMutation({
    mutationFn: id => apiDelete(`/announcements/${id}`),
    onSuccess: () => { toast('Announcement deleted', 'warning'); qc.invalidateQueries({ queryKey: ['announcements'] }); },
    onError: e => toast(e.message, 'error'),
  });

  const today    = new Date().toISOString().split('T')[0];
  const filtered = filter === 'all' ? announcements : announcements.filter(a => a.type === filter);
  const pinned   = filtered.filter(a => a.pinned);
  const regular  = filtered.filter(a => !a.pinned);

  return (
    <div className={wrap}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-subtitle">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''} · company-wide communications</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} />New Announcement</button>}
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', ...Object.keys(TYPE_CFG)].map(f => {
          const cfg = TYPE_CFG[f];
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition-all flex items-center gap-1.5 ${filter === f ? 'bg-[#3525cd] text-white border-[#3525cd] shadow-sm' : 'bg-white text-[#464555] border-[#c7c4d8] hover:border-[#3525cd]/40'}`}>
              {cfg && <span className={filter === f ? 'text-white' : ''}>{cfg.icon}</span>}
              {f === 'all' ? `All (${announcements.length})` : cfg?.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" />Loading announcements…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Megaphone size={48} className="mx-auto mb-3 text-[#c7c4d8]" />
          <p className="font-semibold text-[#464555] mb-1">No announcements</p>
          <p className="text-sm">{isAdmin ? 'Post your first announcement to keep the team informed' : 'No announcements from management yet'}</p>
          {isAdmin && <button className="btn btn-primary mt-4" onClick={() => setAddOpen(true)}><Plus size={14} />Post Announcement</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pinned section */}
          {pinned.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Pin size={12} className="text-[#3525cd]" />
                <span className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587]">Pinned</span>
              </div>
              {pinned.map(a => <AnnouncementCard key={a.id} a={a} isAdmin={isAdmin} today={today} onEdit={setEditAnn} onDelete={setConfirmDel} onPreview={setPreviewMedia} />)}
              {regular.length > 0 && (
                <div className="flex items-center gap-2 mt-4 mb-2">
                  <span className="text-[0.7rem] font-black uppercase tracking-widest text-[#777587]">Latest</span>
                  <div className="flex-1 h-px bg-[#f0f3ff]" />
                </div>
              )}
            </>
          )}
          {regular.map(a => <AnnouncementCard key={a.id} a={a} isAdmin={isAdmin} today={today} onEdit={setEditAnn} onDelete={setConfirmDel} onPreview={setPreviewMedia} />)}
        </div>
      )}

      {addOpen  && <AnnouncementModal open onClose={() => setAddOpen(false)} />}
      {editAnn  && <AnnouncementModal open onClose={() => setEditAnn(null)} ann={editAnn} />}
      <ConfirmModal open={!!confirmDel} title="Delete Announcement" message={`Delete "${confirmDel?.name}"?`}
        confirmLabel="Delete" onConfirm={() => { delMut.mutate(confirmDel.id); setConfirmDel(null); }} onCancel={() => setConfirmDel(null)} />

      {/* Poster In-Page Lightbox Modal */}
      {previewMedia && (
        <Modal open onClose={() => setPreviewMedia(null)} title={previewMedia.title || 'Announcement Poster'} size="lg"
          footer={
            <div className="flex justify-between items-center w-full">
              <a href={previewMedia.url} download={previewMedia.title || 'poster'} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                <Download size={14} /> Download File
              </a>
              <button className="btn btn-primary btn-sm" onClick={() => setPreviewMedia(null)}>Close Preview</button>
            </div>
          }>
          <div className="flex items-center justify-center bg-[#151c27] rounded-xl p-2 max-h-[70vh] overflow-auto">
            <img src={previewMedia.url} alt={previewMedia.title} className="max-h-[65vh] w-auto object-contain rounded-lg shadow-2xl" />
          </div>
        </Modal>
      )}
    </div>
  );
}

function AnnouncementCard({ a, isAdmin, today, onEdit, onDelete, onPreview }) {
  const cfg     = TYPE_CFG[a.type] || TYPE_CFG.general;
  const expired = a.expires_at && a.expires_at < today;
  const isImage = a.file_url && (a.file_type?.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(a.file_url));

  return (
    <div className={`card overflow-hidden hover:shadow-card-hover transition-all duration-200 ${expired ? 'opacity-60' : ''}`}>
      <div className="h-1 w-full" style={{ background: cfg.strip }} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
            <span className={cfg.text}>{cfg.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                {a.pinned && <Pin size={12} className="text-[#3525cd]" />}
                <h3 className="font-black text-[#151c27]">{a.title}</h3>
                <span className={`badge ${cfg.bg} ${cfg.text} ${cfg.border} border flex items-center gap-1`}>{cfg.icon}{cfg.label}</span>
                {expired && <span className="badge badge-cancelled">Expired</span>}
              </div>
              {isAdmin && (
                <div className="flex gap-1 flex-shrink-0">
                  <button className="btn btn-ghost btn-icon text-[#777587] hover:text-[#3525cd]" onClick={() => onEdit(a)}><Pencil size={13} /></button>
                  <button className="btn btn-ghost btn-icon text-[#777587] hover:text-rose-500" onClick={() => onDelete({ id: a.id, name: a.title })}><Trash2 size={13} /></button>
                </div>
              )}
            </div>
            <p className="text-sm text-[#464555] whitespace-pre-wrap leading-relaxed mb-3">{a.content}</p>

            {/* Attached Poster or Document Display */}
            {a.file_url && (
              <div className="mb-3">
                {isImage ? (
                  <div className="rounded-xl overflow-hidden border border-[#c7c4d8] max-w-lg">
                    <button type="button" onClick={() => onPreview({ url: a.file_url, title: a.title })} className="block w-full text-left relative group cursor-pointer">
                      <img src={a.file_url} alt={a.file_name || 'Poster'} className="w-full max-h-96 object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-bold">
                        <ExternalLink size={16} /> Click to View Poster
                      </div>
                    </button>
                  </div>
                ) : (
                  <a href={a.file_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 px-4 py-2 bg-[#f0f3ff] hover:bg-[#e0e7ff] border border-[#3525cd]/30 rounded-xl text-xs font-bold text-[#3525cd] transition-all">
                    <FileText size={16} />
                    <span>{a.file_name || 'View Attachment Document'}</span>
                    <Download size={14} className="ml-1" />
                  </a>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-[#777587]">
              <span className="font-semibold">{a.creator_name || 'Admin'}</span>
              <span>·</span>
              <span>{timeAgo(a.created_at)}</span>
              {a.expires_at && <><span>·</span><span>Expires {a.expires_at}</span></>}
              <span className="ml-auto badge badge-cancelled capitalize">{a.target_audience}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


