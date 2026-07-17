import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, FileText, Users, Settings, LogOut, UserCircle,
  Building2, CalendarDays, Shield, ClipboardList, BarChart3, FolderOpen,
  DollarSign, Monitor, Receipt, Megaphone, Clock, Target, UserCheck, LogOut as Exit,
  Bell, Fingerprint, Link2, ScrollText,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { FeatureFlagContext } from '@/context/FeatureFlagContext';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { initials, cn } from '@/lib/utils';

// ── Section definitions ──────────────────────────────────────────────────────

const OVERVIEW_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
];

const EMPLOYEE_MGMT_ITEMS = [
  { to: '/employees',       label: 'Employees',       Icon: Users,      adminOnly: true },
  { to: '/departments',     label: 'Departments',     Icon: Building2,  adminOnly: true },
  { to: '/branches',        label: 'Branches',        Icon: Building2,  adminOnly: true, featureKey: 'branches' },
  { to: '/onboarding',      label: 'Onboarding',      Icon: UserCheck,  adminOnly: true, featureKey: 'onboarding' },
  { to: '/exit-management', label: 'Exit Management', Icon: Exit,       adminOnly: true, featureKey: 'exit_management' },
];

const ATTENDANCE_ITEMS = [
  { to: '/leaves',         label: 'Leaves',          Icon: FileText },
  { to: '/calendar',       label: 'Calendar',        Icon: Calendar },
  { to: '/regularization', label: 'Regularization',  Icon: ClipboardList, featureKey: 'regularization' },
  { to: '/holidays',       label: 'Holidays',        Icon: CalendarDays, adminOnly: true },
  { to: '/leave-policies', label: 'Leave Policies',  Icon: Shield,        adminOnly: true, featureKey: 'leave_policies' },
  { to: '/shifts',         label: 'Shifts & Roster', Icon: Clock,         adminOnly: true, featureKey: 'shifts' },
];

const BIOMETRIC_ITEMS = [
  { to: '/biometric/devices', label: 'Devices',    Icon: Fingerprint, adminOnly: true, featureKey: 'biometric' },
  { to: '/biometric/mapping', label: 'PIN Mapping', Icon: Link2,       adminOnly: true, featureKey: 'biometric' },
  { to: '/biometric/logs',    label: 'Punch Logs',  Icon: ScrollText,  adminOnly: true, featureKey: 'biometric' },
];

const FINANCE_ITEMS = [
  { to: '/payroll',  label: 'Payroll',  Icon: DollarSign, featureKey: 'payroll' },
  { to: '/expenses', label: 'Expenses', Icon: Receipt,    featureKey: 'expenses' },
  { to: '/assets',   label: 'Assets',   Icon: Monitor,    featureKey: 'assets' },
  { to: '/reports',  label: 'Reports',  Icon: BarChart3,  featureKey: 'reports' },
];

const PERFORMANCE_ITEMS = [
  { to: '/performance', label: 'Performance', Icon: Target,     featureKey: 'performance' },
  { to: '/documents',   label: 'Documents',   Icon: FolderOpen, featureKey: 'documents' },
];

const COMMUNICATION_ITEMS = [
  { to: '/announcements', label: 'Announcements', Icon: Megaphone,   featureKey: 'announcements' },
  { to: '/notifications', label: 'Notifications', Icon: Bell,        notifBadge: true },
];

const ADMIN_ITEMS = [
  { to: '/settings', label: 'Settings', Icon: Settings },
  { to: '/profile',  label: 'Profile',  Icon: UserCircle },
];

function NavSection({ title, items, onClose, isAdmin, prefix = '', unreadCount = 0 }) {
  const featureFlags = useContext(FeatureFlagContext);
  const filtered = items.filter(i => {
    if (i.adminOnly && !isAdmin) return false;
    if (i.featureKey) {
      const enabled = i.featureKey in featureFlags ? featureFlags[i.featureKey] : true;
      if (!enabled) return false;
    }
    return true;
  });
  if (!filtered.length) return null;
  return (
    <div className="mb-3">
      {title && <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#777587] px-2.5 py-2">{title}</p>}
      <div className="flex flex-col gap-0.5">
        {filtered.map(({ to, label, Icon, notifBadge }) => {
          const path = prefix + to.replace(/^\//, '/');
          const badge = notifBadge && unreadCount > 0 ? unreadCount : null;
          return (
            <NavLink key={path} to={path} onClick={onClose}
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
                  {badge && (
                    <span className="ml-auto bg-[#3525cd] text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ onClose, prefix = '' }) {
  const { user, logout, isAdmin, isRootAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: countData } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => apiGet('/notifications/unread-count'),
    refetchInterval: 30000,
  });
  const unread = countData?.count || 0;

  function handleLogout() { logout(); navigate('/login'); }

  const sharedProps = { onClose, isAdmin, prefix, unreadCount: unread };

  return (
    <aside className="w-64 h-full bg-white flex flex-col flex-shrink-0 relative border-r border-[#c7c4d8] shadow-sm">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#e7eefe]">
        <div className="flex items-center gap-3">
          <img src="/LogoWithoutName.svg" alt="Lumos Logic" className="w-9 h-9 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-black text-[#151c27] leading-tight tracking-tight">Lumos Logic</h2>
            <p className="text-[0.65rem] text-[#777587] mt-0.5 tracking-wide">
              {isRootAdmin ? 'Root Admin Console' : 'HR Admin Console'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-1">
        <div id="tour-nav-overview">
          <NavSection title="Overview" items={OVERVIEW_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-hr">
          <NavSection title="Employee Management" items={EMPLOYEE_MGMT_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-attendance">
          <NavSection title="Attendance & Leave" items={ATTENDANCE_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-biometric">
          <NavSection title="Biometric" items={BIOMETRIC_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-finance">
          <NavSection title="Finance" items={FINANCE_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-people">
          <NavSection title="Performance" items={PERFORMANCE_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-comms">
          <NavSection title="Communication" items={COMMUNICATION_ITEMS} {...sharedProps} />
        </div>
        <div id="tour-nav-account">
          <NavSection title="Administration" items={ADMIN_ITEMS} {...sharedProps} />
        </div>
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
            <p className="text-[0.68rem] text-[#777587] mt-0.5 truncate">
              {isRootAdmin ? 'Root Administrator' : isAdmin ? 'HR Admin' : user?.position || 'Employee'}
            </p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 w-full px-2.5 py-2 mt-1 rounded-lg text-[0.82rem] font-semibold text-rose-400/80 hover:bg-rose-50 hover:text-rose-500 transition-all">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
