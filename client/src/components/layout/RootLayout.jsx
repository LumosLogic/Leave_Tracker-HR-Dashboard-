import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, FileText, Users, Settings, LogOut, ShieldCheck,
  UserCircle, Bell, Building2, ClipboardList, CalendarDays, Shield, Clock,
  DollarSign, Receipt, Monitor, BarChart3, Target, FolderOpen, UserCheck, Megaphone,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Header } from './Header';
import { usePageMeta } from '@/hooks/usePageMeta';
import { initials, cn } from '@/lib/utils';
import { useTour } from '@/hooks/useTour';
import { adminTourSteps } from '@/lib/tours';

const NAV_SECTIONS = [
  { title: 'Overview', items: [
    { to: '/root/dashboard',      label: 'Dashboard',      Icon: LayoutDashboard },
    { to: '/root/calendar',       label: 'Calendar',       Icon: Calendar },
    { to: '/root/leaves',         label: 'Leaves',         Icon: FileText },
    { to: '/root/employees',      label: 'Employees',      Icon: Users },
    { to: '/root/regularization', label: 'Regularization', Icon: ClipboardList },
    { to: '/root/announcements',  label: 'Announcements',  Icon: Megaphone },
  ]},
  { title: 'HR Management', items: [
    { to: '/root/departments',    label: 'Departments',    Icon: Building2 },
    { to: '/root/holidays',       label: 'Holidays',       Icon: CalendarDays },
    { to: '/root/leave-policies', label: 'Leave Policies', Icon: Shield },
    { to: '/root/shifts',         label: 'Shifts & Roster',Icon: Clock },
    { to: '/root/onboarding',     label: 'Onboarding',     Icon: UserCheck },
    { to: '/root/exit-management',label: 'Exit Mgmt',      Icon: LogOut },
  ]},
  { title: 'Finance', items: [
    { to: '/root/payroll',        label: 'Payroll',        Icon: DollarSign },
    { to: '/root/expenses',       label: 'Expenses',       Icon: Receipt },
    { to: '/root/assets',         label: 'Assets',         Icon: Monitor },
    { to: '/root/reports',        label: 'Reports',        Icon: BarChart3 },
  ]},
  { title: 'People', items: [
    { to: '/root/performance',    label: 'Performance',    Icon: Target },
    { to: '/root/documents',      label: 'Documents',      Icon: FolderOpen },
  ]},
  { title: 'Admin', items: [
    { to: '/root/manage-hr',      label: 'Manage HR',      Icon: ShieldCheck },
    { to: '/root/broadcast',      label: 'Broadcast',      Icon: Bell },
    { to: '/root/settings',       label: 'Settings',       Icon: Settings },
    { to: '/root/org-settings',   label: 'Org Settings',   Icon: Building2 },
    { to: '/root/notifications',  label: 'Notifications',  Icon: Bell },
    { to: '/root/profile',        label: 'Profile',        Icon: UserCircle },
  ]},
];

function RootSidebar({ onClose }) {
  const { user, logout, organization } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="w-64 h-full bg-white flex flex-col flex-shrink-0 relative border-r border-[#c7c4d8] shadow-sm">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-[#e7eefe]">
        <div className="flex items-center gap-3">
          <img src="/LogoWithoutName.svg" alt="LeaveTracker" className="w-9 h-9 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-black text-[#151c27] leading-tight tracking-tight truncate">{organization?.name || 'LeaveTracker'}</h2>
            <p className="text-[0.65rem] text-[#777587] mt-0.5 tracking-wide">Root Admin Console</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-1">
        {NAV_SECTIONS.map((sec, idx) => (
          <div key={sec.title} id={`tour-nav-${['overview','hr','finance','people','account'][idx] || idx}`} className="mb-2">
            <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#777587] px-2.5 py-2">{sec.title}</p>
            <div className="flex flex-col gap-0.5">
              {sec.items.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} onClick={onClose}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-150',
                    isActive
                      ? 'bg-[#3525cd]/10 text-[#3525cd] border-l-[3px] border-[#3525cd] border-t-transparent border-r-transparent border-b-transparent font-bold'
                      : 'text-[#464555] border-transparent hover:bg-[#f0f3ff] hover:text-[#151c27] hover:border-[#c7c4d8]'
                  )}>
                  {({ isActive }) => (
                    <>
                      <Icon size={17} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60')} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div id="tour-user-card" className="p-3 border-t border-[#e7eefe]">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#f0f3ff] transition-colors cursor-default border border-transparent hover:border-[#c7c4d8]">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[0.78rem] font-black text-white flex-shrink-0 border-2 border-white shadow-md"
            style={{ background: user?.avatar_color || '#3525cd' }}>
            {initials(user?.name || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.84rem] font-black text-[#151c27] leading-tight truncate">{user?.name}</p>
            <p className="text-[0.68rem] text-[#777587] mt-0.5">Root Administrator</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 w-full px-2.5 py-2 mt-1 rounded-lg text-[0.82rem] font-semibold text-rose-400/80 hover:bg-rose-50 hover:text-rose-500 transition-all duration-150">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  );
}

export function RootLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { title, subtitle } = usePageMeta();
  const { user } = useAuth();
  useTour(adminTourSteps, (user?.id && !user?.force_password_change) ? `lt_tour_admin_${user.id}` : null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f9f9ff]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[499] md:hidden"
          style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative z-[500] md:z-auto h-full transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <RootSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} subtitle={subtitle} onMenuClick={() => setSidebarOpen(o => !o)} />
        <main id="tour-main-content" className="flex-1 overflow-y-auto p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
