import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart2, ClipboardList, Users, ShieldCheck, Bell, Globe,
  CalendarDays, Zap, CheckCircle2, ArrowRight, Menu, X,
  Star, TrendingUp, Clock, Building2, ChevronRight
} from 'lucide-react';

const BRAND = '#3525cd';

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#stats', label: 'Why Us' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-[#c7c4d8]/50' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-8 h-8 flex-shrink-0" />
          <span className="font-black text-[#151c27] text-base tracking-tight">LeaveTracker</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-sm font-semibold text-[#464555] hover:text-[#3525cd] transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm font-bold text-[#464555] hover:text-[#3525cd] px-4 py-2 transition-colors">
            Sign In
          </Link>
          <Link to="/register" className="text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-[#3525cd]/20 hover:shadow-xl hover:shadow-[#3525cd]/30 hover:-translate-y-0.5"
            style={{ background: BRAND }}>
            Get Started Free
          </Link>
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2 rounded-lg text-[#464555]" onClick={() => setOpen(o => !o)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-b border-[#c7c4d8] px-6 pb-4 space-y-2">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="block py-2 text-sm font-semibold text-[#464555]">{l.label}</a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/login" className="text-center py-2.5 text-sm font-bold text-[#3525cd] border border-[#3525cd] rounded-xl">Sign In</Link>
            <Link to="/register" className="text-center py-2.5 text-sm font-bold text-white rounded-xl" style={{ background: BRAND }}>Get Started Free</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative pt-32 pb-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#f9f9ff]" />
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(rgba(53,37,205,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(53,37,205,.04) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #3525cd 0%, transparent 70%)' }} />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-8 border"
            style={{ background: 'rgba(53,37,205,.07)', color: BRAND, borderColor: 'rgba(53,37,205,.2)' }}>
            <Zap size={12} />
            Multi-Tenant HR Platform
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-[-0.04em] text-[#151c27] leading-[1.05] mb-6">
            HR Management<br />
            <span style={{ background: 'linear-gradient(135deg, #3525cd, #712ae2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Built for Teams
            </span>{' '}
            <span className="text-[#151c27]">that Scale</span>
          </h1>

          <p className="text-lg md:text-xl text-[#464555] leading-relaxed max-w-2xl mx-auto mb-10">
            Streamline attendance tracking, leave management, and team analytics in one beautiful dashboard. Trusted by growing organizations across India.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link to="/register"
              className="flex items-center gap-2 px-8 py-4 text-base font-bold text-white rounded-2xl shadow-xl hover:-translate-y-1 transition-all duration-200 w-full sm:w-auto justify-center"
              style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)', boxShadow: '0 8px 32px rgba(53,37,205,.35)' }}>
              Start for Free <ArrowRight size={18} />
            </Link>
            <Link to="/login"
              className="flex items-center gap-2 px-8 py-4 text-base font-bold text-[#3525cd] rounded-2xl border-2 border-[#3525cd]/30 hover:border-[#3525cd] hover:bg-[#3525cd]/5 transition-all w-full sm:w-auto justify-center">
              Sign In to Dashboard
            </Link>
          </div>

          {/* Dashboard Preview Card */}
          <div className="relative mx-auto max-w-5xl">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-[#c7c4d8]/60"
              style={{ boxShadow: '0 40px 80px rgba(53,37,205,.15), 0 0 0 1px rgba(53,37,205,.08)' }}>
              {/* Mock browser bar */}
              <div className="bg-white border-b border-[#e7eefe] px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-3 bg-[#f0f3ff] rounded-lg px-3 py-1 text-xs text-[#777587] font-mono text-left">
                  hrms.lumoslogic.com/dashboard
                </div>
              </div>
              {/* Dashboard mockup */}
              <div className="bg-[#f9f9ff] p-6 grid grid-cols-4 gap-4 min-h-[280px]">
                {/* Sidebar mock */}
                <div className="col-span-1 bg-white rounded-xl border border-[#e7eefe] p-3 space-y-2">
                  <div className="h-8 bg-[#f0f3ff] rounded-lg flex items-center px-3 gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: BRAND }} />
                    <div className="h-2 bg-[#3525cd]/30 rounded flex-1" />
                  </div>
                  {[0.7, 0.5, 0.6, 0.4, 0.5].map((w, i) => (
                    <div key={i} className="h-7 rounded-lg bg-[#f9f9ff] flex items-center px-3 gap-2">
                      <div className="w-3 h-3 rounded-sm bg-[#c7c4d8]" />
                      <div className="h-2 bg-[#c7c4d8]/60 rounded" style={{ width: `${w * 100}%` }} />
                    </div>
                  ))}
                </div>
                {/* Content mock */}
                <div className="col-span-3 space-y-4">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Employees', val: '24', color: '#3525cd' },
                      { label: 'Present', val: '18', color: '#059669' },
                      { label: 'Pending Leaves', val: '3', color: '#d97706' },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl border border-[#e7eefe] p-3">
                        <div className="text-2xl font-black mb-1" style={{ color: s.color }}>{s.val}</div>
                        <div className="text-xs text-[#777587] font-medium">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Chart mock */}
                  <div className="bg-white rounded-xl border border-[#e7eefe] p-4 flex items-end gap-2" style={{ height: 120 }}>
                    {[60, 80, 45, 90, 70, 85, 55, 95, 65, 75, 88, 72].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-sm transition-all"
                        style={{ height: `${h}%`, background: i === 8 ? BRAND : `rgba(53,37,205,${0.15 + i * 0.015})` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <div className="absolute -left-6 top-1/3 bg-white rounded-2xl shadow-xl border border-[#e7eefe] px-4 py-3 hidden lg:flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(53,37,205,.1)' }}>
                <CheckCircle2 size={18} style={{ color: BRAND }} />
              </div>
              <div>
                <p className="text-xs font-black text-[#151c27]">Leave Approved</p>
                <p className="text-[0.68rem] text-[#777587]">2 minutes ago</p>
              </div>
            </div>

            <div className="absolute -right-6 bottom-1/4 bg-white rounded-2xl shadow-xl border border-[#e7eefe] px-4 py-3 hidden lg:flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50">
                <TrendingUp size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-black text-[#151c27]">96% Attendance</p>
                <p className="text-[0.68rem] text-[#777587]">This month</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <ClipboardList size={24} />,
      title: 'Smart Leave Management',
      desc: 'Multi-type leave workflows with instant approval chains. Annual, sick, casual, emergency — all tracked automatically.',
      color: '#3525cd', bg: 'rgba(53,37,205,.08)',
    },
    {
      icon: <Clock size={24} />,
      title: 'Real-time Attendance',
      desc: 'Clock-in/out with live status updates. Automatic late arrival and early exit detection with custom thresholds.',
      color: '#059669', bg: 'rgba(5,150,105,.08)',
    },
    {
      icon: <BarChart2 size={24} />,
      title: 'Analytics & Insights',
      desc: 'Beautiful charts that drive HR decisions. Leave trends, attendance patterns, and team performance at a glance.',
      color: '#7c3aed', bg: 'rgba(124,58,237,.08)',
    },
    {
      icon: <Users size={24} />,
      title: 'Team Management',
      desc: 'Add employees, set departments, and manage HR admins with a clean 3-tier role hierarchy.',
      color: '#0891b2', bg: 'rgba(8,145,178,.08)',
    },
    {
      icon: <Bell size={24} />,
      title: 'Smart Notifications',
      desc: 'Push notifications, email alerts, birthday wishes, holiday reminders — your team never misses a beat.',
      color: '#d97706', bg: 'rgba(217,119,6,.08)',
    },
    {
      icon: <Building2 size={24} />,
      title: 'Multi-Organization',
      desc: 'Each company gets its own isolated workspace with custom SMTP, Google Calendar, and leave policies.',
      color: '#dc2626', bg: 'rgba(220,38,38,.08)',
    },
  ];

  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5 border"
            style={{ background: 'rgba(53,37,205,.07)', color: BRAND, borderColor: 'rgba(53,37,205,.2)' }}>
            <Zap size={11} /> Platform Features
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] text-[#151c27] mb-4">
            Everything your HR team needs
          </h2>
          <p className="text-[#464555] text-lg max-w-2xl mx-auto">
            A complete HR management suite designed to save hours of admin work every week.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="group p-6 rounded-2xl border border-[#e7eefe] bg-white hover:border-[#c7c4d8] hover:shadow-lg transition-all duration-200">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ background: f.bg, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="text-base font-black text-[#151c27] mb-2">{f.title}</h3>
              <p className="text-sm text-[#464555] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'Register Your Company',
      desc: 'Fill out a short form with your company details. Our team reviews and approves your organization within 24 hours.',
      icon: <Building2 size={28} />,
    },
    {
      num: '02',
      title: 'Set Up Your Team',
      desc: 'Add employees, configure leave policies, connect Google Calendar and SMTP. Customize everything to fit your workflow.',
      icon: <Users size={28} />,
    },
    {
      num: '03',
      title: 'Go Live Instantly',
      desc: 'Your team starts clocking in, applying for leaves, and getting notified — all from one central dashboard.',
      icon: <Zap size={28} />,
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-[#f9f9ff]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5 border"
            style={{ background: 'rgba(53,37,205,.07)', color: BRAND, borderColor: 'rgba(53,37,205,.2)' }}>
            <ChevronRight size={11} /> How It Works
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] text-[#151c27] mb-4">
            Up and running in minutes
          </h2>
          <p className="text-[#464555] text-lg max-w-xl mx-auto">
            No complex setup or IT support needed. Just register, configure, and start managing.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-12 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-[#3525cd]/20 via-[#3525cd]/40 to-[#3525cd]/20" />

          {steps.map((s, i) => (
            <div key={s.num} className="relative text-center">
              <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)', boxShadow: '0 8px 24px rgba(53,37,205,.3)' }}>
                <div className="text-white">{s.icon}</div>
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border-2 flex items-center justify-center text-[0.65rem] font-black"
                  style={{ color: BRAND, borderColor: BRAND }}>
                  {i + 1}
                </div>
              </div>
              <h3 className="text-lg font-black text-[#151c27] mb-3">{s.title}</h3>
              <p className="text-sm text-[#464555] leading-relaxed max-w-sm mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  const stats = [
    { value: '99.9%', label: 'Uptime SLA', icon: <Zap size={20} />, color: BRAND },
    { value: '60s',   label: 'Avg. Approval Time', icon: <Clock size={20} />, color: '#059669' },
    { value: '3-Tier', label: 'Role Hierarchy', icon: <ShieldCheck size={20} />, color: '#7c3aed' },
    { value: '24/7',   label: 'Platform Support', icon: <Star size={20} />, color: '#d97706' },
  ];

  return (
    <section id="stats" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] text-[#151c27] mb-4">
            Built for reliability
          </h2>
          <p className="text-[#464555] text-lg max-w-xl mx-auto">
            Enterprise-grade infrastructure powering growing teams across India.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {stats.map(s => (
            <div key={s.label} className="text-center p-8 rounded-2xl border border-[#e7eefe] bg-[#f9f9ff] hover:border-[#c7c4d8] hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: `${s.color}15`, color: s.color }}>
                {s.icon}
              </div>
              <div className="text-3xl font-black text-[#151c27] mb-1">{s.value}</div>
              <div className="text-sm text-[#777587] font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Feature checklist */}
        <div className="rounded-3xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center"
          style={{ background: 'linear-gradient(135deg, #3525cd 0%, #4f46e5 50%, #712ae2 100%)' }}>
          <div>
            <h3 className="text-3xl font-black text-white mb-4 tracking-tight">
              Everything in one platform
            </h3>
            <p className="text-white/75 text-base leading-relaxed mb-6">
              From day one attendance records to year-end leave reports — LeaveTracker handles it all so your HR team can focus on people, not paperwork.
            </p>
            <Link to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-xl text-sm font-bold hover:-translate-y-0.5 transition-all shadow-lg"
              style={{ color: BRAND }}>
              Get Started Free <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              'Leave approval workflows',
              'Real-time attendance',
              'Google Calendar sync',
              'Email & push notifications',
              'Analytics dashboards',
              'Role-based access control',
              'Birthday & holiday reminders',
              'Custom leave policies',
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-white flex-shrink-0" />
                <span className="text-white/85 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 bg-[#f9f9ff]">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-8 border"
          style={{ background: 'rgba(53,37,205,.07)', color: BRAND, borderColor: 'rgba(53,37,205,.2)' }}>
          <Globe size={11} /> Multi-Tenant SaaS
        </div>
        <h2 className="text-4xl md:text-5xl font-black tracking-[-0.03em] text-[#151c27] mb-5">
          Ready to transform<br />your HR operations?
        </h2>
        <p className="text-lg text-[#464555] max-w-xl mx-auto mb-10">
          Register your organization today. Get your dedicated HR dashboard, invite your team, and go live within minutes.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/register"
            className="flex items-center gap-2 px-8 py-4 text-base font-bold text-white rounded-2xl shadow-xl hover:-translate-y-1 transition-all w-full sm:w-auto justify-center"
            style={{ background: 'linear-gradient(135deg, #3525cd, #4f46e5)', boxShadow: '0 8px 32px rgba(53,37,205,.35)' }}>
            Register Your Organization <ArrowRight size={18} />
          </Link>
          <Link to="/login"
            className="flex items-center gap-2 px-8 py-4 text-base font-bold text-[#3525cd] rounded-2xl border-2 border-[#3525cd]/30 hover:border-[#3525cd] transition-all w-full sm:w-auto justify-center">
            Sign In
          </Link>
        </div>
        <p className="text-sm text-[#777587] mt-6">No credit card required. Free to get started.</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#151c27] text-white py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-9 h-9 flex-shrink-0" />
            <div>
              <p className="font-black text-sm tracking-tight">LeaveTracker</p>
              <p className="text-xs text-white/50 mt-0.5">by LumosLogic</p>
            </div>
          </div>

          <div className="flex items-center gap-8 text-sm text-white/60">
            <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-white transition-colors">Register</Link>
            <Link to="/platform/login" className="hover:text-white transition-colors">Platform Admin</Link>
          </div>

          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} LumosLogic. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
