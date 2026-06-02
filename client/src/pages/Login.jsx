import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Zap, ClipboardList, BarChart2, Lock, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';

export default function Login() {
  const { saveAuth } = useAuth();
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [orgSlug,  setOrgSlug]  = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { email, password };
      if (orgSlug.trim()) payload.org_slug = orgSlug.trim().toLowerCase();
      const { token, user } = await apiPost('/auth/login', payload);
      saveAuth(token, user);
      // Navigate directly to the correct portal — no redirect chain
      if (user.role === 'root_admin') navigate('/root/dashboard');
      else if (user.role === 'employee') navigate('/portal/home');
      else navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen grid md:grid-cols-2 bg-[#f9f9ff] overflow-hidden">

      {/* Left brand panel */}
      <div className="hidden md:flex flex-col justify-center px-12 py-8 relative overflow-hidden bg-[#3525cd]">

        {/* Subtle grid texture */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#3525cd]/80 via-[#712ae2]/40 to-[#3525cd]/90 pointer-events-none" />

        <div className="relative z-10 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-7 h-7" />
            </div>
            <span className="text-white font-black text-lg tracking-tight">LeaveTracker</span>
          </div>

          <h1 className="text-4xl font-black leading-tight tracking-[-0.04em] text-white mb-4">
            Elevating Human<br />
            <span className="opacity-80">Resources with</span><br />
            <em className="not-italic text-white/90">Precision.</em>
          </h1>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm mb-7">
            Experience the next generation of attendance tracking, leave management, and employee engagement in one seamless platform.
          </p>

          <div className="flex flex-col gap-3 mb-7">
            {[
              { icon: <Zap size={18} />,           title: 'Real-time Attendance',    desc: 'Clock-in/out with live status across your entire org' },
              { icon: <ClipboardList size={18} />, title: 'Smart Leave Management', desc: 'Multi-type leave workflows with instant approvals' },
              { icon: <BarChart2 size={18} />,     title: 'Analytics Dashboard',    desc: 'Beautiful charts & insights to drive HR decisions' },
              { icon: <Lock size={18} />,          title: 'Enterprise Security',    desc: 'Role-based access control with JWT authentication' },
            ].map(f => (
              <div key={f.title} className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(10px)' }}>
                  {f.icon}
                </div>
                <div>
                  <strong className="block text-white text-sm font-bold">{f.title}</strong>
                  <span className="text-white/70 text-xs">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            {[['99.9%','Uptime'],['2M+','Active Users'],['24/7','Support']].map(([v, l]) => (
              <div key={l} className="flex-1 rounded-xl text-center py-3.5 px-4"
                style={{ background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.2)', backdropFilter: 'blur(20px)' }}>
                <div className="text-2xl font-black text-white tracking-tight">{v}</div>
                <div className="text-[0.7rem] text-white/65 mt-1 uppercase tracking-widest font-semibold">{l}</div>
              </div>
            ))}
          </div>
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

          <div className="mb-9">
            <h2 className="text-[2rem] font-black text-[#151c27] tracking-[-0.04em] leading-tight mb-2">
              Welcome back
            </h2>
            <p className="text-sm text-[#464555]">Please enter your credentials to access the Management Console.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Organization Slug <span className="text-[#777587] font-normal">(optional)</span></label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777587]" />
                <input
                  type="text" className="form-control pl-9"
                  placeholder="e.g. lumoslogic (leave blank if only 1 org)"
                  value={orgSlug}
                  onChange={e => setOrgSlug(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email" className="form-control" required autoComplete="email"
                placeholder="name@company.com" value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} className="form-control pr-12" required
                  placeholder="••••••••" value={password} autoComplete="current-password"
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27] p-1"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[0.83rem] text-rose-700 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#3525cd] text-white font-bold text-base rounded-xl hover:bg-[#4f46e5] transition-all shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="spinner w-4 h-4" /> Signing in…
                </span>
              ) : 'Login to Console'}
            </button>
          </form>

          <p className="text-center text-sm text-[#464555] mt-6">
            New company?{' '}
            <Link to="/register" className="text-[#3525cd] font-bold hover:underline">
              Create your organization →
            </Link>
          </p>

          <p className="text-center text-[0.72rem] text-[#777587] mt-3">
            LeaveTracker — Multi-Tenant HR Management
          </p>
        </div>
      </div>
    </div>
  );
}
