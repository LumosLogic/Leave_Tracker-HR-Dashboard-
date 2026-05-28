import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePageMeta } from '@/hooks/usePageMeta';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { title, subtitle } = usePageMeta();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f9f9ff]">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[499] md:hidden"
          style={{ background: 'rgba(4,6,14,.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar – always visible on md+, drawer on mobile */}
      <div className={`fixed md:relative z-[500] md:z-auto h-full transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(o => !o)}
        />
        <main className="flex-1 overflow-y-auto p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
