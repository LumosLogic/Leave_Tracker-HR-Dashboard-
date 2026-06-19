import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiPost } from '@/lib/api';

export default function ResetPassword() {
  const [searchParams]          = useSearchParams();
  const token                   = searchParams.get('token') || '';
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showCfm,   setShowCfm]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await apiPost('/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen grid md:grid-cols-2 bg-[#f9f9ff] overflow-hidden">

      {/* Left brand panel */}
      <div className="hidden md:flex flex-col justify-center px-12 py-8 relative overflow-hidden bg-[#3525cd]">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#3525cd]/80 via-[#712ae2]/40 to-[#3525cd]/90 pointer-events-none" />
        <div className="relative z-10 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-7 h-7" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">LeaveTracker</span>
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-[-0.04em] text-white mb-4">
            Create a new<br />
            <span className="opacity-80">secure</span><br />
            <em className="not-italic text-white/90">password.</em>
          </h1>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm">
            Choose a strong password that is at least 6 characters long. You'll use this to sign in to your HR Tracker account.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-8 md:px-16 py-10 bg-white relative overflow-y-auto border-l border-[#c7c4d8]">
        <div className="w-full max-w-sm relative z-10">

          {/* Mobile branding */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-8 h-8 rounded-lg bg-[#3525cd] flex items-center justify-center flex-shrink-0">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-5 h-5" />
            </div>
            <span className="text-base font-black text-[#3525cd]">LeaveTracker</span>
          </div>

          {!token ? (
            /* No token — invalid URL */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={32} className="text-amber-600" />
              </div>
              <h2 className="text-xl font-black text-[#151c27] tracking-tight mb-3">Invalid Reset Link</h2>
              <p className="text-sm text-[#464555] mb-6">
                This reset link is invalid or missing. Please request a new one.
              </p>
              <Link to="/forgot-password"
                className="inline-block px-6 py-3 bg-[#3525cd] text-white font-bold text-sm rounded-xl hover:bg-[#4f46e5] transition-all">
                Request New Link
              </Link>
            </div>
          ) : success ? (
            /* Success state */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-[#151c27] tracking-tight mb-3">Password Updated!</h2>
              <p className="text-sm text-[#464555] leading-relaxed mb-8">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#3525cd] text-white font-bold text-sm rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20">
                Go to Login
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-9">
                <h2 className="text-[2rem] font-black text-[#151c27] tracking-[-0.04em] leading-tight mb-2">
                  Set New Password
                </h2>
                <p className="text-sm text-[#464555]">Enter and confirm your new password below.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} className="form-control pr-12" required
                      placeholder="Min. 6 characters" value={password} autoFocus
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27] p-1">
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="form-label">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showCfm ? 'text' : 'password'} className="form-control pr-12" required
                      placeholder="Re-enter your password" value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowCfm(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27] p-1">
                      {showCfm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-[0.83rem] text-rose-700 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 bg-[#3525cd] text-white font-bold text-base rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="spinner w-4 h-4" /> Updating…
                    </span>
                  ) : 'Update Password'}
                </button>
              </form>

              <div className="flex items-center justify-center mt-6">
                <Link to="/login"
                  className="flex items-center gap-1.5 text-sm text-[#464555] hover:text-[#3525cd] transition-colors">
                  <ArrowLeft size={15} /> Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
