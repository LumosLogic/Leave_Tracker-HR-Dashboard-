'use strict';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  if (loadAuth()) {
    try {
      const me   = await apiGet('/auth/me');
      state.user = { ...state.user, ...me };
      navigate('dashboard');
    } catch {
      logout();
    }
  } else {
    navigate('login');
  }
}

// All functions are already global (plain script files, no modules).
// The window.* assignments below ensure inline onclick= attributes
// in dynamically generated HTML can always resolve the functions.
window.doCheckIn          = doCheckIn;
window.doCheckOut         = doCheckOut;
window.navigate           = navigate;
window.setDashboardDate   = setDashboardDate;
window.logout             = logout;
window.closeModal         = closeModal;
window.openDayModal       = openDayModal;
window.calNavPrev         = calNavPrev;
window.calNavNext         = calNavNext;
window.calToday           = calToday;
window.setCalMode         = setCalMode;
window.syncClockifyDay    = syncClockifyDay;
window.openEditAttModal   = openEditAttModal;
window.submitEditAtt      = submitEditAtt;
window.markAbsentInModal  = markAbsentInModal;
window.openManageHolidaysModal = openManageHolidaysModal;
window.submitAddHoliday        = submitAddHoliday;
window.deleteHoliday           = deleteHoliday;
window.openManageEventsModal   = openManageEventsModal;
window.submitAddEvent          = submitAddEvent;
window.deleteEvent             = deleteEvent;
window.stopClockifyLive        = stopClockifyLive;
window.openApplyLeaveModal     = openApplyLeaveModal;
window.onLeaveTimeChange       = onLeaveTimeChange;
window.onQLLeaveTimeChange     = onQLLeaveTimeChange;
window.openEditLeaveModal      = openEditLeaveModal;
window.submitEditLeave         = submitEditLeave;
window.onEditLeaveTimeChange   = onEditLeaveTimeChange;
window.onLeavesDateFilter      = onLeavesDateFilter;
window.deleteLeave             = deleteLeave;
window.openLateEarlyModal      = openLateEarlyModal;
window.submitLateEarly         = submitLateEarly;
window.onLateSelectChange      = onLateSelectChange;
window.onEarlySelectChange     = onEarlySelectChange;
window.openEditLateEarlyModal  = openEditLateEarlyModal;
window.submitEditLateEarly     = submitEditLateEarly;
window.deleteLateEarlyRecord   = deleteLateEarlyRecord;
window.onEditLateSelectChange  = onEditLateSelectChange;
window.onEditEarlySelectChange = onEditEarlySelectChange;
window.addAnotherLeaveForm     = addAnotherLeaveForm;
window.removeLeaveForm         = removeLeaveForm;
window.submitAllLeaves         = submitAllLeaves;
window.submitQuickLeave        = submitQuickLeave;
window.setLeavesTab            = setLeavesTab;
window.approveLeave            = approveLeave;
window.rejectLeave             = rejectLeave;
window.cancelLeave             = cancelLeave;
window.openAddEmployeeModal    = openAddEmployeeModal;
window.openEmployeeProfile     = openEmployeeProfile;
window.renderEmployeeProfile   = renderEmployeeProfile;
window.submitAddEmployee       = submitAddEmployee;
window.openEditEmployeeModal   = openEditEmployeeModal;
window.submitEditEmployee      = submitEditEmployee;
window.deleteEmployee          = deleteEmployee;
window.saveScheduleSettings    = saveScheduleSettings;
window.saveClockifySettings    = saveClockifySettings;
window.testClockifyConnection  = testClockifyConnection;
window.syncClockifyToday       = syncClockifyToday;
window.toggleDarkMode          = toggleDarkMode;
window.toggleSidebar           = toggleSidebar;
window.closeSidebar            = closeSidebar;

// Boot
initDarkMode();
init();
