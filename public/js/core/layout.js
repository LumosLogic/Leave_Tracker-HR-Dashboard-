'use strict';

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  render();
}

function render() {
  const root = document.getElementById('root');
  if (state.view === 'login') { root.innerHTML = renderLoginPage(); bindLogin(); return; }
  root.innerHTML = renderLayout();
  renderContent();
  bindNav();
}

function renderContent() {
  switch (state.view) {
    case 'dashboard':  loadDashboard();  break;
    case 'calendar':   loadCalendar();   break;
    case 'leaves':     loadLeaves();     break;
    case 'employees':  loadEmployees();  break;
    case 'settings':   loadSettings();   break;
  }
}

// ── Nav config ────────────────────────────────────────────────────────────────
function getNavItems() {
  const u = state.user;
  const items = [
    { id: 'dashboard', label: 'Dashboard',       icon: 'dashboard'    },
    { id: 'leaves',    label: 'Leave Management', icon: 'event_busy'   },
    { id: 'calendar',  label: 'Calendar',         icon: 'calendar_today' },
    ...(u.role === 'admin' ? [{ id: 'employees', label: 'Employees', icon: 'group' }] : []),
    { id: 'settings',  label: 'Settings',         icon: 'settings'     },
  ];
  return items;
}

// ── App Shell Layout ──────────────────────────────────────────────────────────
function renderLayout() {
  const u = state.user;
  const navItems = getNavItems();
  const userInitials = (u.name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return `
    <div class="flex min-h-screen bg-background" id="app-layout">
      <!-- Mobile sidebar overlay -->
      <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>

      <!-- Sidebar -->
      <aside class="app-sidebar w-[260px] h-screen sticky top-0 left-0 bg-surface-container-lowest border-r border-outline-variant shadow-sm flex flex-col py-lg px-md shrink-0 z-50" id="sidebar">

        <!-- Logo -->
        <div class="mb-xl px-sm">
          <h1 class="text-title-lg font-semibold text-primary tracking-tight">Lumens HR</h1>
          <p class="text-[11px] text-on-surface-variant mt-0.5">Enterprise Edition</p>
        </div>

        <!-- Nav -->
        <nav class="flex-1 space-y-base overflow-y-auto">
          ${navItems.map(item => `
            <button
              class="nav-item-btn flex items-center gap-md py-sm px-md rounded-lg w-full text-left transition-all duration-200 ${state.view === item.id
                ? 'bg-primary-container/10 text-primary border-l-[3px] border-primary font-medium'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-l-[3px] border-transparent'
              }"
              data-view="${item.id}"
            >
              <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
              <span class="text-[13px] font-medium">${item.label}</span>
            </button>`).join('')}
        </nav>

        <!-- User profile -->
        <div class="mt-auto pt-lg border-t border-outline-variant">
          <div class="flex items-center gap-sm px-sm">
            <div class="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0"
              style="background:${u.avatar_color || '#4f46e5'}">
              ${userInitials}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[12px] font-semibold text-on-surface truncate">${u.name}</p>
              <p class="text-[10px] text-on-surface-variant truncate">${u.role === 'admin' ? 'HR Administrator' : (u.position || 'Employee')}</p>
            </div>
            <button class="text-on-surface-variant hover:text-error transition-colors p-1 rounded" onclick="logout()" title="Sign out">
              <span class="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Main area -->
      <div class="flex-1 flex flex-col min-w-0">

        <!-- Top header -->
        <header class="w-full h-16 sticky top-0 z-40 bg-surface border-b border-outline-variant flex items-center px-lg">
          <div class="flex justify-between items-center w-full max-w-container-max mx-auto">

            <!-- Left: hamburger + title -->
            <div class="flex items-center gap-md flex-1">
              <button class="md:hidden p-1.5 text-on-surface-variant hover:text-primary transition-colors" id="hamburger" onclick="toggleSidebar()" aria-label="Menu">
                <span class="material-symbols-outlined">menu</span>
              </button>
              <div id="header-title">
                <span class="text-title-lg font-semibold text-on-surface">Dashboard</span>
              </div>
            </div>

            <!-- Right: actions -->
            <div class="flex items-center gap-md">
              <button class="p-2 rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors" title="Notifications">
                <span class="material-symbols-outlined text-[20px]">notifications</span>
              </button>
              <button class="p-2 rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors" title="Help">
                <span class="material-symbols-outlined text-[20px]">help_outline</span>
              </button>
              <button class="bg-primary text-on-primary px-lg py-sm rounded-lg text-[12px] font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center gap-xs"
                onclick="typeof openApplyLeaveModal === 'function' ? openApplyLeaveModal() : navigate('leaves')">
                <span class="material-symbols-outlined text-[16px]">add</span>
                Apply Leave
              </button>
            </div>
          </div>
        </header>

        <!-- Content -->
        <main class="flex-1 overflow-y-auto" id="content">
          <div class="loading"><div class="spinner"></div> Loading…</div>
        </main>
      </div>
    </div>`;
}

function toggleSidebar() {
  document.getElementById('app-layout').classList.toggle('sidebar-open');
}
function closeSidebar() {
  document.getElementById('app-layout').classList.remove('sidebar-open');
}
function bindNav() {
  document.querySelectorAll('.nav-item-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => { closeSidebar(); navigate(btn.dataset.view); });
  });
}
function setHeaderTitle(title, sub = '') {
  const el = document.getElementById('header-title');
  if (el) el.innerHTML = `<span class="text-title-lg font-semibold text-on-surface">${title}</span>${sub ? `<span class="text-[12px] text-on-surface-variant ml-2">${sub}</span>` : ''}`;
}
