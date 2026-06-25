import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, FileText, Users, Settings, LogOut, UserCircle,
  Building2, CalendarDays, Shield, ClipboardList, BarChart3, FolderOpen,
  DollarSign, Monitor, Receipt, Megaphone, Clock, Target, UserCheck, LogOut as Exit,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { FeatureFlagContext } from '@/context/FeatureFlagContext';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { initials, cn } from '@/lib/utils';

// ── Section definitions ──────────────────────────────────────────────────────

const CORE_ITEMS = [
  { to: '/dashboard',      label: 'Dashboard',      Icon: LayoutDashboard },
  { to: '/calendar',       label: 'Calendar',       Icon: Calendar },
  { to: '/leaves',         label: 'Leaves',         Icon: FileText },
  { to: '/employees',      label: 'Employees',      Icon: Users, adminOnly: true },
  { to: '/regularization', label: 'Regularization', Icon: ClipboardList, featureKey: 'regularization' },
  { to: '/announcements',  label: 'Announcements',  Icon: Megaphone,     featureKey: 'announcements' },
];

const HR_ITEMS = [
  { to: '/departments',    label: 'Departments',    Icon: Building2 },
  { to: '/holidays',       label: 'Holidays',       Icon: CalendarDays },
  { to: '/leave-policies', label: 'Leave Policies', Icon: Shield,      featureKey: 'leave_policies' },
  { to: '/shifts',         label: 'Shifts & Roster',Icon: Clock,       featureKey: 'shifts' },
  { to: '/onboarding',     label: 'Onboarding',     Icon: UserCheck,   featureKey: 'onboarding' },
  { to: '/exit-management',label: 'Exit Mgmt',      Icon: Exit,        featureKey: 'exit_management' },
];

const FINANCE_ITEMS = [
  { to: '/payroll',  label: 'Payroll',  Icon: DollarSign, featureKey: 'payroll' },
  { to: '/expenses', label: 'Expenses', Icon: Receipt,    featureKey: 'expenses' },
  { to: '/assets',   label: 'Assets',   Icon: Monitor,    featureKey: 'assets' },
  { to: '/reports',  label: 'Reports',  Icon: BarChart3,  featureKey: 'reports' },
];

const PEOPLE_ITEMS = [
  { to: '/performance', label: 'Performance', Icon: Target,     featureKey: 'performance' },
  { to: '/documents',   label: 'Documents',   Icon: FolderOpen, featureKey: 'documents' },
];

const BOTTOM_ITEMS = [
  { to: '/notifications', label: 'Notifications', Icon: Bell },
  { to: '/settings',      label: 'Settings',      Icon: Settings },
  { to: '/profile',       label: 'Profile',       Icon: UserCircle },
];

function NavSection({ title, items, onClose, isAdmin, prefix = '' }) {
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
        {filtered.map(({ to, label, Icon }) => {
          const path = prefix + to.replace(/^\//, '/');
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

  const bottomWithBadge = BOTTOM_ITEMS.map(item =>
    item.label === 'Notifications'
      ? { ...item, badge: unread > 0 ? unread : null }
      : item
  );

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
        <div id="tour-nav-overview"><NavSection title="Overview"  items={CORE_ITEMS}    onClose={onClose} isAdmin={isAdmin} prefix={prefix} /></div>
        {isAdmin && <div id="tour-nav-hr"><NavSection title="HR Management" items={HR_ITEMS}   onClose={onClose} isAdmin={isAdmin} prefix={prefix} /></div>}
        {isAdmin && <div id="tour-nav-finance"><NavSection title="Finance"       items={FINANCE_ITEMS} onClose={onClose} isAdmin={isAdmin} prefix={prefix} /></div>}
        <div id="tour-nav-people"><NavSection title="People"    items={PEOPLE_ITEMS}  onClose={onClose} isAdmin={isAdmin} prefix={prefix} /></div>

        {/* Bottom items with notification badge */}
        <div id="tour-nav-account" className="mb-3">
          <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#777587] px-2.5 py-2">Account</p>
          <div className="flex flex-col gap-0.5">
            {bottomWithBadge.map(({ to, label, Icon, badge }) => {
              const path = prefix + to.replace(/^\//, '/');
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
                      {badge > 0 && <span className="ml-auto bg-[#3525cd] text-white text-[0.6rem] font-black px-1.5 py-0.5 rounded-full min-w-[1.2rem] text-center">{badge > 99 ? '99+' : badge}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
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
