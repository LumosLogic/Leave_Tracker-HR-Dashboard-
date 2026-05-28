'use strict';

// ── Employees Page ────────────────────────────────────────────────────────────
async function loadEmployees() {
  setHeaderTitle('Employees', 'Manage team members');
  const content = document.getElementById('content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    await fetchEmployees();
    const allUsers = await apiGet('/employees');
    renderEmployeesView(allUsers);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderEmployeesView(users) {
  const content    = document.getElementById('content');
  const depts      = [...new Set(users.map(u => u.department).filter(Boolean))].sort();
  const activeDept = state.employeesDeptFilter || 'all';
  const filtered   = activeDept === 'all' ? users : users.filter(u => u.department === activeDept);

  content.innerHTML = `
    <div class="p-lg max-w-container-max mx-auto w-full">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-xl gap-md">
        <div>
          <h1 class="text-headline-lg font-semibold text-on-surface tracking-tight">Employee Directory</h1>
          <p class="text-body-md text-on-surface-variant">Manage your organization's talent and organizational structure.</p>
        </div>
        <div class="flex items-center gap-sm">
          <button class="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-lg text-label-md font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all" onclick="openAddEmployeeModal()">
            <span class="material-symbols-outlined text-[18px]">person_add</span> Add Employee
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-lg mb-xl">
        <div class="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div class="flex justify-between items-start"><span class="text-on-surface-variant text-label-md">Total Employees</span><span class="material-symbols-outlined text-primary">group</span></div>
          <div class="mt-md"><h3 class="text-headline-md font-semibold text-on-surface">${users.length}</h3><p class="text-label-sm text-on-surface-variant mt-1">${users.filter(u=>u.role==='employee').length} staff members</p></div>
        </div>
        <div class="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div class="flex justify-between items-start"><span class="text-on-surface-variant text-label-md">Departments</span><span class="material-symbols-outlined text-secondary">account_tree</span></div>
          <div class="mt-md"><h3 class="text-headline-md font-semibold text-on-surface">${depts.length}</h3><p class="text-label-sm text-on-surface-variant mt-1">Cross-functional units</p></div>
        </div>
        <div class="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div class="flex justify-between items-start"><span class="text-on-surface-variant text-label-md">Administrators</span><span class="material-symbols-outlined text-tertiary">admin_panel_settings</span></div>
          <div class="mt-md"><h3 class="text-headline-md font-semibold text-on-surface">${users.filter(u=>u.role==='admin').length}</h3><p class="text-label-sm text-on-surface-variant mt-1">System administrators</p></div>
        </div>
        <div class="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div class="flex justify-between items-start"><span class="text-on-surface-variant text-label-md">Showing</span><span class="material-symbols-outlined text-outline">person_search</span></div>
          <div class="mt-md"><h3 class="text-headline-md font-semibold text-on-surface">${filtered.length}</h3><p class="text-label-sm text-primary mt-1">${activeDept === 'all' ? 'All departments' : activeDept}</p></div>
        </div>
      </div>

      <!-- Department Tabs -->
      <div class="flex items-center gap-lg border-b border-outline-variant mb-lg overflow-x-auto pb-px">
        <button class="pb-3 px-1 text-label-md whitespace-nowrap transition-colors ${activeDept==='all'?'text-primary border-b-2 border-primary font-semibold':'text-on-surface-variant hover:text-on-surface'}" onclick="setEmployeesDept('all')">All Employees</button>
        ${depts.map(d => `<button class="pb-3 px-1 text-label-md whitespace-nowrap transition-colors ${activeDept===d?'text-primary border-b-2 border-primary font-semibold':'text-on-surface-variant hover:text-on-surface'}" onclick="setEmployeesDept('${d.replace(/'/g,"\\'")}')">${d}</button>`).join('')}
      </div>

      <!-- Table -->
      <div class="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low">
              <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Employee</th>
              <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Position</th>
              <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Department</th>
              <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Status</th>
              <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/20">
            ${filtered.length === 0 ? `<tr><td colspan="5" class="px-lg py-2xl text-center text-on-surface-variant">No employees found</td></tr>` :
              filtered.map(u => `
                <tr class="hover:bg-surface-container/30 transition-colors">
                  <td class="px-lg py-4">
                    <div class="flex items-center gap-md">
                      <div class="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0" style="background:${u.avatar_color||'#4f46e5'}">${initials(u.name)}</div>
                      <div>
                        <p class="text-body-md font-semibold text-on-surface">${u.name}</p>
                        <p class="text-label-sm text-on-surface-variant">${u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-lg py-4 text-body-md text-on-surface">${u.position || '—'}</td>
                  <td class="px-lg py-4 text-body-md text-on-surface">${u.department || '—'}</td>
                  <td class="px-lg py-4">
                    <span class="inline-flex items-center px-sm py-xs rounded-full text-label-sm font-medium ${u.role==='admin'?'bg-secondary/10 text-secondary':'bg-primary-container/10 text-primary'}">
                      ${u.role === 'admin' ? 'Admin' : 'Active'}
                    </span>
                  </td>
                  <td class="px-lg py-4 text-right">
                    <div class="flex items-center justify-end gap-sm">
                      ${u.role !== 'admin' ? `<button class="text-primary text-label-md hover:underline underline-offset-4" onclick="openEmployeeProfile(${u.id})">View Profile</button>` : ''}
                      <button class="p-sm text-on-surface-variant hover:text-primary rounded-full hover:bg-primary/10 transition-all" onclick='openEditEmployeeModal(${JSON.stringify(u)})' title="Edit"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                      ${u.id !== state.user.id ? `<button class="p-sm text-on-surface-variant hover:text-error rounded-full hover:bg-error/10 transition-all" onclick="deleteEmployee(${u.id},'${u.name.replace(/'/g,"\\'")}')"><span class="material-symbols-outlined text-[18px]">delete</span></button>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
        <div class="px-lg py-4 flex items-center justify-between border-t border-outline-variant/20">
          <p class="text-label-sm text-on-surface-variant">Showing ${filtered.length} of ${users.length} employees</p>
        </div>
      </div>
    </div>`;
}

function setEmployeesDept(dept) {
  state.employeesDeptFilter = dept;
  const users = state.employees.length ? state.employees : [];
  renderEmployeesView(users);
}

// ── Employee Profile ──────────────────────────────────────────────────────────
async function openEmployeeProfile(empId) {
  const allUsers = state.employees.length ? state.employees : await apiGet('/employees');
  const emp = allUsers.find(u => u.id === empId) || (await apiGet('/employees')).find(u => u.id === empId);
  if (!emp) return;
  state.profileEmp = emp;
  const now = new Date();
  await renderEmployeeProfile(now.getFullYear(), now.getMonth() + 1);
}

async function renderEmployeeProfile(year, month) {
  const emp     = state.profileEmp;
  const content = document.getElementById('content');
  setHeaderTitle(emp.name, (emp.position || '') + (emp.department ? ' · ' + emp.department : ''));
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    const [attendance, leaves] = await Promise.all([
      apiGet('/attendance', { year, month, userId: emp.id }),
      apiGet('/leaves', { userId: emp.id, year, month }),
    ]);

    const todayS      = new Date().toISOString().split('T')[0];
    const monthEnd    = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
    const effectiveEnd = todayS < monthEnd ? todayS : monthEnd;

    const workingDays    = countWorkingDays(year, month, effectiveEnd);
    const approvedLeaves = leaves.filter(l => l.status === 'approved');
    const onLeaveCount   = approvedLeaves.filter(l => l.leave_time === 'full').reduce((s, l) => s + countLeaveDaysInMonth(l, year, month, effectiveEnd), 0);
    const halfDayCount   = approvedLeaves.filter(l => l.leave_time === 'half').reduce((s, l) => s + countLeaveDaysInMonth(l, year, month, effectiveEnd), 0);
    const wfhCount       = approvedLeaves.filter(l => l.leave_time === 'wfh').reduce((s, l) => s + countLeaveDaysInMonth(l, year, month, effectiveEnd), 0);
    const lateCount      = attendance.filter(r => r.is_late).length;
    const absentCount    = attendance.filter(r => r.status === 'absent').length;
    const presentCount   = Math.max(0, workingDays - onLeaveCount - absentCount);
    const monthValue     = `${year}-${String(month).padStart(2,'0')}`;

    const statusPillColors = { approved: 'bg-primary/10 text-primary', pending: 'bg-secondary/10 text-secondary', rejected: 'bg-error/10 text-error', cancelled: 'bg-outline/10 text-outline' };

    const absentRows = attendance
      .filter(r => r.status === 'absent')
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => `
        <tr class="hover:bg-surface-container/30 transition-colors">
          <td class="px-lg py-4">
            <div class="flex items-center gap-sm">
              <span class="material-symbols-outlined text-[16px] text-error">event_busy</span>
              <span class="text-body-md text-on-surface font-medium">Absent</span>
            </div>
          </td>
          <td class="px-lg py-4 text-body-md text-on-surface-variant">${fmtDate(r.date)}</td>
          <td class="px-lg py-4 text-body-md text-on-surface-variant">—</td>
          <td class="px-lg py-4"><span class="inline-flex items-center px-sm py-xs rounded-full text-label-sm font-medium bg-error/10 text-error">Absent</span></td>
          <td class="px-lg py-4 text-body-md text-on-surface-variant">—</td>
        </tr>`).join('');

    const leaveRows = leaves.map(l => {
      const timeLabel = l.leave_time === 'half'
        ? (l.half_type === 'second_half' ? 'Second Half' : 'First Half')
        : l.leave_time === 'wfh' ? 'WFH' : 'Full Day';
      const statusColors = statusPillColors[l.status] || 'bg-outline/10 text-outline';
      return `
        <tr class="hover:bg-surface-container/30 transition-colors">
          <td class="px-lg py-4">
            <div class="flex flex-col gap-xs">
              <span class="text-body-md font-medium text-on-surface capitalize">${l.leave_type}</span>
              <span class="text-label-sm text-on-surface-variant">${timeLabel}</span>
              ${l.reason ? `<span class="text-label-sm text-on-surface-variant italic">"${l.reason}"</span>` : ''}
            </div>
          </td>
          <td class="px-lg py-4 text-body-md text-on-surface-variant">${fmtDate(l.start_date)}</td>
          <td class="px-lg py-4 text-body-md text-on-surface-variant">${fmtDate(l.end_date)}</td>
          <td class="px-lg py-4"><span class="inline-flex items-center px-sm py-xs rounded-full text-label-sm font-medium ${statusColors} capitalize">${l.status}</span></td>
          <td class="px-lg py-4 text-label-sm text-on-surface-variant">${l.approver_name || '—'}</td>
        </tr>`;
    }).join('') + absentRows;

    const emptyLeaves = leaves.length === 0 && absentCount === 0
      ? `<tr><td colspan="5" class="px-lg py-2xl text-center text-on-surface-variant">No leave records for ${MONTHS[month-1]} ${year}</td></tr>`
      : '';

    const statCards = [
      { label: 'Present Days',  value: presentCount,  icon: 'check_circle',  color: 'text-primary',   bg: 'bg-primary/10'   },
      { label: 'Leave Days',    value: onLeaveCount,  icon: 'event_busy',    color: 'text-secondary', bg: 'bg-secondary/10' },
      { label: 'Absent Days',   value: absentCount,   icon: 'cancel',        color: 'text-error',     bg: 'bg-error/10'     },
      { label: 'Half Days',     value: halfDayCount,  icon: 'brightness_half', color: 'text-tertiary', bg: 'bg-tertiary/10'  },
      { label: 'WFH Days',      value: wfhCount,      icon: 'home_work',     color: 'text-primary',   bg: 'bg-primary-container/10' },
      { label: 'Late Entries',  value: lateCount,     icon: 'schedule',      color: 'text-[#ea580c]', bg: 'bg-[#ea580c]/10' },
    ].map(s => `
      <div class="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant/30 shadow-sm flex items-center gap-md">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center ${s.bg} flex-shrink-0">
          <span class="material-symbols-outlined text-[20px] ${s.color}">${s.icon}</span>
        </div>
        <div>
          <p class="text-label-sm text-on-surface-variant">${s.label}</p>
          <p class="text-headline-sm font-bold text-on-surface">${s.value}</p>
        </div>
      </div>`).join('');

    content.innerHTML = `
      <div class="p-lg max-w-container-max mx-auto w-full space-y-xl">

        <!-- Profile Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-md">
          <div class="flex items-center gap-md">
            <button class="flex items-center gap-xs text-on-surface-variant hover:text-primary transition-colors text-label-md font-medium" onclick="loadEmployees()">
              <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back
            </button>
            <div class="w-12 h-12 rounded-full flex items-center justify-center text-[13px] font-bold text-on-primary flex-shrink-0" style="background:${emp.avatar_color||'#4f46e5'}">${initials(emp.name)}</div>
            <div>
              <h1 class="text-title-lg font-semibold text-on-surface">${emp.name}</h1>
              <p class="text-label-md text-on-surface-variant">${emp.position || ''}${emp.department ? ' · ' + emp.department : ''}</p>
            </div>
          </div>
          <input type="month" class="form-control" style="width:auto"
            value="${monthValue}" onchange="renderEmployeeProfile(...this.value.split('-').map(Number))">
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-lg">
          ${statCards}
        </div>

        <!-- Leave Records Table -->
        <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant/20 flex items-center justify-between">
            <h2 class="text-title-sm font-semibold text-on-surface">Leave Records — ${MONTHS[month-1]} ${year}</h2>
          </div>
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low">
                <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Leave Type</th>
                <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">From</th>
                <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">To</th>
                <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Status</th>
                <th class="px-lg py-4 text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Approved By</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/20">
              ${leaveRows || emptyLeaves}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="p-lg"><p class="text-error">${err.message}</p></div>`;
  }
}

function countWorkingDays(year, month, maxDate) {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  const cap  = maxDate ? new Date(maxDate + 'T23:59:59') : null;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    if (cap && date > cap) break;
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function countLeaveDaysInMonth(leave, year, month, maxDate) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = maxDate ? new Date(maxDate + 'T23:59:59') : new Date(year, month, 0);
  const start = new Date(Math.max(new Date(leave.start_date + 'T12:00:00'), monthStart));
  const end   = new Date(Math.min(new Date(leave.end_date   + 'T12:00:00'), monthEnd));
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ── Add / Edit Employee Modals ────────────────────────────────────────────────
function openAddEmployeeModal() {
  const colors = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#F97316','#06B6D4','#EC4899'];
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Employee</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-control" id="emp-name" placeholder="John Doe" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" type="email" id="emp-email" placeholder="john@company.com" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-control" type="password" id="emp-password" placeholder="Min 6 characters" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Department</label>
          <input class="form-control" id="emp-dept" placeholder="Engineering" />
        </div>
        <div class="form-group">
          <label class="form-label">Position</label>
          <input class="form-control" id="emp-pos" placeholder="Developer" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-control" id="emp-role">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Avatar Color</label>
          <select class="form-control" id="emp-color">
            ${colors.map(c => `<option value="${c}" style="background:${c};color:#fff">${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Date of Birth <span style="font-size:.75rem;color:var(--text-muted)">(for birthday reminders)</span></label>
        <input type="date" class="form-control" id="emp-dob" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddEmployee()">Add Employee</button>
    </div>`);
}

async function submitAddEmployee() {
  try {
    await apiPost('/employees', {
      name:          document.getElementById('emp-name').value,
      email:         document.getElementById('emp-email').value,
      password:      document.getElementById('emp-password').value,
      department:    document.getElementById('emp-dept').value || 'General',
      position:      document.getElementById('emp-pos').value  || 'Staff',
      role:          document.getElementById('emp-role').value,
      avatar_color:  document.getElementById('emp-color').value,
      date_of_birth: document.getElementById('emp-dob')?.value || null,
    });
    toast('Employee added!', 'success');
    closeModal();
    loadEmployees();
  } catch (err) { toast(err.message, 'error'); }
}

function openEditEmployeeModal(u) {
  const colors = ['#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#F97316','#06B6D4','#EC4899'];
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit Employee</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-control" id="ee-name" value="${u.name}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-control" type="email" id="ee-email" value="${u.email}" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">New Password (leave blank to keep current)</label>
        <input class="form-control" type="password" id="ee-password" placeholder="Leave blank to keep" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Department</label>
          <input class="form-control" id="ee-dept" value="${u.department||''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Position</label>
          <input class="form-control" id="ee-pos" value="${u.position||''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-control" id="ee-role">
            <option value="employee" ${u.role==='employee'?'selected':''}>Employee</option>
            <option value="admin"    ${u.role==='admin'   ?'selected':''}>Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Avatar Color</label>
          <select class="form-control" id="ee-color">
            ${colors.map(c => `<option value="${c}" ${c===u.avatar_color?'selected':''} style="background:${c};color:#fff">${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Date of Birth <span style="font-size:.75rem;color:var(--text-muted)">(for birthday reminders)</span></label>
        <input type="date" class="form-control" id="ee-dob" value="${u.date_of_birth||''}" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditEmployee(${u.id})">Save Changes</button>
    </div>`);
}

async function submitEditEmployee(id) {
  try {
    const body = {
      name:          document.getElementById('ee-name').value,
      email:         document.getElementById('ee-email').value,
      department:    document.getElementById('ee-dept').value,
      position:      document.getElementById('ee-pos').value,
      role:          document.getElementById('ee-role').value,
      avatar_color:  document.getElementById('ee-color').value,
      date_of_birth: document.getElementById('ee-dob')?.value || null,
    };
    const pw = document.getElementById('ee-password').value;
    if (pw) body.password = pw;
    await apiPut(`/employees/${id}`, body);
    toast('Employee updated!', 'success');
    closeModal();
    loadEmployees();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete ${name}? This will also remove all their attendance records.`)) return;
  try {
    await apiDelete(`/employees/${id}`);
    toast(`${name} deleted`, 'warning');
    loadEmployees();
  } catch (err) { toast(err.message, 'error'); }
}
