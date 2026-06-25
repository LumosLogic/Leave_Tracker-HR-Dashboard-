import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Building2, Mail, UserCheck, Umbrella, XCircle, Clock, Home, AlarmClock, CheckCircle2, Users, Eye, EyeOff, Timer, Play, Square, ChevronDown, ChevronUp, Coffee, CalendarDays, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Avatar } from '@/components/ui/Avatar';
import { RoleBadge, StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import {
  fmtDate, fmtDateRange,
  countWorkingDaysInRange, countLeaveDaysInRange,
  MONTHS,
} from '@/lib/utils';

const AVATAR_COLORS = ['#3525cd','#10B981','#F59E0B','#EF4444','#712ae2','#F97316','#4f46e5','#EC4899'];

// ── Clockify Day Timeline ──────────────────────────────────────────────────────
function AttendanceDayTimeline({ empId, date, totalHours }) {
  const [open,    setOpen]    = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    if (!loaded.current) {
      setLoading(true);
      try {
        const { entries: e } = await apiGet('/clockify/user-entries', { userId: empId, date });
        setEntries(e || []);
        loaded.current = true;
      } catch { setEntries([]); }
      finally { setLoading(false); }
    }
    setOpen(true);
  }

  // Build timeline: alternate work sessions and breaks
  const timeline = [];
  entries.forEach((e, i) => {
    timeline.push({ type: 'work', start: e.start, end: e.end, durationMin: e.durationMin, desc: e.description });
    if (i < entries.length - 1 && e.end) {
      const [eh, em] = e.end.split(':').map(Number);
      const [nh, nm] = entries[i + 1].start.split(':').map(Number);
      const breakMin = (nh * 60 + nm) - (eh * 60 + em);
      if (breakMin > 0) timeline.push({ type: 'break', durationMin: breakMin, start: e.end, end: entries[i + 1].start });
    }
  });

  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`.trim() : `${m}m`;

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[0.72rem] font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors"
      >
        {loading
          ? <><Loader2 size={12} className="animate-spin" /> Loading timeline…</>
          : open
            ? <><ChevronUp size={12} /> Hide Timeline</>
            : <><ChevronDown size={12} /> <Timer size={12} /> View Clockify Timeline</>
        }
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-[#c7c4d8] overflow-hidden bg-white">
          {entries.length === 0 ? (
            <div className="px-4 py-4 text-xs text-[#777587] text-center italic">
              No Clockify entries found — employee may have used manual check-in/out.
            </div>
          ) : (
            <>
              {/* Timeline rows */}
              <div className="p-4 space-y-0">
                {timeline.map((item, i) => (
                  item.type === 'work' ? (
                    <div key={i} className="flex gap-3">
                      {/* Timeline spine */}
                      <div className="flex flex-col items-center w-6 flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center flex-shrink-0">
                          <Play size={9} className="text-emerald-600 ml-0.5" />
                        </div>
                        {i < timeline.length - 1 && (
                          <div className="w-0.5 flex-1 bg-[#e7eefe] my-0.5 min-h-[28px]" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-black text-[#151c27]">{item.start}</span>
                          {item.end && (
                            <span className="text-xs text-[#777587]">→ {item.end}</span>
                          )}
                          {!item.end && (
                            <span className="text-[0.65rem] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                              Live
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.durationMin > 0 && (
                            <span className="text-[0.7rem] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              {fmtMin(item.durationMin)} worked
                            </span>
                          )}
                          {item.desc && (
                            <span className="text-[0.68rem] text-[#777587] truncate">{item.desc}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      {/* Spine for break */}
                      <div className="flex flex-col items-center w-6 flex-shrink-0">
                        <div className="w-0.5 flex-1 bg-[#e7eefe] my-0" style={{ minHeight: 8 }} />
                        <div className="w-6 h-6 rounded-full bg-amber-50 border-2 border-amber-300 flex items-center justify-center flex-shrink-0">
                          <Coffee size={9} className="text-amber-600" />
                        </div>
                        <div className="w-0.5 flex-1 bg-[#e7eefe] my-0" style={{ minHeight: 8 }} />
                      </div>
                      {/* Break content */}
                      <div className="py-1 flex items-center flex-1 min-w-0">
                        <span className="text-[0.7rem] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <Coffee size={9} /> Break: {fmtMin(item.durationMin)}
                          {item.start && item.end && (
                            <span className="font-normal text-amber-500 ml-0.5">({item.start} – {item.end})</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )
                ))}

                {/* Final stop dot */}
                {entries.length > 0 && entries[entries.length - 1].end && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center w-6 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-rose-100 border-2 border-rose-400 flex items-center justify-center flex-shrink-0">
                        <Square size={8} className="text-rose-600" />
                      </div>
                    </div>
                    <div className="flex items-center pb-1">
                      <span className="text-sm font-black text-[#151c27]">{entries[entries.length - 1].end}</span>
                      <span className="text-xs text-[#777587] ml-2">End of day</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary footer */}
              <div className="border-t border-[#f0f3ff] px-4 py-3 flex items-center justify-between bg-[#f9f9ff]">
                <div className="flex items-center gap-3 text-[0.72rem] text-[#777587]">
                  <span className="flex items-center gap-1"><Play size={10} className="text-emerald-500" /> {entries.length} session{entries.length !== 1 ? 's' : ''}</span>
                  {timeline.filter(t => t.type === 'break').length > 0 && (
                    <span className="flex items-center gap-1">
                      <Coffee size={10} className="text-amber-500" />
                      {fmtMin(timeline.filter(t => t.type === 'break').reduce((s, b) => s + b.durationMin, 0))} break
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Timer size={13} className="text-[#3525cd]" />
                  <span className="text-sm font-black text-[#3525cd]">
                    {totalHours ? `${totalHours}h total` : fmtMin(entries.reduce((s, e) => s + (e.durationMin || 0), 0))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Employee Profile ──────────────────────────────────────────────────────────
function EmployeeProfile({ emp, onBack }) {
  const now = new Date();
  const [viewMode,    setViewMode]    = useState('monthly');
  const [year,        setYear]        = useState(now.getFullYear());
  const [month,       setMonth]       = useState(now.getMonth() + 1);
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [recordsTab,  setRecordsTab]  = useState('attendance');

  const today      = now.toISOString().split('T')[0];
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  const isCustomReady = viewMode !== 'custom' || (!!customStart && !!customEnd && customStart <= customEnd);

  const attParams = viewMode === 'monthly' ? { year, month, userId: emp.id }
                  : viewMode === 'yearly'  ? { year, userId: emp.id }
                  : { startDate: customStart, endDate: customEnd, userId: emp.id };
  const lvParams  = viewMode === 'monthly' ? { userId: emp.id, year, month }
                  : viewMode === 'yearly'  ? { userId: emp.id, year }
                  : { userId: emp.id, startDate: customStart, endDate: customEnd };

  const { data: attendance = [] } = useQuery({
    queryKey: ['emp-att', emp.id, viewMode, year, month, customStart, customEnd],
    queryFn:  () => apiGet('/attendance', attParams),
    enabled:  isCustomReady,
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ['emp-leaves', emp.id, viewMode, year, month, customStart, customEnd],
    queryFn:  () => apiGet('/leaves', lvParams),
    enabled:  isCustomReady,
  });

  // Compute range boundaries
  let rangeStart, rangeEnd;
  if (viewMode === 'monthly') {
    rangeStart = `${year}-${String(month).padStart(2,'0')}-01`;
    rangeEnd   = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
  } else if (viewMode === 'yearly') {
    rangeStart = `${year}-01-01`;
    rangeEnd   = `${year}-12-31`;
  } else {
    rangeStart = customStart || today;
    rangeEnd   = customEnd   || today;
  }
  const effectiveEnd = today < rangeEnd ? today : rangeEnd;

  const workingDays  = isCustomReady ? countWorkingDaysInRange(rangeStart, effectiveEnd) : 0;
  const approved     = leaves.filter(l => l.status === 'approved');
  const onLeaveCount = approved.filter(l => l.leave_time === 'full').reduce((s, l) => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const halfDayCount = approved.filter(l => l.leave_time === 'half').reduce((s, l) => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const wfhCount     = approved.filter(l => l.leave_time === 'wfh').reduce((s, l)  => s + countLeaveDaysInRange(l, rangeStart, effectiveEnd), 0);
  const lateCount    = attendance.filter(r => r.is_late).length;
  const absentCount  = attendance.filter(r => r.status === 'absent').length;
  const presentCount = Math.max(0, workingDays - onLeaveCount - absentCount);

  const periodLabel = viewMode === 'monthly' ? `${MONTHS[month - 1]} ${year}`
                    : viewMode === 'yearly'  ? `${year}`
                    : (customStart && customEnd) ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : '—';

  const stats = [
    { icon: <UserCheck size={18} />, label: 'Present Days',  value: presentCount,  variant: 'success' },
    { icon: <Umbrella size={18} />,  label: 'Leave Days',    value: onLeaveCount,  variant: 'danger'  },
    { icon: <XCircle size={18} />,   label: 'Absent Days',   value: absentCount,   variant: 'danger'  },
    { icon: <Clock size={18} />,     label: 'Half Days',     value: halfDayCount,  variant: 'info'    },
    { icon: <Home size={18} />,      label: 'WFH Days',      value: wfhCount,      variant: 'default' },
    { icon: <AlarmClock size={18} />,label: 'Late Entries',  value: lateCount,     variant: 'warning' },
  ];

  const variantBorder = {
    success: 'border-t-emerald-500',
    danger:  'border-t-rose-500',
    info:    'border-t-blue-500',
    warning: 'border-t-orange-400',
    default: 'border-t-cyan-400',
  };
  const variantIcon = {
    success: 'bg-emerald-50 text-emerald-600',
    danger:  'bg-rose-50 text-rose-600',
    info:    'bg-blue-50 text-blue-600',
    warning: 'bg-orange-50 text-orange-600',
    default: 'bg-cyan-50 text-cyan-700',
  };

  const absentRecords = attendance.filter(r => r.status === 'absent').sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {/* Header */}
      <div className="page-header mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ChevronLeft size={15} /> Back
          </button>
          <Avatar name={emp.name} color={emp.avatar_color} size={48} />
          <div>
            <div className="page-title">{emp.name}</div>
            <div className="page-subtitle">
              {emp.position || ''}{emp.department ? ` · ${emp.department}` : ''}
            </div>
          </div>
        </div>

        {/* View mode toggle + date picker */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-[#f0f3ff] p-1 rounded-xl">
            {['monthly', 'yearly', 'custom'].map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                  viewMode === m
                    ? 'bg-white text-[#3525cd] shadow-sm'
                    : 'text-[#777587] hover:text-[#151c27]'
                }`}>
                {m}
              </button>
            ))}
          </div>

          {viewMode === 'monthly' && (
            <input type="month" className="form-control w-auto" value={monthValue}
              onChange={e => {
                const [y, mo] = e.target.value.split('-').map(Number);
                setYear(y); setMonth(mo);
              }} />
          )}

          {viewMode === 'yearly' && (
            <div className="flex items-center gap-2 bg-white border border-[#c7c4d8] rounded-lg px-3 py-2">
              <button onClick={() => setYear(y => y - 1)} className="text-[#3525cd] hover:text-[#4f46e5]">
                <ChevronLeft size={15} />
              </button>
              <span className="font-bold text-[#151c27] min-w-[3.5rem] text-center">{year}</span>
              <button onClick={() => setYear(y => Math.min(y + 1, now.getFullYear()))}
                className="text-[#3525cd] hover:text-[#4f46e5] disabled:opacity-40"
                disabled={year >= now.getFullYear()}>
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {viewMode === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" className="form-control w-auto" value={customStart}
                max={customEnd || today}
                onChange={e => setCustomStart(e.target.value)} />
              <span className="text-[#777587] text-sm font-medium">to</span>
              <input type="date" className="form-control w-auto" value={customEnd}
                min={customStart} max={today}
                onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Custom mode — waiting for dates */}
      {viewMode === 'custom' && !isCustomReady && (
        <div className="empty-state py-12">
          <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
          <p>Select a start and end date to view leave records</p>
        </div>
      )}

      {isCustomReady && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {stats.map(s => (
              <div key={s.label} className={`card border-t-4 ${variantBorder[s.variant]} p-4`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3 ${variantIcon[s.variant]}`}>{s.icon}</div>
                <div className="text-2xl font-black text-[#151c27]">{s.value}</div>
                <div className="text-xs text-[#464555] mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-[#f0f3ff] border border-[#c7c4d8] p-1 rounded-xl mb-4">
            {[
              { key: 'attendance', label: 'Attendance & Hours', icon: <Timer size={13} /> },
              { key: 'leaves',     label: 'Leaves & Absences',  icon: <Umbrella size={13} /> },
            ].map(t => (
              <button key={t.key} onClick={() => setRecordsTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  recordsTab === t.key ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── Attendance & Hours Tab ── */}
          {recordsTab === 'attendance' && (() => {
            const presentRecords = attendance
              .filter(r => ['present', 'wfh', 'half_day'].includes(r.status))
              .sort((a, b) => b.date.localeCompare(a.date));

            return presentRecords.length === 0 ? (
              <div className="empty-state">
                <CalendarDays size={36} className="mx-auto mb-2 opacity-30" />
                <p>No attendance records for {periodLabel}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {presentRecords.map(r => {
                  const totalHours = r.clockify_hours > 0 ? r.clockify_hours : r.work_hours;
                  const dow = new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <div key={r.id} className="card p-4">
                      {/* Day header row */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-3">
                          {/* Date chip */}
                          <div className="text-center bg-[#f0f3ff] rounded-lg px-2.5 py-1.5 flex-shrink-0">
                            <div className="text-[0.6rem] font-bold text-[#777587] uppercase tracking-widest">{dow}</div>
                            <div className="text-sm font-black text-[#3525cd] leading-tight">{dayNum}</div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={r.status} />
                              {totalHours > 0 && (
                                <span className="flex items-center gap-1 text-xs font-black text-[#3525cd]">
                                  <Timer size={12} /> {totalHours}h
                                </span>
                              )}
                              {r.clockify_hours > 0 && (
                                <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-full bg-[#f0f3ff] text-[#464555] border border-[#c7c4d8]">
                                  Clockify
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Clockify timeline */}
                      <AttendanceDayTimeline
                        empId={emp.id}
                        date={r.date}
                        totalHours={totalHours}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Leaves & Absences Tab ── */}
          {recordsTab === 'leaves' && (
            <div className="flex flex-col gap-3">
              {leaves.length === 0 && absentCount === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 size={36} className="mx-auto mb-2 opacity-30" />
                  <p>No leave records for {periodLabel}</p>
                </div>
              ) : (
                <>
                  {leaves.map(l => (
                    <div key={l.id} className="card p-4 flex items-start gap-3">
                      <Avatar name={emp.name} color={emp.avatar_color} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-[#151c27]">{emp.name}</span>
                          <LeaveTypeBadge type={l.leave_type} />
                          {l.leave_time === 'half' ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#3525cd]">
                              {l.half_type === 'second_half' ? '🌙 Second Half' : '☀️ First Half'}
                            </span>
                          ) : l.leave_time === 'wfh' ? (
                            <StatusBadge status="wfh" />
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f0f3ff] text-[#464555]">Full Day</span>
                          )}
                          <StatusBadge status={l.status} />
                        </div>
                        <div className="text-xs text-[#464555]">{fmtDateRange(l.start_date, l.end_date)}</div>
                        {l.reason && <div className="text-xs text-[#777587] italic mt-1">"{l.reason}"</div>}
                        {l.approver_name && <div className="text-xs text-[#777587] mt-1">By: {l.approver_name}</div>}
                      </div>
                    </div>
                  ))}
                  {absentRecords.map(r => (
                    <div key={r.id} className="card p-4 flex items-start gap-3">
                      <Avatar name={emp.name} color={emp.avatar_color} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-[#151c27]">{emp.name}</span>
                          <StatusBadge status="absent" />
                        </div>
                        <div className="text-xs text-[#464555]">{fmtDate(r.date)}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Add / Edit Employee Modal ─────────────────────────────────────────────────
function EmployeeFormModal({ open, onClose, employee, onSaved, departments = [], defaultRole = 'employee' }) {
  const isEdit      = !!employee;
  const toast       = useToast();
  const { isRootAdmin } = useAuth();
  const qc     = useQueryClient();
  const [showPw, setShowPw] = useState(false);

  // department_ids: list of selected department IDs (multi-select)
  const initDeptIds = isEdit && employee.departments?.length
    ? employee.departments.map(d => d.id)
    : [];

  const [form, setForm] = useState(() => isEdit ? {
    name:           employee.name,
    email:          employee.email,
    password:       '',
    department:     employee.department || '',
    position:       employee.position   || '',
    role:           employee.role,
    avatar_color:   employee.avatar_color || '#3525cd',
    date_of_birth:  employee.date_of_birth || '',
    department_ids: initDeptIds,
  } : {
    name: '', email: '', password: '', department: '', position: '',
    role: defaultRole, avatar_color: '#3525cd', date_of_birth: '', department_ids: [],
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleDept(deptId) {
    setForm(f => {
      const ids = f.department_ids.includes(deptId)
        ? f.department_ids.filter(id => id !== deptId)
        : [...f.department_ids, deptId];
      // Keep department string in sync with first selected dept name (for backward compat)
      const firstName = departments.find(d => d.id === ids[0])?.name || '';
      return { ...f, department_ids: ids, department: firstName };
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body = { ...form };
        if (!body.password) delete body.password;
        return apiPut(`/employees/${employee.id}`, body);
      }
      // On create, just use the primary department string (junction records added on PUT after creation)
      return apiPost('/employees', form);
    },
    onSuccess: () => {
      toast(isEdit ? 'Employee updated!' : 'Employee added!', 'success');
      qc.invalidateQueries({ queryKey: ['employees'] });
      onSaved?.();
      onClose();
    },
    onError: err => toast(err.message, 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Employee' : 'Add Employee'} size="lg" disableOutsideClick
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <span className="flex gap-2 items-center"><span className="spinner w-4 h-4" /> Saving…</span>
              : isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Full Name</label>
            <input className="form-control" placeholder="John Doe" value={form.name}
              onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-control" type="email" placeholder="john@company.com" value={form.email}
              onChange={e => set('email', e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="form-label">
            {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
          </label>
          <div className="relative">
            <input className="form-control pr-10" type={showPw ? 'text' : 'password'}
              placeholder={isEdit ? 'Leave blank to keep' : 'Min 6 characters'}
              value={form.password} onChange={e => set('password', e.target.value)}
              required={!isEdit} />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#151c27] p-1">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="form-label">
            Departments
            <span className="text-xs font-normal text-[#777587] ml-1">(select one or more)</span>
          </label>
          {departments.length === 0 ? (
            <div className="form-control text-[#777587] text-xs py-2">
              No departments found — create departments first from the Departments page.
            </div>
          ) : (
            <div className="border border-[#c7c4d8] rounded-lg p-2 max-h-36 overflow-y-auto bg-white space-y-1">
              {departments.map(d => (
                <label key={d.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#f0f3ff] cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="accent-[#3525cd] w-3.5 h-3.5"
                    checked={form.department_ids.includes(d.id)}
                    onChange={() => toggleDept(d.id)}
                  />
                  <span className="text-sm text-[#151c27] font-medium">{d.name}</span>
                </label>
              ))}
            </div>
          )}
          {form.department_ids.length > 0 && (
            <p className="text-[0.7rem] text-[#777587] mt-1">
              Primary department: <strong className="text-[#3525cd]">{form.department || '—'}</strong>
            </p>
          )}
        </div>

        <div>
          <label className="form-label">Position</label>
          <input className="form-control" placeholder="Developer" value={form.position}
            onChange={e => set('position', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Role</label>
            <select className="form-control" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="employee">Employee</option>
              <option value="admin">HR Admin</option>
              {isRootAdmin && <option value="root_admin">Root Admin</option>}
            </select>
          </div>
          <div>
            <label className="form-label">Avatar Color</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('avatar_color', c)}
                  className="w-7 h-7 rounded-full border-2 flex-shrink-0"
                  style={{
                    background: c,
                    borderColor: form.avatar_color === c ? '#3525cd' : 'transparent',
                    outline: form.avatar_color === c ? '2px solid #BAE6FD' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="form-label">
            Date of Birth <span className="text-xs text-[#777587]">(for birthday reminders)</span>
          </label>
          <input className="form-control" type="date" value={form.date_of_birth}
            onChange={e => set('date_of_birth', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// ── Main Employees Page ───────────────────────────────────────────────────────
export default function Employees() {
  const { user } = useAuth();
  const toast    = useToast();
  const qc       = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const roleFilter     = searchParams.get('role');   // 'employee' | 'admin' | null
  const actionParam    = searchParams.get('action'); // 'addHR' | null

  const [profileEmp,     setProfileEmp]     = useState(null);
  const [addOpen,        setAddOpen]        = useState(false);
  const [addDefaultRole, setAddDefaultRole] = useState('employee');
  const [editEmp,        setEditEmp]        = useState(null);
  const [confirmDel,     setConfirmDel]     = useState(null); // { id, name }

  // Auto-open Add modal when navigated here with ?action=addHR
  useEffect(() => {
    if (actionParam === 'addHR') {
      setAddDefaultRole('admin');
      setAddOpen(true);
      setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('action'); return n; }, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam]);

  const { data: allEmployees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn:  () => apiGet('/employees'),
  });

  // Filter by role when a role query param is present
  const employees = roleFilter
    ? allEmployees.filter(e => e.role === roleFilter)
    : allEmployees;

  const { data: _dData = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => apiGet('/departments'),
  });
  const departments = Array.isArray(_dData) ? _dData : [];

  const deleteMut = useMutation({
    mutationFn: id => apiDelete(`/employees/${id}`),
    onSuccess: (_, id) => {
      const name = employees.find(e => e.id === id)?.name || 'Employee';
      toast(`${name} deleted`, 'warning');
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: err => toast(err.message, 'error'),
  });

  function handleDelete(emp) {
    setConfirmDel({ id: emp.id, name: emp.name });
  }

  if (profileEmp) {
    return <EmployeeProfile emp={profileEmp} onBack={() => setProfileEmp(null)} />;
  }

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <div className="page-title flex items-center gap-2">
            Team Members
            {roleFilter && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-[#f0f3ff] text-[#3525cd] border-[#c7c4d8] normal-case tracking-normal">
                {roleFilter === 'admin' ? 'HR Admins only' : 'Employees only'}
              </span>
            )}
          </div>
          <div className="page-subtitle flex items-center gap-2">
            {employees.length} member{employees.length !== 1 ? 's' : ''}
            {roleFilter && (
              <button
                onClick={() => setSearchParams({}, { replace: true })}
                className="text-xs text-[#3525cd] hover:underline font-semibold">
                Clear filter
              </button>
            )}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setAddDefaultRole('employee'); setAddOpen(true); }}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" /> Loading…</div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          <p>No employees found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {employees.map(emp => (
            <div
              key={emp.id}
              className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm flex flex-col overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md hover:border-[#3525cd]/40 hover:-translate-y-0.5"
              onClick={() => setProfileEmp(emp)}
            >
              {/* Card header with avatar */}
              <div className="bg-gradient-to-br from-[#f0f3ff] to-[#e7eefe] px-5 pt-5 pb-4 flex items-center gap-3.5">
                <Avatar name={emp.name} color={emp.avatar_color} size={52} className="ring-2 ring-white shadow-sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[#151c27] text-sm leading-tight truncate">{emp.name}</div>
                  <div className="text-xs font-medium text-[#464555] truncate mt-0.5">{emp.position || '—'}</div>
                  <RoleBadge role={emp.role} className="mt-1.5" />
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-3.5 space-y-2 flex-1">
                {(emp.departments?.length > 0 || emp.department) && (
                  <div className="flex items-start gap-2">
                    <Building2 size={13} className="text-[#3525cd] flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {emp.departments?.length > 0
                        ? emp.departments.map(d => (
                            <span key={d.id} className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded-md bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]">
                              {d.name}
                            </span>
                          ))
                        : <span className="text-xs font-semibold text-[#151c27] truncate">{emp.department}</span>
                      }
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-[#3525cd] flex-shrink-0" />
                  <span className="text-xs text-[#464555] truncate">{emp.email}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-[#e7eefe] bg-[#f9f9ff]" onClick={e => e.stopPropagation()}>
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold text-[#3525cd] bg-white border border-[#c7c4d8] hover:bg-[#f0f3ff] hover:border-[#3525cd]/50 transition-all"
                  onClick={() => setEditEmp(emp)}>
                  <Pencil size={12} /> Edit
                </button>
                {emp.id !== user?.id && (
                  <button
                    className="flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all disabled:opacity-40"
                    onClick={() => handleDelete(emp)}
                    disabled={deleteMut.isPending}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <EmployeeFormModal open={addOpen} onClose={() => { setAddOpen(false); setAddDefaultRole('employee'); }} departments={departments} defaultRole={addDefaultRole} />
      )}
      {editEmp && (
        <EmployeeFormModal open={!!editEmp} onClose={() => setEditEmp(null)} employee={editEmp} departments={departments} />
      )}
      <ConfirmModal
        open={!!confirmDel}
        title="Delete Employee"
        message={`Delete ${confirmDel?.name}? This will also remove all their attendance and leave records.`}
        confirmLabel="Delete"
        onConfirm={() => { deleteMut.mutate(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
