import React, { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { apiPut } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function ForcePasswordChangeModal() {
  const { user, saveAuth, token } = useAuth();
  const [curPw,   setCurPw]   = useState('');
  const [newPw,   setNewPw]   = useState('');
  const [confPw,  setConfPw]  = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  if (!user?.force_password_change) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPw !== confPw) { setError('New passwords do not match'); return; }
    if (newPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError('');
    try {
      await apiPut('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
      saveAuth(token, { ...user, force_password_change: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(12px)' }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-[#c7c4d8] w-full max-w-sm p-6">
        <div className="w-12 h-12 rounded-2xl bg-[#3525cd]/10 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={24} className="text-[#3525cd]" />
        </div>
        <h2 className="text-xl font-black text-[#151c27] text-center mb-1">Set Your Password</h2>
        <p className="text-sm text-[#777587] text-center mb-6">
          For your security, please set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Current / Temporary Password</label>
            <div className="relative">
              <input
                type={showCur ? 'text' : 'password'}
                className="form-control pr-10"
                value={curPw}
                onChange={e => setCurPw(e.target.value)}
                required
                placeholder="Your temporary password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCur(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]"
              >
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="form-control pr-10"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                placeholder="Min. 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27]"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-control"
              value={confPw}
              onChange={e => setConfPw(e.target.value)}
              required
              placeholder="Repeat new password"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !curPw || !newPw || !confPw}
            className="w-full btn btn-primary py-3.5"
          >
            {loading
              ? <span className="flex items-center gap-2 justify-center"><span className="spinner w-4 h-4" /> Setting password…</span>
              : 'Set New Password'
            }
          </button>
        </form>
      </div>
    </div>
  );
}
