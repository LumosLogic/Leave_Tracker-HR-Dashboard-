import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, FileText, Clock, UserCircle, LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { initials, cn } from '@/lib/utils';

const navItems = [
  { to: '/portal/home',       label: 'My Dashboard',  Icon: Home },
  { to: '/portal/leaves',     label: 'My Leaves',     Icon: FileText },
  { to: '/portal/attendance', label: 'My Attendance', Icon: Clock },
  { to: '/portal/profile',    label: 'My Profile',    Icon: UserCircle },
];

function EmployeeSidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="w-64 h-full bg-white flex flex-col flex-shrink-0 relative border-r border-[#c7c4d8] shadow-sm">
      <div className="px-4 py-4 border-b border-[#e7eefe]">
        <div className="flex items-center gap-3">
          <img src="/LogoWithoutName.svg" alt="Lumos Logic" className="w-9 h-9 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-black text-[#151c27] leading-tight tracking-tight">Lumos Logic</h2>
            <p className="text-[0.65rem] text-[#777587] mt-0.5 tracking-wide">Employee Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#777587] px-2.5 py-3">My Workspace</p>
        <div className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} onClick={onClose}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-150 relative',
                isActive
                  ? 'bg-[#3525cd]/10 text-[#3525cd] border-l-[3px] border-[#3525cd] border-t-transparent border-r-transparent border-b-transparent font-bold'
                  : 'text-[#464555] border-transparent hover:bg-[#f0f3ff] hover:text-[#151c27] hover:border-[#c7c4d8]'
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-[#e7eefe]">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-default">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[0.78rem] font-black text-white flex-shrink-0 border-2 border-white shadow-sm"
            style={{ background: user?.avatar_color || '#3525cd' }}>
            {initials(user?.name || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.84rem] font-black text-[#151c27] leading-tight truncate">{user?.name}</p>
            <p className="text-[0.68rem] text-[#777587] mt-0.5 truncate">{user?.position || 'Employee'}</p>
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

export function EmployeeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f9f9ff]">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-[#151c27]/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={cn(
        'fixed inset-y-0 left-0 z-30 md:relative md:flex flex-shrink-0',
        sidebarOpen ? 'flex' : 'hidden md:flex'
      )}>
        <EmployeeSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="md:hidden flex items-center h-14 px-4 bg-white border-b border-[#c7c4d8]">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-[#464555]">
            <Menu size={20} />
          </button>
          <img src="/LogoWithoutName.svg" alt="Lumos Logic" className="ml-2 w-7 h-7" />
          <span className="ml-2 text-sm font-bold text-[#151c27]">Lumos Logic <span className="text-[#777587] font-normal">— Employee</span></span>
        </div>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
