import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  UserCircle, Lock, Save, Eye, EyeOff, Check, Building2, Briefcase, Mail,
  ShieldCheck, ShieldAlert, Trash2, AlertTriangle, Upload, User, Camera,
  Calendar, Shield, Hash, Clock,
} from 'lucide-react';
import { apiPut, apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { initials } from '@/lib/utils';

const AVATAR_COLORS = [
  '#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#EC4899',
  '#F59E0B','#EF4444','#F97316','#2a313d','#065F46','#7F1D1D',
];

// ── Password strength scorer ──────────────────────────────────────────────────
function getPasswordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const colors  = ['#ef4444',  '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { score, label: labels[score] || 'Very Weak', color: colors[score] || '#ef4444', pct: Math.round((score / 5) * 100) };
}

function StrengthBar({ password }) {
  const s = getPasswordStrength(password);
  if (!s) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1.5 bg-[#f0f3ff] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${s.pct}%`, background: s.color }} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-semibold" style={{ color: s.color }}>{s.label}</p>
        <p className="text-[0.6rem] text-[#9ca3af]">
          {[pw => pw.length >= 8, pw => /[A-Z]/.test(pw), pw => /[0-9]/.test(pw), pw => /[^A-Za-z0-9]/.test(pw)]
            .filter(f => !f(password)).length === 0 ? '✓ All requirements met' : 'Use 8+ chars, uppercase, number, symbol'}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#f0f3ff] last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[#f0f3ff] flex items-center justify-center shrink-0">
        <Icon size={13} className="text-[#3525cd]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[0.68rem] text-[#777587] font-medium">{label}</p>
        <p className="text-sm font-semibold text-[#151c27] truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function MyProfile() {
  const { user, saveAuth, token } = useAuth();
  const toast      = useToast();
  const avatarRef  = useRef(null);

  const [name,     setName]     = useState(user?.name  || '');
  const [email,    setEmail]    = useState(user?.email || '');
  const [color,    setColor]    = useState(user?.avatar_color || '#3525cd');
  const [photoUrl, setPhotoUrl] = useState(user?.avatar_url || '');
  const [uploading, setUploading] = useState(false);

  const [curPw,   setCurPw]   = useState('');
  const [newPw,   setNewPw]   = useState('');
  const [confPw,  setConfPw]  = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const [verifyModal, setVerifyModal] = useState(false);
  const [verifyCode,  setVerifyCode]  = useState('');
  const [delModal,    setDelModal]    = useState(false);
  const [delReason,   setDelReason]   = useState('');

  const { data: myDepts = [] } = useQuery({
    queryKey: ['my-departments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const all = await apiGet('/employees');
      const me  = all.find(e => e.id === user.id);
      return me?.departments || [];
    },
    enabled: !!user?.id,
  });

  // ── Avatar photo upload ───────────────────────────────────────────────────────
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Max file size is 5 MB', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token_ = localStorage.getItem('lt_token');
      const res  = await fetch('/api/auth/upload-avatar', { method: 'POST', headers: { Authorization: `Bearer ${token_}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPhotoUrl(data.avatar_url);
      saveAuth(token, { ...user, avatar_url: data.avatar_url });
      toast('Profile photo updated!', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setUploading(false); if (avatarRef.current) avatarRef.current.value = ''; }
  }

  const saveProfile = useMutation({
    mutationFn: () => apiPut('/auth/profile', { name, avatar_color: color, email, avatar_url: photoUrl }),
    onSuccess: (data) => {
      saveAuth(token, { ...user, name: data.name, avatar_color: data.avatar_color, email: data.email, avatar_url: data.avatar_url });
      toast('Profile updated.', 'success');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const changePw = useMutation({
    mutationFn: () => apiPut('/auth/change-password', { currentPassword: curPw, newPassword: newPw }),
    onSuccess: () => {
      toast('Password changed successfully.', 'success');
      setCurPw(''); setNewPw(''); setConfPw('');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const sendVerifyCode = useMutation({
    mutationFn: () => apiPost('/auth/send-verification', {}),
    onSuccess: (data) => { toast(data.message || 'Code sent.', 'info'); setVerifyModal(true); },
    onError:   (e)    => toast(e.message, 'error'),
  });

  const submitVerify = useMutation({
    mutationFn: () => apiPost('/auth/verify-email', { code: verifyCode }),
    onSuccess: (data) => {
      toast(data.message || 'Email verified!', 'success');
      saveAuth(token, { ...user, email_verified: true });
      setVerifyModal(false); setVerifyCode('');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const deactivateAcc = useMutation({
    mutationFn: () => apiPost('/auth/deactivate', {}),
    onSuccess: () => toast('Account deactivated.', 'warning'),
    onError:   (e) => toast(e.message, 'error'),
  });

  const requestDel = useMutation({
    mutationFn: () => apiPost('/auth/request-deletion', { reason: delReason }),
    onSuccess: (data) => { toast(data.message || 'Request submitted.', 'success'); setDelModal(false); setDelReason(''); },
    onError:   (e)    => toast(e.message, 'error'),
  });

  function handlePwSubmit() {
    if (newPw !== confPw) { toast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 8) { toast('Password must be at least 8 characters.', 'error'); return; }
    const s = getPasswordStrength(newPw);
    if (s && s.score < 2) { toast('Please choose a stronger password.', 'warning'); return; }
    changePw.mutate();
  }

  const roleLabel = { root_admin: 'Root Administrator', admin: 'HR Admin', employee: 'Employee' }[user?.role] || user?.role;
  const joined    = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="page-header mb-2">
        <div>
          <div className="page-title">Account Settings</div>
          <div className="page-subtitle">Manage your profile, security and privacy settings</div>
        </div>
      </div>

      {/* ─── PROFILE CARD ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-6">
        <h2 className="text-xs font-black text-[#777587] uppercase tracking-wider flex items-center gap-2 mb-5">
          <User size={13} className="text-[#3525cd]" /> Profile Information
        </h2>

        {/* Avatar + photo upload */}
        <div className="flex items-start gap-5 mb-6">
          <div className="relative shrink-0 group">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black text-white shadow-md border-4 border-white"
                style={{ background: color }}>
                {initials(name || user?.name || '')}
              </div>
            )}
            <button
              onClick={() => avatarRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#3525cd] text-white flex items-center justify-center shadow-md hover:bg-[#4f46e5] transition-colors border-2 border-white disabled:opacity-60">
              {uploading ? <span className="spinner w-3 h-3" /> : <Camera size={12} />}
            </button>
            <input ref={avatarRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-[#151c27]">{user?.name}</p>
            <p className="text-xs text-[#777587]">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">{roleLabel}</span>
              {user?.employee_id && <span className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">ID: {user.employee_id}</span>}
              {user?.email_verified ? (
                <span className="flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  <ShieldCheck size={10} /> Verified
                </span>
              ) : (
                <button onClick={() => sendVerifyCode.mutate()} disabled={sendVerifyCode.isPending}
                  className="flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-bold hover:bg-amber-100 transition-colors">
                  <ShieldAlert size={10} /> {sendVerifyCode.isPending ? 'Sending…' : 'Verify Email'}
                </button>
              )}
            </div>
            <p className="text-[0.65rem] text-[#9ca3af] mt-1.5">Click the camera icon to update your profile photo</p>
          </div>
        </div>

        {/* Account details */}
        <div className="border border-[#f0f3ff] rounded-xl divide-y divide-[#f0f3ff] mb-5">
          {user?.employee_id && <InfoRow icon={Hash} label="Employee ID" value={user.employee_id} />}
          <InfoRow icon={Shield} label="Role" value={roleLabel} />
          <InfoRow icon={Building2} label="Department" value={
            myDepts.length > 0 ? myDepts.map(d => d.name).join(', ') : user?.department
          } />
          <InfoRow icon={Briefcase} label="Position" value={user?.position} />
          {joined && <InfoRow icon={Calendar} label="Member Since" value={joined} />}
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="form-label">Display Name</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div>
            <label className="form-label flex items-center gap-1.5"><Mail size={12} /> Email Address</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>

        {/* Avatar color */}
        <div className="mb-5">
          <label className="form-label mb-2">Avatar Colour <span className="text-xs font-normal text-[#777587]">(used when no photo)</span></label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '1px' }} />
            ))}
          </div>
        </div>

        <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !name.trim()}
          className="btn btn-primary flex items-center gap-2">
          {saveProfile.isPending ? <><span className="spinner w-4 h-4" /> Saving…</> : <><Save size={14} /> Save Profile</>}
        </button>
      </div>

      {/* ─── CHANGE PASSWORD ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-6">
        <h2 className="text-xs font-black text-[#777587] uppercase tracking-wider flex items-center gap-2 mb-5">
          <Lock size={13} className="text-[#3525cd]" /> Security — Change Password
        </h2>

        <div className="space-y-4">
          {/* Current password */}
          <div>
            <label className="form-label">Current Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowCur(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* New password + strength */}
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 8 characters" />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <StrengthBar password={newPw} />
          </div>

          {/* Confirm password */}
          <div>
            <label className="form-label">Confirm New Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showConf ? 'text' : 'password'} value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Repeat new password" />
              <button type="button" onClick={() => setShowConf(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {newPw && confPw && newPw !== confPw && (
              <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">✗ Passwords do not match</p>
            )}
            {newPw && confPw && newPw === confPw && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">✓ Passwords match</p>
            )}
          </div>

          {/* Password requirements */}
          {newPw && (
            <div className="grid grid-cols-2 gap-1.5 p-3 bg-[#f9f9ff] rounded-xl border border-[#f0f3ff]">
              {[
                { label: '8+ characters',     ok: newPw.length >= 8 },
                { label: 'Uppercase letter',  ok: /[A-Z]/.test(newPw) },
                { label: 'Number',            ok: /[0-9]/.test(newPw) },
                { label: 'Special character', ok: /[^A-Za-z0-9]/.test(newPw) },
              ].map(r => (
                <div key={r.label} className={`flex items-center gap-1.5 text-[0.65rem] font-semibold ${r.ok ? 'text-emerald-700' : 'text-[#9ca3af]'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[0.5rem] ${r.ok ? 'bg-emerald-100' : 'bg-[#f0f3ff]'}`}>
                    {r.ok ? '✓' : '○'}
                  </span>
                  {r.label}
                </div>
              ))}
            </div>
          )}

          <button onClick={handlePwSubmit} disabled={changePw.isPending || !curPw || !newPw || !confPw || newPw !== confPw}
            className="btn btn-primary flex items-center gap-2">
            {changePw.isPending ? <><span className="spinner w-4 h-4" /> Updating…</> : <><Check size={14} /> Update Password</>}
          </button>
        </div>
      </div>

      {/* ─── GDPR / Account Controls ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-6">
        <h2 className="text-xs font-black text-rose-700 uppercase tracking-wider flex items-center gap-2 mb-2">
          <AlertTriangle size={13} className="text-rose-600" /> Account Controls & Privacy (GDPR)
        </h2>
        <p className="text-xs text-[#777587] mb-4">Manage account deactivation or submit a GDPR Right to be Forgotten request. HR will review these requests.</p>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => deactivateAcc.mutate()} disabled={deactivateAcc.isPending}
            className="btn btn-outline btn-sm border-amber-300 text-amber-800 hover:bg-amber-50">
            {deactivateAcc.isPending ? 'Deactivating…' : 'Deactivate Account'}
          </button>
          <button onClick={() => setDelModal(true)}
            className="btn btn-danger btn-sm flex items-center gap-1.5">
            <Trash2 size={13} /> Request Account Deletion
          </button>
        </div>
      </div>

      {/* Modals */}
      <Modal open={verifyModal} onClose={() => setVerifyModal(false)} title="Enter Email Verification Code"
        footer={<div className="flex gap-2 justify-end">
          <button onClick={() => setVerifyModal(false)} className="btn btn-outline btn-sm">Cancel</button>
          <button onClick={() => submitVerify.mutate()} disabled={submitVerify.isPending || verifyCode.length < 6} className="btn btn-primary btn-sm">
            {submitVerify.isPending ? 'Verifying…' : 'Verify Now'}
          </button>
        </div>}>
        <p className="text-xs text-[#777587] mb-3">Enter the 6-digit code sent to <strong>{user?.email}</strong>.</p>
        <input className="form-control tracking-widest text-center text-lg font-black" maxLength={6} placeholder="123456"
          value={verifyCode} onChange={e => setVerifyCode(e.target.value)} />
      </Modal>

      <Modal open={delModal} onClose={() => setDelModal(false)} title="Request Account Deletion (GDPR)"
        footer={<div className="flex gap-2 justify-end">
          <button onClick={() => setDelModal(false)} className="btn btn-outline btn-sm">Cancel</button>
          <button onClick={() => requestDel.mutate()} disabled={requestDel.isPending} className="btn btn-danger btn-sm">
            {requestDel.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>}>
        <p className="text-xs text-[#777587] mb-3">Under GDPR Right to be Forgotten, you can request permanent deletion of your data. HR will review your request.</p>
        <label className="form-label">Reason (optional)</label>
        <textarea className="form-control text-xs" rows={3} placeholder="Provide a reason..." value={delReason} onChange={e => setDelReason(e.target.value)} />
      </Modal>
    </div>
  );
}
