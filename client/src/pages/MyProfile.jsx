import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { UserCircle, Lock, Save, Eye, EyeOff, Check, Building2, Briefcase, Mail, ShieldCheck, ShieldAlert, Trash2, AlertTriangle } from 'lucide-react';
import { apiPut, apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { initials } from '@/lib/utils';

const AVATAR_COLORS = [
  '#3525cd','#4f46e5','#712ae2','#8a4cfc','#10B981','#EC4899',
  '#F59E0B','#EF4444','#F97316','#2a313d','#065F46','#7F1D1D',
];

export default function MyProfile() {
  const { user, saveAuth, token } = useAuth();
  const toast = useToast();

  const [name,  setName]  = useState(user?.name  || '');
  const [email, setEmail] = useState(user?.email || '');
  const [color, setColor] = useState(user?.avatar_color || '#3525cd');

  const [curPw,  setCurPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Email verification modal state
  const [verifyModal, setVerifyModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [delModal, setDelModal] = useState(false);
  const [delReason, setDelReason] = useState('');

  // Fetch multi-department info for employees
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

  const saveProfile = useMutation({
    mutationFn: () => apiPut('/auth/profile', { name, avatar_color: color, email }),
    onSuccess: (data) => {
      saveAuth(token, { ...user, name: data.name, avatar_color: data.avatar_color, email: data.email });
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
    onSuccess: (data) => {
      toast(data.message || 'Verification code sent to your email.', 'info');
      setVerifyModal(true);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const submitVerify = useMutation({
    mutationFn: () => apiPost('/auth/verify-email', { code: verifyCode }),
    onSuccess: (data) => {
      toast(data.message || 'Email verified successfully!', 'success');
      saveAuth(token, { ...user, email_verified: true });
      setVerifyModal(false); setVerifyCode('');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const deactivateAcc = useMutation({
    mutationFn: () => apiPost('/auth/deactivate', {}),
    onSuccess: () => {
      toast('Account deactivated successfully.', 'warning');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const requestDel = useMutation({
    mutationFn: () => apiPost('/auth/request-deletion', { reason: delReason }),
    onSuccess: (data) => {
      toast(data.message || 'Deletion request submitted to HR.', 'success');
      setDelModal(false); setDelReason('');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  function handlePwSubmit() {
    if (newPw !== confPw) { toast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
    changePw.mutate();
  }

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-black text-[#151c27] tracking-tight">My Profile</h1>
        <p className="text-[#777587] text-sm mt-0.5">Manage your personal information, security and privacy settings.</p>
      </div>

      {/* Account Info — email editable */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2">
            <UserCircle size={15} className="text-[#3525cd]" /> Account Info
          </h2>
          {user?.email_verified ? (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              <ShieldCheck size={13} /> Email Verified
            </span>
          ) : (
            <button onClick={() => sendVerifyCode.mutate()} disabled={sendVerifyCode.isPending}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-bold hover:bg-amber-100 transition-colors">
              <ShieldAlert size={13} /> {sendVerifyCode.isPending ? 'Sending…' : 'Verify Email'}
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-[#3525cd]" /> Email Address</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            <p className="text-[0.7rem] text-[#777587] mt-1">Changing your email will update your login credentials.</p>
          </div>
          <div className="flex items-start gap-3 py-2.5 border-t border-[#f0f3ff]">
            <div className="w-8 h-8 bg-[#f0f3ff] rounded-lg flex items-center justify-center text-[#464555] flex-shrink-0 mt-0.5">
              <Building2 size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#777587]">Department{myDepts.length > 1 ? 's' : ''}</p>
              {myDepts.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {myDepts.map(d => (
                    <span key={d.id} className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
                      {d.name}{d.role && d.role !== 'Member' ? ` · ${d.role}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold text-[#151c27]">{user?.department || '—'}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 py-2.5 border-t border-[#f0f3ff]">
            <div className="w-8 h-8 bg-[#f0f3ff] rounded-lg flex items-center justify-center text-[#464555] flex-shrink-0">
              <Briefcase size={15} />
            </div>
            <div>
              <p className="text-xs text-[#777587]">Position</p>
              <p className="text-sm font-semibold text-[#151c27]">{user?.position || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Editable profile */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-5">
          <UserCircle size={15} className="text-[#3525cd]" /> Display Settings
        </h2>

        {/* Avatar preview */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0 shadow-md"
            style={{ background: color }}>
            {initials(name || user?.name || '')}
          </div>
          <div>
            <p className="text-sm font-bold text-[#151c27]">{name || user?.name}</p>
            <p className="text-xs text-[#777587] mt-0.5">Click a color to change your avatar</p>
          </div>
        </div>

        {/* Color picker */}
        <div className="mb-5">
          <label className="form-label mb-2">Avatar Color</label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset:'1px' }} />
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="mb-5">
          <label className="form-label">Display Name</label>
          <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
        </div>

        <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !name.trim()}
          className="btn btn-primary btn-sm flex items-center gap-2">
          {saveProfile.isPending ? <><span className="spinner w-3.5 h-3.5" /> Saving…</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-card border border-[#c7c4d8] p-6">
        <h2 className="text-sm font-black text-[#151c27] uppercase tracking-wider flex items-center gap-2 mb-5">
          <Lock size={15} className="text-[#3525cd]" /> Change Password
        </h2>

        <div className="space-y-4">
          <div>
            <label className="form-label">Current Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showCur ? 'text' : 'password'} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowCur(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input className="form-control pr-10" type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters" />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Confirm New Password</label>
            <input className="form-control" type="password" value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Repeat new password" />
          </div>

          {newPw && confPw && newPw !== confPw && (
            <p className="text-xs text-rose-600 flex items-center gap-1">Passwords do not match.</p>
          )}

          <button onClick={handlePwSubmit} disabled={changePw.isPending || !curPw || !newPw || !confPw}
            className="btn btn-primary btn-sm flex items-center gap-2">
            {changePw.isPending ? <><span className="spinner w-3.5 h-3.5" /> Updating…</> : <><Check size={14} /> Update Password</>}
          </button>
        </div>
      </div>

      {/* Account Privacy & GDPR Controls */}
      <div className="bg-white rounded-xl shadow-card border border-rose-200 p-6">
        <h2 className="text-sm font-black text-rose-700 uppercase tracking-wider flex items-center gap-2 mb-2">
          <AlertTriangle size={15} className="text-rose-600" /> Account Controls & Privacy (GDPR)
        </h2>
        <p className="text-xs text-[#777587] mb-4">Manage your account deactivation or submit a GDPR Right to be Forgotten deletion request.</p>

        <div className="flex gap-3 flex-wrap">
          <button onClick={() => deactivateAcc.mutate()} disabled={deactivateAcc.isPending}
            className="btn btn-outline btn-sm border-amber-300 text-amber-800 hover:bg-amber-50">
            {deactivateAcc.isPending ? 'Deactivating…' : 'Deactivate Account'}
          </button>
          <button onClick={() => setDelModal(true)}
            className="btn btn-danger btn-sm flex items-center gap-1.5">
            <Trash2 size={13} /> Request Account Deletion (GDPR)
          </button>
        </div>
      </div>

      {/* Verification Code Modal */}
      <Modal open={verifyModal} onClose={() => setVerifyModal(false)} title="Enter Email Verification Code"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setVerifyModal(false)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => submitVerify.mutate()} disabled={submitVerify.isPending || verifyCode.length < 6} className="btn btn-primary btn-sm">
              {submitVerify.isPending ? 'Verifying…' : 'Verify Now'}
            </button>
          </div>
        }
      >
        <p className="text-xs text-[#777587] mb-3">Please enter the 6-digit verification code sent to <strong>{user?.email}</strong>.</p>
        <input className="form-control tracking-widest text-center text-lg font-black" maxLength={6} placeholder="123456" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} />
      </Modal>

      {/* GDPR Deletion Request Modal */}
      <Modal open={delModal} onClose={() => setDelModal(false)} title="Request Account Deletion (GDPR)"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDelModal(false)} className="btn btn-outline btn-sm">Cancel</button>
            <button onClick={() => requestDel.mutate()} disabled={requestDel.isPending} className="btn btn-danger btn-sm">
              {requestDel.isPending ? 'Submitting…' : 'Submit Deletion Request'}
            </button>
          </div>
        }
      >
        <p className="text-xs text-[#777587] mb-3">Under GDPR Right to be Forgotten, you can request permanent deletion of your profile and data. HR will review your request.</p>
        <label className="form-label">Reason for deletion (optional)</label>
        <textarea className="form-control text-xs" rows={3} placeholder="Provide a reason..." value={delReason} onChange={e => setDelReason(e.target.value)} />
      </Modal>
    </div>
  );
}

