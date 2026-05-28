'use strict';

// ── Settings Page ─────────────────────────────────────────────────────────────
async function loadSettings() {
  setHeaderTitle('Settings', 'Configure work schedule and integrations');
  const content = document.getElementById('content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    const { schedule, clockify } = await apiGet('/settings');
    state.settings = { schedule, clockify };
    renderSettingsView(schedule, clockify);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderSettingsView(s, c) {
  const content   = document.getElementById('content');
  const isAdmin   = state.user.role === 'admin';
  const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const workDays  = (s.work_days || '1,2,3,4,5').split(',').map(Number);
  const u         = state.user;
  const clockifyConnected = !!(c?.api_key || c?.workspace_id);

  const statusLegend = [
    { color: 'bg-emerald-500', label: 'Present',    desc: 'Full day attendance' },
    { color: 'bg-red-500',     label: 'Absent',     desc: 'Not present, no leave applied' },
    { color: 'bg-amber-500',   label: 'On Leave',   desc: 'Approved leave' },
    { color: 'bg-blue-500',    label: 'Half Day',   desc: `Work hours below ${s.half_day_hours}h` },
    { color: 'bg-orange-500',  label: 'Late Entry', desc: `Check-in after ${s.late_threshold}` },
    { color: 'bg-purple-500',  label: 'Early Exit', desc: `Check-out before ${s.early_exit_threshold}` },
  ];

  content.innerHTML = `
    <div class="p-lg max-w-container-max mx-auto w-full">
      <!-- Page Header -->
      <div class="mb-xl">
        <h1 class="text-headline-lg font-semibold text-on-surface tracking-tight">Settings &amp; Integrations</h1>
        <p class="text-body-md text-on-surface-variant">Manage your account preferences, system configurations, and external app connections.</p>
      </div>

      <!-- Bento Grid -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-lg">

        <!-- Profile Card (col-span-8) -->
        <div class="md:col-span-8 bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-xl">
          <div class="flex items-center gap-md">
            <div class="p-2 bg-primary/10 text-primary rounded-lg">
              <span class="material-symbols-outlined">person</span>
            </div>
            <h3 class="text-title-lg font-semibold text-on-surface">Profile Settings</h3>
          </div>
          <div class="flex items-center gap-lg">
            <div class="w-16 h-16 rounded-full flex items-center justify-center text-[18px] font-bold text-on-primary flex-shrink-0" style="background:${u.avatar_color||'#4f46e5'}">${initials(u.name)}</div>
            <div>
              <h4 class="text-title-sm font-semibold text-on-surface">${u.name}</h4>
              <p class="text-body-md text-on-surface-variant">${u.email}</p>
              <span class="inline-flex items-center mt-xs px-sm py-0.5 rounded-full text-label-sm font-medium ${u.role==='admin'?'bg-secondary/10 text-secondary':'bg-primary/10 text-primary'} capitalize">${u.role}</span>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Full Name</label>
              <input class="w-full p-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" type="text" value="${u.name}" disabled />
            </div>
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Email Address</label>
              <input class="w-full p-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" type="email" value="${u.email}" disabled />
            </div>
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Position</label>
              <input class="w-full p-3 bg-surface border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" type="text" value="${u.position || '—'}" disabled />
            </div>
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Department</label>
              <input class="w-full p-3 bg-surface-container-low border border-outline-variant rounded-lg text-body-md opacity-70 cursor-not-allowed" type="text" value="${u.department || '—'}" disabled />
            </div>
          </div>
        </div>

        <!-- Status Legend (col-span-4) -->
        <div class="md:col-span-4 bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-lg">
          <div class="flex items-center gap-md">
            <div class="p-2 bg-secondary/10 text-secondary rounded-lg">
              <span class="material-symbols-outlined">palette</span>
            </div>
            <h3 class="text-title-lg font-semibold text-on-surface">Status Legend</h3>
          </div>
          <div class="space-y-sm">
            ${statusLegend.map(item => `
              <div class="flex items-center gap-md py-xs">
                <span class="w-3 h-3 rounded-full ${item.color} flex-shrink-0"></span>
                <div class="flex-1">
                  <span class="text-label-md font-semibold text-on-surface">${item.label}</span>
                  <span class="text-label-sm text-on-surface-variant ml-sm">${item.desc}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Work Schedule (col-span-6) -->
        <div class="md:col-span-6 bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-lg">
          <div class="flex items-center gap-md">
            <div class="p-2 bg-tertiary/10 text-tertiary rounded-lg">
              <span class="material-symbols-outlined">schedule</span>
            </div>
            <h3 class="text-title-lg font-semibold text-on-surface">Work Schedule</h3>
          </div>
          <div class="space-y-md">
            <div class="grid grid-cols-2 gap-md">
              <div class="flex flex-col gap-xs">
                <label class="text-label-md text-on-surface-variant">Start Time</label>
                <input type="time" class="form-control" id="s-start" value="${s.start_time}" ${!isAdmin?'disabled':''} />
              </div>
              <div class="flex flex-col gap-xs">
                <label class="text-label-md text-on-surface-variant">End Time</label>
                <input type="time" class="form-control" id="s-end" value="${s.end_time}" ${!isAdmin?'disabled':''} />
              </div>
              <div class="flex flex-col gap-xs">
                <label class="text-label-md text-on-surface-variant">Late Threshold</label>
                <input type="time" class="form-control" id="s-late" value="${s.late_threshold}" ${!isAdmin?'disabled':''} />
                <span class="text-label-sm text-on-surface-variant">Check-in after = Late</span>
              </div>
              <div class="flex flex-col gap-xs">
                <label class="text-label-md text-on-surface-variant">Early Exit Threshold</label>
                <input type="time" class="form-control" id="s-early" value="${s.early_exit_threshold}" ${!isAdmin?'disabled':''} />
                <span class="text-label-sm text-on-surface-variant">Check-out before = Early</span>
              </div>
            </div>
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Half Day Threshold (hours)</label>
              <input type="number" class="form-control" id="s-halfday" value="${s.half_day_hours}" step="0.5" min="1" max="8" ${!isAdmin?'disabled':''} />
            </div>
            <div class="flex flex-col gap-xs">
              <label class="text-label-md text-on-surface-variant">Working Days</label>
              <div class="flex gap-sm flex-wrap">
                ${dayLabels.map((d,i) => `
                  <label class="flex items-center gap-xs text-label-md cursor-pointer">
                    <input type="checkbox" id="wd-${i}" ${workDays.includes(i)?'checked':''} ${!isAdmin?'disabled':''} class="accent-primary" />
                    ${d}
                  </label>`).join('')}
              </div>
            </div>
            <div class="bg-surface-container-low p-md rounded-lg flex items-center gap-md">
              <span class="material-symbols-outlined text-on-surface-variant text-[18px]">info</span>
              <p class="text-label-md text-on-surface-variant">Employees have a grace period before being marked as 'Late'.</p>
            </div>
            ${isAdmin ? `
              <button class="w-full py-2 bg-primary text-on-primary rounded-lg text-label-md font-semibold hover:opacity-90 active:scale-95 transition-all" onclick="saveScheduleSettings()">Save Schedule Settings</button>` : `
              <p class="text-label-md text-on-surface-variant">Only administrators can modify schedule settings.</p>`}
          </div>
        </div>

        <!-- Integrations / Clockify (col-span-6) -->
        <div class="md:col-span-6 bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-lg">
          <div class="flex items-center gap-md">
            <div class="p-2 bg-primary/10 text-primary rounded-lg">
              <span class="material-symbols-outlined">extension</span>
            </div>
            <h3 class="text-title-lg font-semibold text-on-surface">Integrations</h3>
          </div>
          <div class="space-y-md">
            <!-- Clockify Row -->
            <div class="flex items-center gap-md p-md rounded-xl bg-surface border border-outline-variant/30 hover:border-primary transition-colors">
              <div class="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm border border-outline-variant/20 flex-shrink-0">
                <span class="material-symbols-outlined text-primary text-[24px]">timer</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between flex-wrap gap-sm">
                  <p class="text-label-md font-semibold text-on-surface">Clockify</p>
                  <span class="flex items-center gap-xs px-sm py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight ${clockifyConnected ? 'bg-primary/10 text-primary' : 'bg-on-surface-variant/10 text-on-surface-variant'}">
                    ${clockifyConnected ? `<span class="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span> Connected` : 'Disconnected'}
                  </span>
                </div>
                <p class="text-label-sm text-on-surface-variant">Import billable hours and time logs automatically.</p>
                ${c?.last_synced ? `<p class="text-label-sm text-on-surface-variant mt-xs">Last synced: ${new Date(c.last_synced).toLocaleString()}</p>` : ''}
              </div>
            </div>
            ${isAdmin ? `
              <div class="space-y-md pt-sm">
                <div class="flex flex-col gap-xs">
                  <label class="text-label-md text-on-surface-variant">Clockify API Key</label>
                  <input class="form-control" type="password" id="c-apikey" placeholder="${c?.api_key ? '••••••••••••' : 'Enter your API key'}" />
                  <span class="text-label-sm text-on-surface-variant">Get from clockify.me → Profile Settings → API</span>
                </div>
                <div class="flex flex-col gap-xs">
                  <label class="text-label-md text-on-surface-variant">Workspace ID</label>
                  <input class="form-control" id="c-wsid" value="${c?.workspace_id||''}" placeholder="Enter workspace ID" />
                  <span class="text-label-sm text-on-surface-variant">Found in clockify.me/workspaces/<strong>[ID]</strong>/settings</span>
                </div>
                <div class="flex gap-sm flex-wrap">
                  <button class="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg text-label-md font-semibold hover:opacity-90 active:scale-95 transition-all" onclick="saveClockifySettings()">
                    <span class="material-symbols-outlined text-[16px]">check</span> Save Config
                  </button>
                  <button class="flex items-center gap-sm border border-outline-variant px-lg py-sm rounded-lg text-label-md hover:bg-surface-container-low transition-all" onclick="testClockifyConnection()">
                    <span class="material-symbols-outlined text-[16px]">wifi_tethering</span> Test
                  </button>
                  <button class="flex items-center gap-sm border border-outline-variant px-lg py-sm rounded-lg text-label-md hover:bg-surface-container-low transition-all" onclick="syncClockifyToday()">
                    <span class="material-symbols-outlined text-[16px]">sync</span> Sync Today
                  </button>
                </div>
              </div>` : `
              <p class="text-label-md text-on-surface-variant">Only administrators can configure integrations.</p>`}
          </div>
        </div>

        <!-- Help Banner (col-span-12) -->
        <div class="md:col-span-12 p-xl rounded-2xl overflow-hidden relative" style="background:linear-gradient(135deg,#3525cd 0%,#712ae2 100%)">
          <div class="relative z-10">
            <h4 class="text-headline-md font-semibold text-on-primary mb-sm">Need Help?</h4>
            <p class="text-body-md text-on-primary opacity-90 max-w-lg mb-lg">Check out our Enterprise documentation or contact the Lumens HR support team for advanced configuration and integration setups.</p>
            <div class="flex gap-md flex-wrap">
              <button class="bg-white text-primary px-lg py-sm rounded-lg text-label-md font-semibold hover:opacity-90 transition-all">View Documentation</button>
              <button class="text-on-primary px-lg py-sm rounded-lg text-label-md font-semibold border border-white/30 hover:bg-white/10 transition-all">Contact Support</button>
            </div>
          </div>
          <div class="absolute -right-20 -top-20 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -left-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>

      </div>
    </div>`;
}

async function saveScheduleSettings() {
  const workDays = [0,1,2,3,4,5,6].filter(i => document.getElementById(`wd-${i}`)?.checked).join(',');
  try {
    await apiPut('/settings', {
      start_time:           document.getElementById('s-start').value,
      end_time:             document.getElementById('s-end').value,
      late_threshold:       document.getElementById('s-late').value,
      early_exit_threshold: document.getElementById('s-early').value,
      half_day_hours:       parseFloat(document.getElementById('s-halfday').value),
      work_days:            workDays,
    });
    toast('Work schedule saved!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function saveClockifySettings() {
  const key  = document.getElementById('c-apikey').value;
  const wsid = document.getElementById('c-wsid').value;
  if (!key && !wsid) return toast('Enter API key and Workspace ID', 'warning');
  try {
    await apiPut('/settings/clockify', { api_key: key, workspace_id: wsid });
    toast('Clockify settings saved!', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function testClockifyConnection() {
  try {
    await saveClockifySettings();
    const workspaces = await apiGet('/clockify/workspaces');
    toast(`Connected! Found ${workspaces.length} workspace(s)`, 'success');
  } catch (err) { toast('Connection failed: ' + err.message, 'error'); }
}

async function syncClockifyToday() {
  try {
    toast('Syncing Clockify data for today…', 'info');
    const result = await apiPost('/clockify/sync', { date: todayStr() });
    toast(`Synced ${result.synced} users from Clockify`, 'success');
  } catch (err) { toast('Sync failed: ' + err.message, 'error'); }
}
