// =============================================
// CANONICAL DATE FUNCTION - Single Source of Truth
// =============================================
/**
 * Returns today's date in YYYY-MM-DD format in the user's local timezone.
 * This is the ONLY function that should be used to get "today" throughout the app.
 * Prevents timezone inconsistencies (Feb 8 vs Feb 9 issues).
 */
function getTodayLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            clearTimeout(timeout);
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Performance optimization: Memoization cache
const memoCache = {
    formatDate: new Map(),
    workingDays: new Map()
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (memoCache.formatDate.has(dateStr)) {
        return memoCache.formatDate.get(dateStr);
    }
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    memoCache.formatDate.set(dateStr, formatted);
    return formatted;
}

function getDaysBetween(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate - startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

function getWorkingDays(start, end) {
    const cacheKey = `${start}-${end}`;
    if (memoCache.workingDays.has(cacheKey)) {
        return memoCache.workingDays.get(cacheKey);
    }
    
    let count = 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) { // Not Sunday or Saturday
            count++;
        }
    }
    memoCache.workingDays.set(cacheKey, count);
    return count;
}

// =============================================
// SPRINT-BASED BANDWIDTH CALCULATION
// =============================================
// FORMULA:
//   Sprint Working Days = count(working days between sprint start & end)
//   Hours Per Working Day = bandwidth_hours_per_week / 5
//   Total Sprint Hours = Hours Per Working Day × Sprint Working Days
// =============================================

const HOURS_PER_WORK_DAY = 8; // Standard work day
const WORK_DAYS_PER_WEEK = 5;

/**
 * Calculate sprint-based bandwidth for a team member
 * @param {number} weeklyBandwidthHours - Weekly bandwidth (e.g., 40)
 * @param {string} sprintStart - Sprint start date
 * @param {string} sprintEnd - Sprint end date
 * @returns {object} { sprintWorkingDays, hoursPerDay, totalSprintHours }
 */
function calculateSprintBandwidth(weeklyBandwidthHours, sprintStart, sprintEnd) {
    const sprintWorkingDays = getWorkingDays(sprintStart, sprintEnd);
    const hoursPerDay = weeklyBandwidthHours / WORK_DAYS_PER_WEEK;
    const totalSprintHours = hoursPerDay * sprintWorkingDays;
    
    return {
        sprintWorkingDays,
        hoursPerDay,
        totalSprintHours: Math.round(totalSprintHours * 10) / 10 // Round to 1 decimal
    };
}

/**
 * Get total team sprint capacity
 * @returns {object} { totalSprintHours, sprintWorkingDays, memberCapacities[] }
 */
function getTeamSprintCapacity() {
    if (!appData.project || !appData.teamMembers) {
        return { totalSprintHours: 0, sprintWorkingDays: 0, memberCapacities: [] };
    }
    
    const sprintWorkingDays = getWorkingDays(appData.project.startDate, appData.project.endDate);
    
    const memberCapacities = appData.teamMembers.map(member => {
        const weeklyHours = member.bandwidthHours ?? 40;
        const bandwidth = calculateSprintBandwidth(
            weeklyHours,
            appData.project.startDate,
            appData.project.endDate
        );
        return {
            id: member.id,
            name: member.name,
            weeklyHours,
            ...bandwidth
        };
    });
    
    const totalSprintHours = memberCapacities.reduce((sum, m) => sum + m.totalSprintHours, 0);
    
    return {
        totalSprintHours: Math.round(totalSprintHours * 10) / 10,
        sprintWorkingDays,
        memberCapacities
    };
}

// =============================================
// SPRINT TIME STATE - REMAINING DAYS CALCULATION
// =============================================

/**
 * Get comprehensive sprint time state
 * Calculates total, elapsed, and remaining working days
 * @returns {object} Sprint time state with all relevant metrics
 */
function getSprintTimeState() {
    if (!appData.project || !appData.project.startDate || !appData.project.endDate) {
        return {
            isValid: false,
            error: 'Sprint dates not configured',
            totalWorkingDays: 0,
            elapsedWorkingDays: 0,
            remainingWorkingDays: 0,
            isComplete: false,
            isNotStarted: false,
            today: getTodayLocalDate(),
            sprintStart: null,
            sprintEnd: null,
            currentDay: 0
        };
    }
    
    // Use canonical today function
    const todayStr = getTodayLocalDate();
    const today = new Date(todayStr + 'T00:00:00');
    
    const sprintStart = new Date(appData.project.startDate + 'T00:00:00');
    const sprintEnd = new Date(appData.project.endDate + 'T00:00:00');
    
    const totalWorkingDays = getWorkingDays(appData.project.startDate, appData.project.endDate);
    
    // Determine sprint state
    const isNotStarted = today < sprintStart;
    const isComplete = today > sprintEnd;
    
    let elapsedWorkingDays = 0;
    let remainingWorkingDays = 0;
    let currentDay = 0;
    
    if (isNotStarted) {
        // Sprint hasn't started yet
        remainingWorkingDays = totalWorkingDays;
        currentDay = 0;
    } else if (isComplete) {
        // Sprint has ended
        elapsedWorkingDays = totalWorkingDays;
        remainingWorkingDays = 0;
        currentDay = totalWorkingDays;
    } else {
        // Sprint is active
        // Elapsed = start to yesterday (or today if today is a working day, count through today)
        elapsedWorkingDays = getWorkingDays(appData.project.startDate, todayStr);
        // Remaining = tomorrow to end (if today is workday, it's "in progress", remaining is after today)
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        
        if (tomorrow <= sprintEnd) {
            remainingWorkingDays = getWorkingDays(tomorrowStr, appData.project.endDate);
        } else {
            remainingWorkingDays = 0;
        }
        currentDay = elapsedWorkingDays;
    }
    
    return {
        isValid: true,
        error: null,
        totalWorkingDays,
        elapsedWorkingDays,
        remainingWorkingDays,
        isComplete,
        isNotStarted,
        today: todayStr,
        sprintStart: appData.project.startDate,
        sprintEnd: appData.project.endDate,
        currentDay,
        progressPercent: totalWorkingDays > 0 ? Math.round((elapsedWorkingDays / totalWorkingDays) * 100) : 0
    };
}

/**
 * Calculate REMAINING sprint bandwidth (not total)
 * This is what's actually available for NEW work
 * @param {object} member - Team member object
 * @returns {number} Remaining hours available for this member
 */
function getRemainingSprintBandwidth(member) {
    const timeState = getSprintTimeState();
    if (!timeState.isValid || timeState.isComplete) return 0;
    
    const weeklyHours = member.bandwidthHours ?? 40;
    const hoursPerDay = weeklyHours / WORK_DAYS_PER_WEEK;
    return Math.round(hoursPerDay * timeState.remainingWorkingDays * 10) / 10;
}

/**
 * Get total team REMAINING bandwidth
 * @returns {number} Total remaining hours for all team members
 */
function getTeamRemainingBandwidth() {
    if (!appData.teamMembers) return 0;
    return appData.teamMembers.reduce((sum, member) => sum + getRemainingSprintBandwidth(member), 0);
}

// =============================================
// WRAPPER FUNCTIONS FOR BACKWARD COMPATIBILITY
// These are called by existing code
// =============================================

/**
 * Get total sprint working days
 * WRAPPER: Calls getSprintTimeState() internally
 */
function getSprintWorkingDays() {
    const timeState = getSprintTimeState();
    return timeState.totalWorkingDays;
}

/**
 * Get sprint bandwidth for a single member (TOTAL sprint, not remaining)
 * WRAPPER: Uses calculateSprintBandwidth internally
 * @param {object} member - Team member
 * @returns {number} Total sprint hours for this member
 */
function getSprintBandwidth(member) {
    if (!appData.project) return 0;
    const weeklyHours = member.bandwidthHours ?? 40;
    const result = calculateSprintBandwidth(weeklyHours, appData.project.startDate, appData.project.endDate);
    return result.totalSprintHours;
}

/**
 * Get total team sprint bandwidth (TOTAL sprint, not remaining)
 * WRAPPER: Sums individual member bandwidth
 * @returns {number} Total team sprint hours
 */
function getTeamSprintBandwidth() {
    if (!appData.teamMembers) return 0;
    return appData.teamMembers.reduce((sum, member) => sum + getSprintBandwidth(member), 0);
}

/**
 * Calculate next available day for a member
 * Finds first future working day with >= minFreeHours capacity
 * @param {object} member - Team member
 * @param {number} minFreeHours - Minimum free hours required (default: 4)
 * @returns {object} { date, freeHours } or null if no availability
 */
function getNextAvailableDay(member, minFreeHours = 4) {
    const timeState = getSprintTimeState();
    if (!timeState.isValid || timeState.isComplete) return null;
    
    const weeklyHours = member.bandwidthHours ?? 40;
    const hoursPerDay = weeklyHours / WORK_DAYS_PER_WEEK;
    
    // Get tasks assigned to this member with dates
    const memberTasks = (appData.tasks || []).filter(t => t.owner === member.id && t.startDate && t.endDate);
    
    // Build daily allocation map
    const dailyAllocation = {};
    memberTasks.forEach(task => {
        const taskDays = getWorkingDays(task.startDate, task.endDate);
        if (taskDays <= 0) return;
        const hoursPerTaskDay = (task.estimatedHours || 0) / taskDays;
        
        const dates = generateDateRange(task.startDate, task.endDate);
        dates.forEach(date => {
            if (!isWeekend(date)) {
                dailyAllocation[date] = (dailyAllocation[date] || 0) + hoursPerTaskDay;
            }
        });
    });
    
    // Find first future working day with sufficient free time
    const today = new Date(timeState.today + 'T00:00:00');
    const sprintEnd = new Date(timeState.sprintEnd + 'T00:00:00');
    
    for (let d = new Date(today); d <= sprintEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (isWeekend(dateStr)) continue;
        
        const allocated = dailyAllocation[dateStr] || 0;
        const freeHours = Math.max(0, hoursPerDay - allocated);
        
        if (freeHours >= minFreeHours) {
            return {
                date: dateStr,
                freeHours: Math.round(freeHours * 10) / 10
            };
        }
    }
    
    return null; // No availability this sprint
}

/**
 * Get allocated hours per member from tasks
 * @returns {object} Map of memberId -> allocatedHours
 */
function getAllocatedHoursByMember() {
    const allocation = {};
    
    if (!appData.tasks) return allocation;
    
    appData.tasks.forEach(task => {
        const owner = task.owner || 'unassigned';
        const hours = task.estimatedHours || 0;
        allocation[owner] = (allocation[owner] || 0) + hours;
    });
    
    return allocation;
}

function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
}

function generateDateRange(start, end) {
    const dates = [];
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Build local YYYY-MM-DD to avoid timezone shifts
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    return dates;
}

function isHoliday(dateStr) {
    if (!appData.holidays) return false;
    return appData.holidays.some(h => h.date === dateStr);
}

// XSS protection helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// TOAST NOTIFICATION SYSTEM
// =============================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    
    container.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

// Debug configuration - set to false in production
const DEBUG_MODE = false;

// Centralized logger with configurable levels
const logger = {
    debug: (...args) => DEBUG_MODE && console.log('[DEBUG]', ...args),
    info: (...args) => DEBUG_MODE && console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
};

// Status validation constants and helpers
const VALID_TASK_STATUSES = ['in-progress', 'todo', 'completed', 'blocked', 'review', 'pending'];
const VALID_MILESTONE_STATUSES = ['pending', 'in-progress', 'completed', 'blocked'];

/**
 * Normalize and validate task status to prevent XSS in class attributes
 * @param {string} status - Raw status value
 * @param {string} defaultStatus - Default status if invalid (default: 'todo')
 * @returns {string} Normalized safe status
 */
function normalizeTaskStatus(status, defaultStatus = 'todo') {
    // First normalize the input status
    const normalized = String(status || '').toLowerCase().trim();
    if (VALID_TASK_STATUSES.includes(normalized)) {
        return normalized;
    }
    
    // Validate defaultStatus too - don't trust caller's default
    const normalizedDefault = String(defaultStatus || 'todo').toLowerCase().trim();
    return VALID_TASK_STATUSES.includes(normalizedDefault) ? normalizedDefault : 'todo';
}

/**
 * Normalize and validate milestone status to prevent XSS in class attributes
 * @param {string} status - Raw status value
 * @param {string} defaultStatus - Default status if invalid (default: 'pending')
 * @returns {string} Normalized safe status
 */
function normalizeMilestoneStatus(status, defaultStatus = 'pending') {
    // First normalize the input status
    const normalized = String(status || '').toLowerCase().trim();
    if (VALID_MILESTONE_STATUSES.includes(normalized)) {
        return normalized;
    }
    
    // Validate defaultStatus too - don't trust caller's default
    const normalizedDefault = String(defaultStatus || 'pending').toLowerCase().trim();
    return VALID_MILESTONE_STATUSES.includes(normalizedDefault) ? normalizedDefault : 'pending';
}

// Helper to validate and sanitize URLs for href attributes
function sanitizeUrl(url) {
    if (!url) return '#';
    
    const urlStr = String(url).trim();
    
    // Allow only http, https, or anchor links
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return urlStr;
    }
    if (urlStr.startsWith('#')) {
        return urlStr;
    }
    
    // Reject javascript:, data:, and other dangerous protocols
    return '#';
}

// =============================================
// FILTERING
// =============================================

let filters = {
    owner: 'all',
    status: 'all',
    priority: 'all',
    search: '',
    hideCompleted: false
};

// Debounced filter functions for better performance
const debouncedRenderGantt = debounce(() => renderGanttChart(), 300);
const debouncedRenderTasks = debounce(() => renderAllTaskCards(), 300);

function filterSearch(value) {
    filters.search = value;
    debouncedRenderGantt();
    debouncedRenderTasks();
}

function filterOwner(value) {
    filters.owner = value;
    renderGanttChart();
    renderAllTaskCards();
}

function filterPriority(value) {
    filters.priority = value;
    renderGanttChart();
    renderAllTaskCards();
}

function filterCompleted(checked) {
    filters.hideCompleted = checked;
    renderGanttChart();
    renderAllTaskCards();
}

// =============================================
// RENDER FUNCTIONS
// =============================================

function renderHeader() {
    if (!appData.project) return;

    // Ensure DOM is ready
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
        console.log('DOM not ready, deferring header render');
        return;
    }

    // Use document.querySelector for more reliable element finding
    const sprintStatusEl = document.querySelector('#sprint-status');
    const sprintDatesEl = document.querySelector('#sprint-dates');
    const headerProgressEl = document.querySelector('#header-progress');
    const headerCapacityEl = document.querySelector('#header-capacity');

    // Debug logging
    console.log('Header elements found:', {
        sprintStatus: !!sprintStatusEl,
        sprintDates: !!sprintDatesEl,
        headerProgress: !!headerProgressEl,
        headerCapacity: !!headerCapacityEl
    });

    // If elements don't exist yet, try again later
    if (!sprintStatusEl || !sprintDatesEl || !headerProgressEl || !headerCapacityEl) {
        console.log('Header elements not found, will retry on next render');
        return;
    }

    // Get comprehensive sprint time state
    const timeState = getSprintTimeState();

    if (!timeState.isValid) {
        // Graceful fallback for missing sprint config
        sprintStatusEl.textContent = 'Setup Required';
        sprintDatesEl.textContent = 'Configure sprint dates';
        headerProgressEl.textContent = '0%';
        headerCapacityEl.textContent = '0h';
        return;
    }

    // Calculate metrics
    const teamRemainingBandwidth = getTeamRemainingBandwidth();
    const totalTasks = appData.tasks ? appData.tasks.length : 0;
    const completedTasks = appData.tasks ? appData.tasks.filter(task => task.completed).length : 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Update sprint status
    let sprintStatus = '';
    if (timeState.isComplete) {
        sprintStatus = 'Completed';
    } else if (timeState.isNotStarted) {
        sprintStatus = 'Planning';
    } else {
        sprintStatus = `Day ${timeState.currentDay}/${timeState.totalWorkingDays}`;
    }

    // Update sprint dates
    const sprintDates = timeState.isComplete ?
        `${formatDate(timeState.sprintStart)} - ${formatDate(timeState.sprintEnd)} (Done)` :
        timeState.isNotStarted ?
        `Starts ${formatDate(timeState.sprintStart)}` :
        `${formatDate(timeState.sprintStart)} - ${formatDate(timeState.sprintEnd)}`;

    // Update elements
    sprintStatusEl.textContent = sprintStatus;
    sprintDatesEl.textContent = sprintDates;
    headerProgressEl.textContent = `${progressPercent}%`;
    headerCapacityEl.textContent = `${Math.round(teamRemainingBandwidth)}h`;
    
    // Update header progress bar
    const headerProgressBar = document.getElementById('header-progress-bar');
    if (headerProgressBar) {
        headerProgressBar.style.width = `${progressPercent}%`;
        headerProgressBar.style.background = progressPercent >= 80 ? 'var(--success)' : 
                                             progressPercent >= 40 ? 'var(--primary)' : 'var(--warning)';
    }
}

function renderTeamOverview() {
    if (!appData.teamMembers || appData.teamMembers.length === 0) return;
    
    const tbody = document.querySelector('.section table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = appData.teamMembers.map(member => `
        <tr>
            <td><strong>${member.name}</strong></td>
            <td>${member.role}</td>
            <td><span class="badge badge-${member.colorClass}">${member.capacity}</span></td>
            <td>${member.focus}</td>
        </tr>
    `).join('');
}

function renderBandwidthOverview() {
    if (!appData.teamMembers || appData.teamMembers.length === 0) return;
    
    const table = document.querySelectorAll('.section table')[1];
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    const timeState = getSprintTimeState();
    
    if (!timeState.isValid) {
        tbody.innerHTML = '<tr><td colspan="4">Sprint dates not configured</td></tr>';
        return;
    }
    
    // Pre-compute task allocation by owner for O(n) lookup
    const tasksByOwner = {};
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            const owner = task.owner || 'unassigned';
            if (!tasksByOwner[owner]) tasksByOwner[owner] = [];
            tasksByOwner[owner].push(task);
        });
    }
    
    tbody.innerHTML = appData.teamMembers.map(member => {
        // Use sprint-based bandwidth calculation
        const sprintBandwidth = getSprintBandwidth(member);
        const remainingBandwidth = getRemainingSprintBandwidth(member);
        const memberTasks = tasksByOwner[member.id] || [];
        const allocatedHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
        const utilizationPercent = sprintBandwidth > 0 ? Math.round((allocatedHours / sprintBandwidth) * 100) : 0;
        const availableHours = Math.max(0, sprintBandwidth - allocatedHours);
        
        // Calculate next available day for this member
        const nextAvailable = getNextAvailableDay(member, 4);
        let nextAvailableText = '';
        if (timeState.isComplete) {
            nextAvailableText = '<span class="next-available completed">Sprint completed</span>';
        } else if (nextAvailable) {
            const nextDate = new Date(nextAvailable.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            nextAvailableText = `<span class="next-available has-capacity">Next free: ${nextDate} (${nextAvailable.freeHours}h)</span>`;
        } else {
            nextAvailableText = '<span class="next-available no-capacity">No capacity this sprint</span>';
        }
        
        // Status badge based on utilization
        let statusBadge = 'success';
        let statusText = 'Available';
        if (utilizationPercent >= 100) {
            statusBadge = 'danger';
            statusText = 'Over capacity';
        } else if (utilizationPercent >= 80) {
            statusBadge = 'warning';
            statusText = 'Near capacity';
        }
        
        return `
        <tr>
            <td><strong>${escapeHtml(member.name)}</strong></td>
            <td>
                <div class="bandwidth-breakdown">
                    <span class="bandwidth-total">${sprintBandwidth}h sprint total</span>
                    <span class="bandwidth-remaining">${Math.round(remainingBandwidth)}h remaining</span>
                </div>
            </td>
            <td>
                <span class="badge badge-${member.colorClass}">${allocatedHours}h allocated (${utilizationPercent}%)</span>
                <span class="badge badge-${statusBadge}">${availableHours}h ${statusText.toLowerCase()}</span>
            </td>
            <td>${nextAvailableText}</td>
        </tr>
        `;
    }).join('');
}

function renderGanttChart() {
    if (!appData.project || !appData.tasks) return;
    
    const dates = generateDateRange(appData.project.startDate, appData.project.endDate);
    console.log(`📊 Gantt Chart: ${dates.length} days from ${appData.project.startDate} to ${appData.project.endDate}`);
    
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;
    
    // Use Gantt-specific filters if available, else show all tasks
    const ganttOwnerFilter = document.getElementById('gantt-filter-owner')?.value || 'all';
    const ganttStatusFilter = document.getElementById('gantt-filter-status')?.value || 'all';
    const ganttPriorityFilter = document.getElementById('gantt-filter-priority')?.value || 'all';
    
    let filteredTasks = [...(appData.tasks || [])];
    
    if (ganttOwnerFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.owner === ganttOwnerFilter || t.owner === 'both');
    }
    if (ganttStatusFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => {
            if (t.completed && ganttStatusFilter === 'completed') return true;
            if (t.completed && ganttStatusFilter !== 'completed') return false;
            const taskStatus = normalizeTaskStatus(t.status);
            return taskStatus === ganttStatusFilter;
        });
    }
    if (ganttPriorityFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.priority === ganttPriorityFilter);
    }
    const dateCount = dates.length;
    const today = getTodayLocalDate(); // Use canonical local date
    
    console.log(`📋 Rendering ${filteredTasks.length} tasks across ${dateCount} days`);
    
    // Performance: Use array join instead of string concatenation
    const ganttParts = ['<div class="gantt-chart">'];
    
    // Header row
    ganttParts.push(`<div class="gantt-header" style="grid-template-columns: 220px repeat(${dateCount}, minmax(30px, 1fr));">
        <div class="gantt-header-task">Task / Timeline</div>`);
    
    dates.forEach(date => {
        const day = new Date(date).getDate();
        const weekday = new Date(date).toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
        const isWE = isWeekend(date);
        const isHol = isHoliday(date);
        const isToday = date === today;
        ganttParts.push(`<div class="gantt-header-day ${isWE || isHol ? 'weekend' : ''} ${isToday ? 'today' : ''}" data-tip="${formatDate(date)}">
            <div class="gantt-header-date">${day}</div>
            <div class="gantt-header-weekday">${weekday}</div>
        </div>`);
    });
    ganttParts.push('</div>');
    
    // Task rows - optimized with reduced DOM queries
    filteredTasks.forEach(task => {
        const member = getTeamMember(task.owner);
        const ownerName = task.owner === 'both' ? 'Both' : (member ? member.name : task.owner);
        
        // Handle tasks without dates - show status in timeline
        let startDateFormatted = 'No date';
        let endDateFormatted = '';
        let dateInfo = 'Status: ' + (task.status || 'Not Started');
        
        if (task.startDate && task.endDate) {
            startDateFormatted = formatDate(task.startDate);
            endDateFormatted = formatDate(task.endDate);
            dateInfo = startDateFormatted === endDateFormatted ? startDateFormatted : `${startDateFormatted} - ${endDateFormatted}`;
        }
        
        // Get status and priority styling
        const statusInfo = getStatusInfo(task.status, task.completed);
        const priorityInfo = getPriorityInfo(task.priority);
        
        ganttParts.push(`<div class="gantt-row ${statusInfo.class} ${priorityInfo.class}" style="grid-template-columns: 220px repeat(${dateCount}, minmax(30px, 1fr));">
            <div class="gantt-task-name">
                <span class="gantt-task-title">${escapeHtml(task.name)}</span>
                <span class="gantt-task-owner">${escapeHtml(ownerName)} • ${dateInfo}</span>
            </div>`);
        
        // Handle tasks with and without dates
        if (!task.startDate || !task.endDate) {
            // Task without dates - show status indicator across entire timeline
            const statusInfo = getStatusInfo(task.status, task.completed);
            const statusClass = `bar-${statusInfo.color}`;
            
            dates.forEach((date, index) => {
                const isWE = isWeekend(date);
                const isHol = isHoliday(date);
                const isToday = date === today;
                const cellClasses = ['gantt-cell'];
                if (isWE || isHol) cellClasses.push('weekend');
                if (isToday) cellClasses.push('today');
                
                ganttParts.push(`<div class="${cellClasses.join(' ')}">`);
                
                // Show status indicator on the first cell only
                if (index === 0) {
                    ganttParts.push(`<div class="gantt-bar ${statusClass}" style="left: 2px; width: calc(100% - 4px);" data-tip="${escapeHtml(task.name)}: ${task.status}" role="img" aria-label="Task status: ${task.status}">
                        <span class="gantt-bar-label">${statusInfo.label}</span>
                    </div>`);
                }
                
                ganttParts.push('</div>');
            });
        } else {
            // Task with dates - show timeline bar
            // Handle tasks that start before the sprint timeline
            const taskStartDate = new Date(task.startDate);
            const taskEndDate = new Date(task.endDate);
            const sprintStartDate = new Date(appData.project.startDate);
            const sprintEndDate = new Date(appData.project.endDate);
            
            // Find the visible range for this task within the sprint timeline
            const visibleStartDate = taskStartDate < sprintStartDate ? sprintStartDate : taskStartDate;
            const visibleEndDate = taskEndDate > sprintEndDate ? sprintEndDate : taskEndDate;
            
            // Convert to local YYYY-MM-DD format
            const visibleStartStr = `${visibleStartDate.getFullYear()}-${String(visibleStartDate.getMonth() + 1).padStart(2, '0')}-${String(visibleStartDate.getDate()).padStart(2, '0')}`;
            const visibleEndStr = `${visibleEndDate.getFullYear()}-${String(visibleEndDate.getMonth() + 1).padStart(2, '0')}-${String(visibleEndDate.getDate()).padStart(2, '0')}`;
            
            const visibleStartIndex = dates.findIndex(d => d === visibleStartStr);
            const visibleEndIndex = dates.findIndex(d => d === visibleEndStr);
            
            // Calculate the actual task duration for display
            const actualStartIndex = dates.indexOf(task.startDate) !== -1 ? dates.indexOf(task.startDate) : 
                                   (taskStartDate < sprintStartDate ? 0 : -1);
            const actualEndIndex = dates.indexOf(task.endDate) !== -1 ? dates.indexOf(task.endDate) : 
                                 (taskEndDate > sprintEndDate ? dateCount - 1 : -1);
            
            dates.forEach((date, index) => {
                const isWE = isWeekend(date);
                const isHol = isHoliday(date);
                const isToday = date === today;
                const cellClasses = ['gantt-cell'];
                if (isWE || isHol) cellClasses.push('weekend');
                if (isToday) cellClasses.push('today');
                
                ganttParts.push(`<div class="${cellClasses.join(' ')}">`);
                
                // Render task bar if this date is within the visible task range
                if (index >= visibleStartIndex && index <= visibleEndIndex && visibleStartIndex !== -1 && visibleEndIndex !== -1) {
                    // Status-based bar coloring
                    const barClass = task.completed ? 'bar-completed' :
                                   (task.status && task.status.toLowerCase().includes('blocked')) ? 'bar-blocked' :
                                   (task.status && task.status.toLowerCase().includes('progress')) ? 'bar-in-progress' :
                                   (task.status && task.status.toLowerCase().includes('review')) ? 'bar-review' :
                                   task.priority === 'urgent' ? 'bar-urgent' : 
                                   task.priority === 'low' ? 'bar-low' :
                                   member ? `bar-${member.colorClass}` : 'bar-primary';
                    
                    // Calculate bar width - if task extends beyond visible range, show partial bar
                    let barWidth;
                    let barPosition = '2px';
                    
                    if (actualStartIndex < visibleStartIndex && index === visibleStartIndex) {
                        // Task starts before visible range - show partial bar from start
                        barWidth = 'calc(100% - 4px)';
                    } else if (actualEndIndex > visibleEndIndex && index === visibleEndIndex) {
                        // Task ends after visible range - show partial bar to end
                        barWidth = 'calc(100% - 4px)';
                    } else if (index === visibleStartIndex && visibleStartIndex === visibleEndIndex) {
                        // Single day task
                        barWidth = 'calc(100% - 4px)';
                    } else if (index === visibleStartIndex) {
                        // First day of multi-day task
                        const remainingDays = visibleEndIndex - visibleStartIndex + 1;
                        barWidth = `calc(${remainingDays * 100}% - 4px)`;
                    } else {
                        // Continuation of multi-day task - don't show bar
                        barWidth = null;
                    }
                    
                    if (barWidth && index === visibleStartIndex) {
                        const workingDays = getWorkingDays(task.startDate, task.endDate);
                        const barLabel = workingDays > 0 ? `${workingDays}d` : '1d';
                        const isOverflowing = (actualStartIndex < 0 || actualEndIndex >= dateCount) ? 
                                            ' (continues beyond timeline)' : '';
                        
                        ganttParts.push(`<div class="gantt-bar ${barClass}" style="left: ${barPosition}; width: ${barWidth};" data-tip="${escapeHtml(task.name)}: ${dateInfo} (${workingDays} working days)${isOverflowing}" role="img" aria-label="Task duration: ${workingDays} working days${isOverflowing}">
                            <span class="gantt-bar-label">${barLabel}</span>
                        </div>`);
                    }
                }
                
                ganttParts.push('</div>');
            });
        }
        
        ganttParts.push('</div>');
    });
    
    ganttParts.push('</div>');
    
    // Single DOM update for better performance
    ganttContainer.innerHTML = ganttParts.join('');
}

// Helper function to get team member by id
function getTeamMember(ownerId) {
    if (!appData.teamMembers || !ownerId) return null;
    return appData.teamMembers.find(m => m.id === ownerId || m.name === ownerId) || null;
}

// Helper function to get status styling
function getStatusInfo(status, completed) {
    if (completed) {
        return { class: 'status-completed', label: 'Done', color: 'success' };
    }
    
    const statusNormalized = String(status || '').toLowerCase().trim();
    
    if (statusNormalized === 'completed') {
        return { class: 'status-completed', label: 'Done', color: 'success' };
    } else if (statusNormalized === 'blocked') {
        return { class: 'status-blocked', label: 'Blocked', color: 'danger' };
    } else if (statusNormalized === 'in-progress') {
        return { class: 'status-in-progress', label: 'Active', color: 'warning' };
    } else if (statusNormalized === 'review') {
        return { class: 'status-review', label: 'Review', color: 'info' };
    } else if (statusNormalized === 'pending') {
        return { class: 'status-pending', label: 'Pending', color: 'secondary' };
    } else if (statusNormalized === 'todo') {
        return { class: 'status-not-started', label: 'To Do', color: 'secondary' };
    } else if (statusNormalized.includes('blocked') || statusNormalized.includes('stuck')) {
        return { class: 'status-blocked', label: 'Blocked', color: 'danger' };
    } else if (statusNormalized.includes('progress') || statusNormalized.includes('active')) {
        return { class: 'status-in-progress', label: 'Active', color: 'warning' };
    } else if (statusNormalized.includes('review') || statusNormalized.includes('qa')) {
        return { class: 'status-review', label: 'Review', color: 'info' };
    } else if (statusNormalized.includes('delayed') || statusNormalized.includes('behind')) {
        return { class: 'status-delayed', label: 'Delayed', color: 'danger' };
    } else if (statusNormalized.includes('cancelled') || statusNormalized.includes('abandoned')) {
        return { class: 'status-cancelled', label: 'Cancelled', color: 'muted' };
    } else {
        return { class: 'status-not-started', label: 'Not Started', color: 'secondary' };
    }
}

// Helper function to get priority styling
function getPriorityInfo(priority) {
    switch (priority) {
        case 'urgent':
            return { class: 'priority-urgent', color: '#dc3545' };
        case 'normal':
            return { class: 'priority-normal', color: '#ffc107' };
        case 'low':
            return { class: 'priority-low', color: '#6c757d' };
        default:
            return { class: 'priority-normal', color: '#ffc107' };
    }
}

function renderTaskCards(owner) {
    if (!appData.tasks || appData.tasks.length === 0) return;
    
    // Find the section for this owner dynamically
    const sections = document.querySelectorAll('.section');
    let section = null;
    
    for (const sec of sections) {
        const header = sec.querySelector('.section-header h2');
        if (header && header.textContent.toLowerCase().includes(owner.toLowerCase())) {
            section = sec;
            break;
        }
    }
    
    if (!section) return;
    
    const taskGrid = section.querySelector('.task-grid');
    if (!taskGrid) return;
    
    const tasks = getFilteredTasks().filter(t => t.owner === owner || t.owner === 'both');
    
    taskGrid.innerHTML = tasks.map(task => {
        const statusInfo = getStatusInfo(task.status, task.completed);
        const priorityInfo = getPriorityInfo(task.priority);
        
        const urgencyClass = task.priority === 'urgent' ? 'urgent' : 
                           task.priority === 'low' ? 'low' : '';
        
        const badgeClass = `badge-${statusInfo.color}`;
        const badgeIcon = statusInfo.label;
        
        const jiraHTML = task.jiraId ? 
            `<span><strong>Jira:</strong> <a href="${task.jiraUrl}" class="jira-link" target="_blank">${task.jiraId}</a></span>` :
            '';
        
        const delayHTML = task.notes ? `<div class="delay-reason"><svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> ${task.notes}</div>` : '';
        
        return `
            <div class="task-card ${urgencyClass}" data-task-id="${task.id}">
                <div class="task-title">
                    <span class="badge ${badgeClass}">${badgeIcon} ${task.status}</span>
                    ${task.name}
                </div>
                <div class="task-meta">
                    ${jiraHTML}
                    ${task.bu ? `<span><strong>BU:</strong> ${task.bu}</span>` : ''}
                    <span><strong>Timeline:</strong> ${formatDate(task.startDate)}${task.startDate !== task.endDate ? ' - ' + formatDate(task.endDate) : ''}</span>
                    ${task.type ? `<span><strong>Type:</strong> ${task.type}</span>` : ''}
                    ${task.blockers ? `<span><strong>Blocker:</strong> ${task.blockers}</span>` : ''}
                </div>
                ${delayHTML}
            </div>
        `;
    }).join('');
}

function renderAllTaskCards() {
    if (!appData.teamMembers) return;
    appData.teamMembers.forEach(member => {
        renderTaskCards(member.id);
    });
}

function renderMilestones() {
    if (!appData.milestones || appData.milestones.length === 0) return;
    
    // Find milestones section table tbody
    const sections = document.querySelectorAll('.section');
    let milestonesTable = null;
    
    for (const section of sections) {
        const header = section.querySelector('.section-header h2');
        if (header && header.textContent.includes('Milestones')) {
            milestonesTable = section.querySelector('table tbody');
            break;
        }
    }
    
    if (!milestonesTable) return;
    
    milestonesTable.innerHTML = appData.milestones.map(m => `
        <tr>
            <td>${formatDate(m.date)}</td>
            <td><strong>${m.title}</strong></td>
            <td>${m.assignee}</td>
        </tr>
    `).join('');
}

function renderAll() {
    if (!appData.loaded) {
        console.warn('Data not loaded yet');
        return;
    }
    
    // Setup dynamic sections first (create task sections for each team member)
    setupDynamicSections();
    
    // Add toolbar if not present
    addToolbar();
    
    // Initialize advanced features
    initializeKeyboardNavigation();
    
    // Initialize mobile UI if on mobile device (handles all mobile setup)
    initializeMobileUI();
    
    // Initialize modern desktop UI
    initializeDesktopUI();
    
    // Check if we should use virtual scrolling (for large datasets)
    const shouldUseVirtualScrolling = appData.tasks && appData.tasks.length > 30;
    if (shouldUseVirtualScrolling) {
        initializeVirtualScrolling();
    }
    
    // Then render all content
    renderHeader();
    renderExecutiveDashboard();
    renderTeamOverview();
    renderBandwidthOverview();
    renderGanttChart();
    renderAllTaskCards();
    renderMilestones();
    updateLegend();
    
    // Render desktop-specific content
    renderDesktopUI();
}

// =============================================
// MODERN DESKTOP UI FUNCTIONS
// =============================================

let desktopState = {
    taskView: 'grid', // 'grid' or 'list'
    taskSort: { field: 'name', direction: 'asc' },
    activePanel: null,
    commandPaletteOpen: false,
    initialized: false
};

function initializeDesktopUI() {
    // Only initialize on desktop
    if (window.innerWidth < 769) return;
    if (desktopState.initialized) return;
    desktopState.initialized = true;
    
    // Initialize dark mode from localStorage
    initializeDarkMode();
    
    // Initialize sidebar navigation
    initializeDesktopSidebar();
    
    // Initialize desktop section navigation
    initializeDesktopNavigation();
    
    // Initialize desktop search
    initializeDesktopSearch();
    
    // Initialize desktop filters
    initializeDesktopFilters();
    
    // Initialize Gantt chart filters
    initializeGanttFilters();
    
    // Initialize task view toggle
    initializeTaskViewToggle();
    
    // Initialize task detail panel
    initializeTaskPanel();
    
    // Initialize command palette
    initializeCommandPalette();
    
    // Initialize print handler
    initializePrintHandler();
    
    // Initialize v3 features (notifications, FAB, auto-refresh, etc.)
    initializeV3Features();
}

// =============================================
// PRINT HANDLER
// =============================================

function initializePrintHandler() {
    // Override window.print to set date and show all sections
    const originalPrint = window.print.bind(window);
    window.printReport = function() {
        // Set print date on header
        const header = document.querySelector('.desktop-header');
        if (header) {
            const today = new Date();
            header.setAttribute('data-print-date', today.toLocaleDateString('en-US', { 
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            }));
        }
        
        // Temporarily expand all sections for printing
        const sections = document.querySelectorAll('.desktop-section');
        const activeSection = document.querySelector('.desktop-section.active');
        sections.forEach(s => s.classList.add('active'));
        
        // Print
        originalPrint();
        
        // Restore after print
        setTimeout(() => {
            sections.forEach(s => s.classList.remove('active'));
            if (activeSection) activeSection.classList.add('active');
        }, 500);
    };
}

// =============================================
// DARK MODE
// =============================================

function initializeDarkMode() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('fmb-theme');
    
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('fmb-theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('fmb-theme', 'dark');
            }
        });
    }
}

// =============================================
// SIDEBAR & NAVIGATION
// =============================================

function initializeDesktopSidebar() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('desktop-sidebar');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

function initializeDesktopNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const sections = document.querySelectorAll('.desktop-section');
    const pageTitle = document.getElementById('desktop-page-title');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionName = item.dataset.section;
            navigateToSection(sectionName);
        });
    });
}

function navigateToSection(sectionName) {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const sections = document.querySelectorAll('.desktop-section');
    const pageTitle = document.getElementById('desktop-page-title');
    
    // Update active nav item
    navItems.forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`.sidebar-nav-item[data-section="${sectionName}"]`);
    if (activeNav) activeNav.classList.add('active');
    
    // Show corresponding section
    sections.forEach(section => {
        section.classList.remove('active');
        if (section.dataset.section === sectionName) {
            section.classList.add('active');
        }
    });
    
    // Update page title
    if (pageTitle) {
        const titles = {
            'dashboard': 'Dashboard',
            'tasks': 'Tasks',
            'timeline': 'Timeline',
            'bandwidth': 'Capacity',
            'milestones': 'Milestones',
            'calendar': 'Sprint Calendar'
        };
        pageTitle.textContent = titles[sectionName] || 'Dashboard';
    }
}

// =============================================
// SEARCH
// =============================================

function initializeDesktopSearch() {
    const searchInput = document.getElementById('desktop-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        filterDesktopContent(query);
    }, 300));
}

function filterDesktopContent(query) {
    if (!query) {
        renderDesktopTasksView();
        return;
    }
    
    const filteredTasks = appData.tasks.filter(task => {
        return task.name.toLowerCase().includes(query) ||
               (task.owner && task.owner.toLowerCase().includes(query)) ||
               (task.status && task.status.toLowerCase().includes(query)) ||
               (task.jiraId && task.jiraId.toLowerCase().includes(query)) ||
               (task.notes && task.notes.toLowerCase().includes(query));
    });
    
    renderDesktopTasksGrid(filteredTasks);
    renderDesktopTasksList(filteredTasks);
}

// =============================================
// FILTERS
// =============================================

function initializeDesktopFilters() {
    const ownerFilter = document.getElementById('desktop-filter-owner');
    const statusFilter = document.getElementById('desktop-filter-status');
    const priorityFilter = document.getElementById('desktop-filter-priority');
    const hideCompletedCheckbox = document.getElementById('desktop-hide-completed');
    
    // Populate owner filter
    if (ownerFilter && appData.teamMembers) {
        const options = appData.teamMembers.map(m => 
            `<option value="${m.id}">${m.name}</option>`
        ).join('');
        ownerFilter.innerHTML = `<option value="all">All Owners</option>${options}`;
    }
    
    // Add event listeners
    [ownerFilter, statusFilter, priorityFilter].forEach(filter => {
        if (filter) {
            filter.addEventListener('change', () => applyDesktopFilters());
        }
    });
    
    if (hideCompletedCheckbox) {
        hideCompletedCheckbox.addEventListener('change', () => applyDesktopFilters());
    }
}

function applyDesktopFilters() {
    const ownerFilter = document.getElementById('desktop-filter-owner')?.value || 'all';
    const statusFilter = document.getElementById('desktop-filter-status')?.value || 'all';
    const priorityFilter = document.getElementById('desktop-filter-priority')?.value || 'all';
    const hideCompleted = document.getElementById('desktop-hide-completed')?.checked || false;
    
    let filteredTasks = [...(appData.tasks || [])];
    
    if (ownerFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.owner === ownerFilter);
    }
    
    if (statusFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => {
            const taskStatus = normalizeTaskStatus(t.status);
            return taskStatus === statusFilter;
        });
    }
    
    if (priorityFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.priority === priorityFilter);
    }
    
    if (hideCompleted) {
        filteredTasks = filteredTasks.filter(t => !t.completed);
    }
    
    renderDesktopTasksGrid(filteredTasks);
    renderDesktopTasksList(filteredTasks);
}

// =============================================
// GANTT CHART FILTERS
// =============================================

function initializeGanttFilters() {
    const ganttOwnerFilter = document.getElementById('gantt-filter-owner');
    const ganttStatusFilter = document.getElementById('gantt-filter-status');
    const ganttPriorityFilter = document.getElementById('gantt-filter-priority');
    const ganttResetBtn = document.getElementById('gantt-filter-reset');
    
    // Populate owner filter
    if (ganttOwnerFilter && appData.teamMembers) {
        const options = appData.teamMembers.map(m => 
            `<option value="${m.id}">${m.name}</option>`
        ).join('');
        ganttOwnerFilter.innerHTML = `<option value="all">All Owners</option>${options}`;
    }
    
    // Add event listeners
    [ganttOwnerFilter, ganttStatusFilter, ganttPriorityFilter].forEach(filter => {
        if (filter) {
            filter.addEventListener('change', () => renderGanttChart());
        }
    });
    
    // Reset button
    if (ganttResetBtn) {
        ganttResetBtn.addEventListener('click', () => {
            if (ganttOwnerFilter) ganttOwnerFilter.value = 'all';
            if (ganttStatusFilter) ganttStatusFilter.value = 'all';
            if (ganttPriorityFilter) ganttPriorityFilter.value = 'all';
            renderGanttChart();
        });
    }
}

// =============================================
// TASK VIEW TOGGLE (Grid / List)
// =============================================

function initializeTaskViewToggle() {
    const toggleBtns = document.querySelectorAll('.view-toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            desktopState.taskView = view;
            
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const gridContainer = document.getElementById('desktop-tasks-grid');
            const listContainer = document.getElementById('desktop-tasks-list');
            
            if (view === 'grid') {
                if (gridContainer) gridContainer.style.display = '';
                if (listContainer) listContainer.style.display = 'none';
            } else {
                if (gridContainer) gridContainer.style.display = 'none';
                if (listContainer) listContainer.style.display = '';
            }
        });
    });
}

// =============================================
// TASK DETAIL SLIDE-OVER PANEL
// =============================================

function initializeTaskPanel() {
    const overlay = document.getElementById('desktop-task-panel-overlay');
    const closeBtn = document.getElementById('task-panel-close-btn');
    
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTaskPanel();
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTaskPanel);
    }
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && desktopState.activePanel) {
            closeTaskPanel();
        }
    });
}

function showDesktopTaskDetail(taskId) {
    if (window.innerWidth < 769) {
        // On mobile, use the mobile task detail
        const task = appData.tasks.find(t => String(t.id) === String(taskId));
        if (task && typeof showTaskDetails === 'function') {
            showTaskDetails(taskId);
        }
        return;
    }
    
    const task = appData.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    
    desktopState.activePanel = taskId;
    
    const overlay = document.getElementById('desktop-task-panel-overlay');
    const headerEl = document.getElementById('task-panel-header');
    const bodyEl = document.getElementById('task-panel-body');
    const jiraBtn = document.getElementById('task-panel-jira-btn');
    
    const statusInfo = getStatusInfo(task.status, task.completed);
    const member = getTeamMember(task.owner);
    const ownerName = member ? member.name : (task.owner || 'Unassigned');
    const normalizedStatus = normalizeTaskStatus(task.status);
    
    const priorityColors = {
        'urgent': '#ef4444',
        'normal': '#3b82f6',
        'low': '#6b7280'
    };
    
    const statusBadgeColors = {
        'success': 'background: #d1fae5; color: #047857;',
        'warning': 'background: #fef3c7; color: #b45309;',
        'danger': 'background: #fee2e2; color: #dc2626;',
        'info': 'background: #cffafe; color: #0891b2;',
        'secondary': 'background: #e5e7eb; color: #4b5563;',
        'muted': 'background: #f3f4f6; color: #6b7280;'
    };
    
    const badgeStyle = statusBadgeColors[statusInfo.color] || statusBadgeColors.secondary;
    const prioColor = priorityColors[task.priority] || '#6b7280';
    
    // Calculate time progress
    let timeProgress = 0;
    let timeLabel = '';
    if (task.startDate && task.endDate) {
        const today = new Date(getTodayLocalDate() + 'T00:00:00');
        const start = new Date(task.startDate + 'T00:00:00');
        const end = new Date(task.endDate + 'T00:00:00');
        const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, (today - start) / (1000 * 60 * 60 * 24));
        timeProgress = Math.min(100, Math.round((elapsed / totalDays) * 100));
        
        if (today < start) timeLabel = 'Not started';
        else if (today > end) timeLabel = 'Overdue';
        else timeLabel = `${Math.round(elapsed)} of ${Math.round(totalDays)} days elapsed`;
    }
    
    // Header
    headerEl.innerHTML = `
        <div class="task-panel-header-top">
            <div class="task-panel-badges">
                <span class="task-panel-badge" style="${badgeStyle}">${statusInfo.label}</span>
                <span class="task-panel-badge" style="background: ${prioColor}15; color: ${prioColor};">${escapeHtml(task.priority || 'normal')}</span>
                ${task.type ? `<span class="task-panel-badge" style="background: var(--badge-bg); color: var(--badge-text);">${escapeHtml(task.type)}</span>` : ''}
            </div>
            <button class="task-panel-close" onclick="closeTaskPanel()" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <h2 class="task-panel-title">${escapeHtml(task.name)}</h2>
    `;
    
    // Body
    bodyEl.innerHTML = `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Details</h4>
            <div class="task-panel-info-grid">
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Assignee</span>
                    <span class="task-panel-info-value">${escapeHtml(ownerName)}</span>
                </div>
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Estimated Hours</span>
                    <span class="task-panel-info-value">${task.estimatedHours || 0}h</span>
                </div>
                ${task.startDate ? `
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Start Date</span>
                    <span class="task-panel-info-value">${formatDate(task.startDate)}</span>
                </div>
                ` : ''}
                ${task.endDate ? `
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Due Date</span>
                    <span class="task-panel-info-value">${formatDate(task.endDate)}</span>
                </div>
                ` : ''}
                ${task.startDate && task.endDate ? `
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Working Days</span>
                    <span class="task-panel-info-value">${getWorkingDays(task.startDate, task.endDate)} days</span>
                </div>
                ` : ''}
                ${task.bu ? `
                <div class="task-panel-info-item">
                    <span class="task-panel-info-label">Business Unit</span>
                    <span class="task-panel-info-value">${escapeHtml(task.bu)}</span>
                </div>
                ` : ''}
            </div>
        </div>
        
        ${task.startDate && task.endDate ? `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Timeline Progress</h4>
            <div class="task-panel-progress">
                <div class="task-panel-progress-bar">
                    <div class="task-panel-progress-fill" style="width: ${timeProgress}%; background: ${timeProgress > 90 && !task.completed ? 'var(--danger)' : 'var(--primary)'};"></div>
                </div>
                <div class="task-panel-progress-labels">
                    <span>${timeLabel}</span>
                    <span>${timeProgress}%</span>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${task.jiraUrl ? `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Jira Ticket</h4>
            <a href="${sanitizeUrl(task.jiraUrl)}" target="_blank" rel="noopener noreferrer" class="task-panel-jira-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span style="flex:1">${escapeHtml(task.jiraId || 'View in Jira')}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
        </div>
        ` : task.jiraId ? `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Jira ID</h4>
            <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(task.jiraId)}</span>
        </div>
        ` : ''}
        
        ${task.notes ? `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Notes</h4>
            <div class="task-panel-notes">${escapeHtml(task.notes)}</div>
        </div>
        ` : ''}
        
        ${task.blockers ? `
        <div class="task-panel-section">
            <h4 class="task-panel-section-title">Blockers</h4>
            <div class="task-panel-blockers">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                <span>${escapeHtml(task.blockers)}</span>
            </div>
        </div>
        ` : ''}
    `;
    
    // Jira button
    if (jiraBtn && task.jiraUrl) {
        jiraBtn.style.display = 'flex';
        jiraBtn.onclick = () => window.open(sanitizeUrl(task.jiraUrl), '_blank', 'noopener');
    } else if (jiraBtn) {
        jiraBtn.style.display = 'none';
    }
    
    // Show panel
    if (overlay) overlay.classList.add('active');
}

function closeTaskPanel() {
    const overlay = document.getElementById('desktop-task-panel-overlay');
    if (overlay) overlay.classList.remove('active');
    desktopState.activePanel = null;
}

// =============================================
// COMMAND PALETTE (Ctrl+K)
// =============================================

function initializeCommandPalette() {
    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    const results = document.getElementById('command-palette-results');
    
    if (!overlay || !input) return;
    
    // Ctrl+K or Cmd+K to open, also / when not focused on input
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        if (e.key === '/' && !desktopState.commandPaletteOpen && 
            document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            openCommandPalette();
        }
        if (e.key === 'Escape' && desktopState.commandPaletteOpen) {
            closeCommandPalette();
        }
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCommandPalette();
    });
    
    input.addEventListener('input', debounce(() => {
        renderCommandPaletteResults(input.value);
    }, 150));
    
    // Keyboard navigation in results
    input.addEventListener('keydown', (e) => {
        const items = results.querySelectorAll('.command-palette-item');
        const activeItem = results.querySelector('.command-palette-item.active');
        let activeIndex = Array.from(items).indexOf(activeItem);
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach(i => i.classList.remove('active'));
            if (items[activeIndex]) items[activeIndex].classList.add('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            items.forEach(i => i.classList.remove('active'));
            if (items[activeIndex]) items[activeIndex].classList.add('active');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeItem) activeItem.click();
        }
    });
}

function toggleCommandPalette() {
    if (desktopState.commandPaletteOpen) {
        closeCommandPalette();
    } else {
        openCommandPalette();
    }
}

function openCommandPalette() {
    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    if (!overlay) return;
    
    desktopState.commandPaletteOpen = true;
    overlay.classList.add('active');
    
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
    
    renderCommandPaletteResults('');
}

function closeCommandPalette() {
    const overlay = document.getElementById('command-palette-overlay');
    if (!overlay) return;
    
    desktopState.commandPaletteOpen = false;
    overlay.classList.remove('active');
}

function renderCommandPaletteResults(query) {
    const results = document.getElementById('command-palette-results');
    if (!results) return;
    
    const items = [];
    const q = query.toLowerCase().trim();
    
    // Navigation commands
    const navSections = [
        { section: 'dashboard', label: 'Go to Dashboard', icon: 'dashboard' },
        { section: 'tasks', label: 'Go to Tasks', icon: 'tasks' },
        { section: 'timeline', label: 'Go to Timeline', icon: 'chart' },
        { section: 'bandwidth', label: 'Go to Capacity', icon: 'chart' },
        { section: 'milestones', label: 'Go to Milestones', icon: 'milestone' },
        { section: 'calendar', label: 'Go to Calendar', icon: 'calendar' }
    ];
    
    if (!q) {
        // Navigation commands
        navSections.forEach(nav => {
            items.push({
                type: 'nav',
                title: nav.label,
                subtitle: 'Navigation',
                section: nav.section,
                badge: '→'
            });
        });
        
        // Quick actions
        items.push({ type: 'action', title: 'Toggle Dark Mode', subtitle: 'Switch between light & dark theme', action: 'toggleTheme', badge: '🌓' });
        items.push({ type: 'action', title: 'Refresh Data', subtitle: 'Re-fetch latest data from Google Sheets', action: 'refresh', badge: '↻' });
        items.push({ type: 'action', title: 'Export Data', subtitle: 'Download sprint data as CSV', action: 'export', badge: '↓' });
        items.push({ type: 'action', title: 'Print Report', subtitle: 'Print the current sprint report', action: 'print', badge: '⎙' });
        
        // Search hints
        items.push({ type: 'hint', title: 'Search tasks by name or Jira ID...', subtitle: 'Type to search across tasks, members, milestones', badge: '' });
    } else {
        // Filter navigation
        navSections.forEach(nav => {
            if (nav.label.toLowerCase().includes(q) || nav.section.includes(q)) {
                items.push({ type: 'nav', title: nav.label, subtitle: 'Navigation', section: nav.section, badge: '→' });
            }
        });
        
        // Search tasks
        if (appData.tasks) {
            appData.tasks.filter(t => 
                t.name.toLowerCase().includes(q) ||
                (t.owner && t.owner.toLowerCase().includes(q)) ||
                (t.jiraId && t.jiraId.toLowerCase().includes(q))
            ).slice(0, 8).forEach(task => {
                const member = getTeamMember(task.owner);
                const ownerName = member ? member.name : (task.owner || 'Unassigned');
                items.push({
                    type: 'task',
                    title: task.name,
                    subtitle: `${ownerName} • ${task.status || 'todo'}`,
                    taskId: task.id,
                    badge: task.jiraId || ''
                });
            });
        }
        
        // Search members
        if (appData.teamMembers) {
            appData.teamMembers.filter(m => 
                m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
            ).forEach(member => {
                items.push({
                    type: 'member',
                    title: member.name,
                    subtitle: member.role,
                    memberId: member.id,
                    badge: member.capacity
                });
            });
        }
        
        // Search milestones
        if (appData.milestones) {
            appData.milestones.filter(m => m.title.toLowerCase().includes(q)).forEach(ms => {
                items.push({
                    type: 'milestone',
                    title: ms.title,
                    subtitle: `${formatDate(ms.date)} • ${ms.status}`,
                    badge: `${ms.progress}%`
                });
            });
        }
        
        // Theme toggle
        if ('dark mode'.includes(q) || 'theme'.includes(q) || 'light mode'.includes(q)) {
            items.push({ type: 'action', title: 'Toggle Dark Mode', subtitle: 'Theme', action: 'toggleTheme', badge: '🌓' });
        }
    }
    
    if (items.length === 0) {
        results.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">No results found</div>`;
        return;
    }
    
    results.innerHTML = (q ? '' : '<div class="command-palette-section-label">What would you like to do?</div>') + items.map((item, idx) => {
        if (item.type === 'hint') {
            return `<div class="command-palette-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> ${escapeHtml(item.title)}</div>`;
        }
        return `
        <div class="command-palette-item ${idx === 0 ? 'active' : ''}" data-type="${item.type}" data-section="${item.section || ''}" data-task-id="${item.taskId || ''}" data-action="${item.action || ''}">
            <div class="command-palette-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${item.type === 'task' ? '<path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>' : 
                      item.type === 'member' ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>' : 
                      item.type === 'milestone' ? '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' :
                      item.type === 'nav' ? '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>' :
                      item.action === 'toggleTheme' ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>' :
                      item.action === 'refresh' ? '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path>' :
                      item.action === 'export' ? '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>' :
                      item.action === 'print' ? '<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>' :
                      '<circle cx="12" cy="12" r="5"></circle>'}
                </svg>
            </div>
            <div class="command-palette-item-content">
                <div class="command-palette-item-title">${escapeHtml(item.title)}</div>
                <div class="command-palette-item-subtitle">${escapeHtml(item.subtitle)}</div>
            </div>
            ${item.badge ? `<span class="command-palette-item-badge">${escapeHtml(item.badge)}</span>` : ''}
        </div>
    `}).join('');
    
    // Add click handlers
    results.querySelectorAll('.command-palette-item').forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            
            if (type === 'nav') {
                navigateToSection(el.dataset.section);
            } else if (type === 'task') {
                navigateToSection('tasks');
                setTimeout(() => showDesktopTaskDetail(el.dataset.taskId), 100);
            } else if (type === 'member') {
                navigateToSection('bandwidth');
            } else if (type === 'action') {
                const action = el.dataset.action;
                if (action === 'toggleTheme') {
                    document.getElementById('theme-toggle')?.click();
                } else if (action === 'refresh') {
                    if (typeof refreshData === 'function') refreshData();
                } else if (action === 'export') {
                    if (typeof exportData === 'function') exportData();
                } else if (action === 'print') {
                    if (window.printReport) window.printReport(); else window.print();
                }
            }
            
            closeCommandPalette();
        });
    });
}

// =============================================
// RENDER DESKTOP UI
// =============================================

function renderDesktopUI() {
    if (window.innerWidth < 769) return;
    
    renderDesktopSprintCard();
    renderDesktopMetrics();
    renderDesktopStatusBars();
    renderDesktopTeamList();
    renderDesktopBandwidthOverview();
    renderDesktopTasksView();
    renderDesktopBandwidthGrid();
    renderDesktopMilestones();
    renderDesktopBurndownMini();
    renderDesktopSprintCalendar();
    renderTeamAvailability();
    renderDesktopWeeklyBreakdown();
    updateDesktopSidebarStatus();
    updateDesktopTodayBadge();
    updateGoogleSheetLink();
    
    // V3 post-render: notifications, heat glow, animations, breadcrumb
    postRenderV3();
}

function updateDesktopTodayBadge() {
    const badge = document.getElementById('today-date-text');
    const timeBadge = document.getElementById('today-time-text');
    if (!badge) return;
    
    const now = new Date();
    // Format date in IST
    const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' };
    badge.textContent = now.toLocaleDateString('en-IN', dateOpts);
    
    // Format time in IST
    if (timeBadge) {
        const timeOpts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
        timeBadge.textContent = now.toLocaleTimeString('en-IN', timeOpts) + ' IST';
    }
    
    // Auto-update every 30 seconds
    if (!window._todayBadgeTimer) {
        window._todayBadgeTimer = setInterval(() => {
            const n = new Date();
            if (timeBadge) {
                const tOpts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
                timeBadge.textContent = n.toLocaleTimeString('en-IN', tOpts) + ' IST';
            }
        }, 30000);
    }
}

function updateGoogleSheetLink() {
    const link = document.getElementById('sidebar-sheet-link');
    if (!link) return;
    
    // Get the sheet ID from config (defined in dataLoader.js)
    const sheetId = typeof GOOGLE_SHEETS_CONFIG !== 'undefined' ? GOOGLE_SHEETS_CONFIG.sheetId : null;
    if (sheetId) {
        link.href = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    } else {
        link.href = '#';
        link.title = 'Google Sheet not configured';
    }
}

function updateDesktopSidebarStatus() {
    const statusBadge = document.getElementById('sidebar-sprint-status');
    if (!statusBadge || !appData.project) return;
    
    const timeState = getSprintTimeState();
    if (timeState.isComplete) {
        statusBadge.textContent = 'Completed';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        statusBadge.style.color = '#10b981';
    } else if (timeState.isNotStarted) {
        statusBadge.textContent = 'Planning';
        statusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        statusBadge.style.color = '#f59e0b';
    } else {
        statusBadge.textContent = `Day ${timeState.currentDay}/${timeState.totalWorkingDays}`;
    }
    
    // Update sidebar nav badges
    updateSidebarNavBadges();
}

function updateSidebarNavBadges() {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    navItems.forEach(item => {
        // Remove existing badges
        const existing = item.querySelector('.nav-badge');
        if (existing) existing.remove();
        
        const section = item.dataset.section;
        let badge = '';
        
        if (section === 'tasks' && appData.tasks) {
            const blockedCount = appData.tasks.filter(t => 
                (t.status && t.status.toLowerCase().includes('blocked')) || (t.blockers && t.blockers.trim() !== '')
            ).length;
            if (blockedCount > 0) {
                badge = `<span class="nav-badge">${blockedCount}</span>`;
            } else {
                const total = appData.tasks.length;
                badge = `<span class="nav-badge info">${total}</span>`;
            }
        } else if (section === 'milestones' && appData.milestones) {
            const today = getTodayLocalDate();
            const overdueCount = appData.milestones.filter(m => {
                const mDate = new Date(m.date);
                return mDate < new Date(today) && m.status !== 'completed';
            }).length;
            if (overdueCount > 0) {
                badge = `<span class="nav-badge">${overdueCount}</span>`;
            }
        }
        
        if (badge) {
            item.insertAdjacentHTML('beforeend', badge);
        }
    });
}

function renderDesktopSprintCard() {
    const nameEl = document.getElementById('sprint-name');
    const datesEl = document.getElementById('sprint-date-range');
    const progressRing = document.getElementById('sprint-progress-ring');
    const progressPercent = document.getElementById('sprint-progress-percent');
    const daysInfo = document.getElementById('sprint-days-info');
    const remainingInfo = document.getElementById('sprint-remaining-info');
    const quickStatsEl = document.getElementById('sprint-quick-stats');
    
    if (!appData.project) return;
    
    const timeState = getSprintTimeState();
    const totalTasks = appData.tasks ? appData.tasks.length : 0;
    const completedTasks = appData.tasks ? appData.tasks.filter(t => t.completed).length : 0;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    if (nameEl) nameEl.textContent = appData.project.name || 'Sprint Overview';
    if (datesEl) datesEl.textContent = `${formatDate(appData.project.startDate)} - ${formatDate(appData.project.endDate)}`;
    
    if (progressRing) {
        progressRing.style.strokeDasharray = `${progress}, 100`;
    }
    if (progressPercent) progressPercent.textContent = `${progress}%`;
    
    if (daysInfo) {
        if (timeState.isComplete) {
            daysInfo.textContent = 'Sprint Completed';
        } else if (timeState.isNotStarted) {
            daysInfo.textContent = `${timeState.totalWorkingDays} working days`;
        } else {
            daysInfo.textContent = `Day ${timeState.currentDay} of ${timeState.totalWorkingDays}`;
        }
    }
    
    if (remainingInfo) {
        if (timeState.isComplete) {
            remainingInfo.textContent = `${completedTasks} of ${totalTasks} tasks completed`;
        } else {
            remainingInfo.textContent = `${timeState.remainingWorkingDays} days remaining`;
        }
    }
    
    // Populate sprint quick stats
    if (quickStatsEl) {
        const teamSize = appData.teamMembers ? appData.teamMembers.length : 0;
        const blockedTasks = appData.tasks ? appData.tasks.filter(t => 
            (t.status && t.status.toLowerCase().includes('blocked')) || (t.blockers && t.blockers.trim() !== '')
        ).length : 0;
        const totalHours = appData.tasks ? appData.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0) : 0;
        const milestonesCount = appData.milestones ? appData.milestones.length : 0;
        
        quickStatsEl.innerHTML = `
            <div class="sprint-quick-stat" data-tip="Team members in this sprint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span>${teamSize} Members</span>
            </div>
            <div class="sprint-quick-stat" data-tip="Total tasks in this sprint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                <span>${totalTasks} Tasks</span>
            </div>
            <div class="sprint-quick-stat" data-tip="Total estimated hours across all tasks">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${totalHours}h Estimated</span>
            </div>
            ${blockedTasks > 0 ? `
                <div class="sprint-quick-stat blocked" data-tip="${blockedTasks} task${blockedTasks !== 1 ? 's' : ''} currently blocked">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <span>${blockedTasks} Blocked</span>
                </div>
            ` : ''}
            ${milestonesCount > 0 ? `
                <div class="sprint-quick-stat" data-tip="Key milestones to track">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                    <span>${milestonesCount} Milestones</span>
                </div>
            ` : ''}
        `;
    }
}

function renderDesktopMetrics() {
    if (!appData.tasks || !appData.teamMembers) return;
    
    const totalTasks = appData.tasks.length;
    const completedTasks = appData.tasks.filter(task => task.completed).length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const teamSprintBandwidth = getTeamSprintBandwidth();
    const totalAllocatedHours = appData.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const utilizationPercent = teamSprintBandwidth > 0 ? 
        Math.min(Math.round((totalAllocatedHours / teamSprintBandwidth) * 100), 999) : 0;
    
    const blockedTasks = appData.tasks.filter(task => 
        (task.status && task.status.toLowerCase().includes('blocked')) ||
        (task.blockers && task.blockers.trim() !== '')
    ).length;
    
    const delayedTasks = appData.tasks.filter(task => 
        task.status && task.status.toLowerCase().includes('delayed')
    ).length;
    
    const overUtilized = utilizationPercent > 100;
    const riskLevel = blockedTasks > 2 || delayedTasks > 1 || overUtilized ? 'High' : 
                     blockedTasks > 0 || delayedTasks > 0 || utilizationPercent > 90 ? 'Medium' : 'Low';
    
    const progressValue = document.getElementById('sprint-progress-value');
    const progressSubtitle = document.getElementById('sprint-progress-subtitle');
    if (progressValue) progressValue.textContent = `${progressPercent}%`;
    if (progressSubtitle) progressSubtitle.textContent = `${completedTasks} of ${totalTasks} tasks completed`;
    
    const utilizationValue = document.getElementById('team-utilization-value');
    const utilizationSubtitle = document.getElementById('team-utilization-subtitle');
    if (utilizationValue) utilizationValue.textContent = `${utilizationPercent}%`;
    if (utilizationSubtitle) utilizationSubtitle.textContent = `${totalAllocatedHours}h / ${teamSprintBandwidth}h capacity`;
    
    const riskValue = document.getElementById('risk-indicator-value');
    const riskSubtitle = document.getElementById('risk-indicator-subtitle');
    if (riskValue) riskValue.textContent = riskLevel;
    if (riskSubtitle) {
        const riskFactors = [];
        if (blockedTasks > 0) riskFactors.push(`${blockedTasks} blocked`);
        if (delayedTasks > 0) riskFactors.push(`${delayedTasks} delayed`);
        if (overUtilized) riskFactors.push('over capacity');
        riskSubtitle.textContent = riskFactors.length > 0 ? riskFactors.join(', ') : 'No risks identified';
    }
}

// =============================================
// STATUS DISTRIBUTION BARS
// =============================================

function renderDesktopStatusBars() {
    const container = document.getElementById('status-bars');
    if (!container || !appData.tasks) return;
    
    const totalTasks = appData.tasks.length;
    if (totalTasks === 0) return;
    
    const statusGroups = {};
    appData.tasks.forEach(task => {
        const status = normalizeTaskStatus(task.status, task.completed ? 'completed' : 'todo');
        statusGroups[status] = (statusGroups[status] || 0) + 1;
    });
    
    const statusOrder = ['in-progress', 'todo', 'blocked', 'review', 'pending', 'completed'];
    const statusLabels = {
        'in-progress': 'In Progress',
        'todo': 'To Do',
        'blocked': 'Blocked',
        'review': 'In Review',
        'pending': 'Pending',
        'completed': 'Completed'
    };
    
    container.innerHTML = statusOrder
        .filter(status => statusGroups[status] > 0)
        .map(status => {
            const count = statusGroups[status];
            const percent = Math.round((count / totalTasks) * 100);
            return `
                <div class="status-bar-row">
                    <span class="status-bar-label">${statusLabels[status]}</span>
                    <div class="status-bar-track">
                        <div class="status-bar-fill status-${status}" style="width: ${percent}%;">
                            ${percent > 10 ? `${percent}%` : ''}
                        </div>
                    </div>
                    <span class="status-bar-count">${count}</span>
                </div>
            `;
        }).join('');
}

// =============================================
// BURNDOWN MINI CHART
// =============================================

function renderDesktopBurndownMini() {
    const container = document.getElementById('burndown-mini');
    const subtitle = document.getElementById('burndown-subtitle');
    if (!container || !appData.project || !appData.tasks) return;
    
    const timeState = getSprintTimeState();
    if (!timeState.isValid || timeState.totalWorkingDays === 0) return;
    
    const totalTasks = appData.tasks.length;
    const completedTasks = appData.tasks.filter(t => t.completed).length;
    const remainingTasks = totalTasks - completedTasks;
    
    // Simple burndown - show bars for each "segment" of the sprint
    const segments = Math.min(timeState.totalWorkingDays, 10); // max 10 bars
    const segmentSize = timeState.totalWorkingDays / segments;
    
    const idealDecrement = totalTasks / segments;
    
    let bars = '';
    for (let i = 0; i < segments; i++) {
        const idealRemaining = Math.max(0, totalTasks - (idealDecrement * (i + 1)));
        const idealHeight = totalTasks > 0 ? (idealRemaining / totalTasks) * 100 : 0;
        
        const isElapsed = (i + 1) * segmentSize <= timeState.currentDay;
        const actualRemaining = isElapsed ? 
            Math.max(0, remainingTasks + (completedTasks * ((segments - i - 1) / segments))) :
            totalTasks * ((segments - i) / segments);
        const actualHeight = totalTasks > 0 ? (actualRemaining / totalTasks) * 100 : 0;
        
        bars += `<div class="burndown-bar ${isElapsed ? 'completed' : 'ideal'}" style="height: ${isElapsed ? Math.max(actualHeight, 5) : idealHeight}%;"></div>`;
    }
    
    container.innerHTML = `<div class="burndown-mini-chart">${bars}</div>`;
    
    if (subtitle) {
        const velocity = timeState.currentDay > 0 ? (completedTasks / timeState.currentDay).toFixed(1) : 0;
        subtitle.textContent = `${remainingTasks} tasks remaining • ${velocity} tasks/day`;
    }
}

// =============================================
// TEAM LIST
// =============================================

function renderDesktopTeamList() {
    const container = document.getElementById('desktop-team-list');
    if (!container || !appData.teamMembers) return;
    
    const tasksByOwner = {};
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            const owner = task.owner || 'unassigned';
            if (!tasksByOwner[owner]) tasksByOwner[owner] = [];
            tasksByOwner[owner].push(task);
        });
    }
    
    // Update member count badge
    const memberCountEl = document.getElementById('team-member-count');
    if (memberCountEl) {
        memberCountEl.textContent = `${appData.teamMembers.length} member${appData.teamMembers.length !== 1 ? 's' : ''}`;
    }
    
    container.innerHTML = appData.teamMembers.map(member => {
        const memberTasks = tasksByOwner[member.id] || [];
        const totalTasks = memberTasks.length;
        const completedTasks = memberTasks.filter(t => t.completed).length;
        const activeTasks = memberTasks.filter(t => !t.completed).length;
        const allocatedHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
        const sprintBandwidth = getSprintBandwidth(member);
        const utilizationPercent = sprintBandwidth > 0 ? Math.min(Math.round((allocatedHours / sprintBandwidth) * 100), 100) : 0;
        const gradient = getGradientForColorClass(member.colorClass);
        const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
        
        const barColor = allocatedHours > sprintBandwidth ? 'var(--danger)' : 
                         allocatedHours > sprintBandwidth * 0.8 ? 'var(--warning)' : 'var(--success)';
        
        return `
            <div class="desktop-team-member" data-tip="${escapeHtml(member.name)}: ${totalTasks} tasks, ${allocatedHours}h allocated of ${sprintBandwidth}h">
                <div class="team-member-avatar" style="background: ${gradient};">
                    ${initials}
                </div>
                <div class="team-member-info">
                    <div class="team-member-name">${escapeHtml(member.name)}</div>
                    <div class="team-member-role">${escapeHtml(member.role || 'Team Member')}</div>
                    <div class="team-member-workload">
                        <div class="team-member-workload-bar">
                            <div class="team-member-workload-fill" style="width: ${utilizationPercent}%; background: ${barColor};"></div>
                        </div>
                        <div class="team-member-workload-text">
                            <span>${allocatedHours}h / ${sprintBandwidth}h</span>
                            <span>${utilizationPercent}%</span>
                        </div>
                    </div>
                </div>
                <div class="team-member-stats">
                    <div class="team-stat" data-tip="Total tasks assigned">
                        <span class="team-stat-value">${totalTasks}</span>
                        <span class="team-stat-label">Total</span>
                    </div>
                    <div class="team-stat" data-tip="Active / in-progress tasks">
                        <span class="team-stat-value">${activeTasks}</span>
                        <span class="team-stat-label">Active</span>
                    </div>
                    <div class="team-stat" data-tip="Completed tasks">
                        <span class="team-stat-value">${completedTasks}</span>
                        <span class="team-stat-label">Done</span>
                    </div>
                </div>
                ${(() => {
                    const avail = getNextAvailableDay(member, 2);
                    if (avail) {
                        const isToday = avail.date === getTodayLocalDate();
                        return `<div class="next-available-badge" data-tip="Next day with ${avail.freeHours}h free">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${isToday ? 'Today' : formatDate(avail.date)} · ${avail.freeHours}h free
                        </div>`;
                    } else {
                        return `<div class="next-available-badge busy" data-tip="No available slot this sprint">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                            Fully booked
                        </div>`;
                    }
                })()}
            </div>
        `;
    }).join('');
}

// =============================================
// BANDWIDTH OVERVIEW
// =============================================

function renderDesktopBandwidthOverview() {
    const container = document.getElementById('desktop-bandwidth-overview');
    if (!container) return;
    
    const teamSprintBandwidth = getTeamSprintBandwidth();
    const teamRemainingBandwidth = getTeamRemainingBandwidth();
    const totalAllocatedHours = appData.tasks ? appData.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0) : 0;
    const availableHours = Math.max(0, teamSprintBandwidth - totalAllocatedHours);
    const utilizationPercent = teamSprintBandwidth > 0 ? Math.min(Math.round((totalAllocatedHours / teamSprintBandwidth) * 100), 100) : 0;
    
    const utilizationClass = totalAllocatedHours > teamSprintBandwidth ? 'danger' : 
                            totalAllocatedHours > teamSprintBandwidth * 0.8 ? 'warning' : 'success';
    
    const barColor = utilizationClass === 'danger' ? 'var(--danger)' : 
                     utilizationClass === 'warning' ? 'var(--warning)' : 'var(--success)';
    
    // Update overall utilization badge in card header
    const utilizationBadgeEl = document.getElementById('overall-utilization-badge');
    if (utilizationBadgeEl) {
        utilizationBadgeEl.textContent = `${utilizationPercent}% used`;
    }
    
    // Calculate some extra stats
    const totalTasks = appData.tasks ? appData.tasks.length : 0;
    const avgHoursPerTask = totalTasks > 0 ? (totalAllocatedHours / totalTasks).toFixed(1) : 0;
    const teamSize = appData.teamMembers ? appData.teamMembers.length : 0;
    const avgPerMember = teamSize > 0 ? Math.round(totalAllocatedHours / teamSize) : 0;
    
    container.innerHTML = `
        <div class="bandwidth-overview-visual">
            <div class="bandwidth-overview-visual-label">
                <span>Team Utilization</span>
                <span>${utilizationPercent}%</span>
            </div>
            <div class="bandwidth-overview-bar">
                <div class="bandwidth-overview-bar-fill" style="width: ${utilizationPercent}%; background: ${barColor};"></div>
            </div>
        </div>
        <div class="bandwidth-overview-grid">
            <div class="bandwidth-overview-item" data-tip="Total available hours across all team members for this sprint">
                <span class="bandwidth-label">Capacity</span>
                <span class="bandwidth-value">${teamSprintBandwidth}h</span>
            </div>
            <div class="bandwidth-overview-item" data-tip="Sum of estimated hours from all tasks">
                <span class="bandwidth-label">Allocated</span>
                <span class="bandwidth-value ${utilizationClass}">${totalAllocatedHours}h</span>
            </div>
            <div class="bandwidth-overview-item" data-tip="Capacity minus allocated hours = unassigned capacity">
                <span class="bandwidth-label">Available</span>
                <span class="bandwidth-value ${availableHours > 0 ? 'success' : 'danger'}">${availableHours}h</span>
            </div>
            <div class="bandwidth-overview-item" data-tip="Hours remaining based on time elapsed in the sprint">
                <span class="bandwidth-label">Remaining</span>
                <span class="bandwidth-value">${Math.round(teamRemainingBandwidth)}h</span>
            </div>
        </div>
        <div class="bandwidth-overview-summary">
            <span data-tip="Average estimated hours per task">${avgHoursPerTask}h / task</span>
            <span>·</span>
            <span data-tip="Average allocated hours per team member">${avgPerMember}h / member</span>
            <span>·</span>
            <span>${teamSize} members · ${totalTasks} tasks</span>
        </div>
    `;
}

// =============================================
// TASKS - GRID & LIST VIEWS
// =============================================

function renderDesktopTasksView(tasks = null) {
    renderDesktopTasksGrid(tasks);
    renderDesktopTasksList(tasks);
}

function renderDesktopTasksGrid(tasks = null) {
    const container = document.getElementById('desktop-tasks-grid');
    if (!container) return;
    
    const tasksToRender = tasks || appData.tasks || [];
    
    // Update task count in section header
    const taskCountEl = document.getElementById('desktop-task-count');
    if (taskCountEl) {
        const totalTasks = appData.tasks ? appData.tasks.length : 0;
        const showing = tasksToRender.length;
        taskCountEl.textContent = showing === totalTasks ? `${totalTasks} tasks` : `${showing} of ${totalTasks} tasks`;
    }
    
    if (tasksToRender.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
                <p>No tasks found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = tasksToRender.map(task => {
        const statusInfo = getStatusInfo(task.status, task.completed);
        const member = getTeamMember(task.owner);
        const ownerName = member ? member.name : (task.owner || 'Unassigned');
        
        const badgeColors = {
            'success': 'background: #d1fae5; color: #047857;',
            'warning': 'background: #fef3c7; color: #b45309;',
            'danger': 'background: #fee2e2; color: #dc2626;',
            'info': 'background: #cffafe; color: #0891b2;',
            'secondary': 'background: #e5e7eb; color: #4b5563;',
            'muted': 'background: #f3f4f6; color: #6b7280;'
        };
        
        const badgeStyle = badgeColors[statusInfo.color] || badgeColors.secondary;
        const normalizedStatus = normalizeTaskStatus(task.status, task.completed ? 'completed' : 'todo');
        const cardClass = task.completed ? 'completed' : 
                         task.priority === 'urgent' ? 'urgent' : 
                         statusInfo.class?.includes('blocked') ? 'blocked' : '';
        const statusCardClass = `card-status-${normalizedStatus}`;
        
        return `
            <div class="desktop-task-card ${cardClass} ${statusCardClass}" onclick="showDesktopTaskDetail('${task.id}')">
                <div class="desktop-task-header">
                    <span class="desktop-task-title">${escapeHtml(task.name)}</span>
                    <span class="desktop-task-badge" style="${badgeStyle}">${statusInfo.label}</span>
                </div>
                <div class="desktop-task-meta">
                    <span class="desktop-task-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${escapeHtml(ownerName)}
                    </span>
                    ${task.estimatedHours ? `
                        <span class="desktop-task-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${task.estimatedHours}h
                        </span>
                    ` : ''}
                    ${task.startDate ? `
                        <span class="desktop-task-meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            ${formatDate(task.startDate)}${task.endDate && task.endDate !== task.startDate ? ' - ' + formatDate(task.endDate) : ''}
                        </span>
                    ` : ''}
                    ${task.jiraId && task.jiraId !== 'Not Provided' ? `
                        <span class="desktop-task-meta-item" style="color: var(--primary);">
                            ${escapeHtml(task.jiraId)}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderDesktopTasksList(tasks = null) {
    const container = document.getElementById('desktop-tasks-list');
    if (!container) return;
    
    const tasksToRender = tasks || appData.tasks || [];
    
    // Sort tasks
    const sorted = [...tasksToRender].sort((a, b) => {
        const field = desktopState.taskSort.field;
        const dir = desktopState.taskSort.direction === 'asc' ? 1 : -1;
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        if (typeof aVal === 'string') return aVal.localeCompare(bVal) * dir;
        return (aVal - bVal) * dir;
    });
    
    const badgeColors = {
        'success': 'background: #d1fae5; color: #047857;',
        'warning': 'background: #fef3c7; color: #b45309;',
        'danger': 'background: #fee2e2; color: #dc2626;',
        'info': 'background: #cffafe; color: #0891b2;',
        'secondary': 'background: #e5e7eb; color: #4b5563;',
        'muted': 'background: #f3f4f6; color: #6b7280;'
    };
    
    const priorityColors = { 'urgent': '#ef4444', 'normal': '#3b82f6', 'low': '#9ca3af' };
    
    const columns = [
        { field: 'name', label: 'Task' },
        { field: 'owner', label: 'Owner' },
        { field: 'status', label: 'Status' },
        { field: 'priority', label: 'Priority' },
        { field: 'estimatedHours', label: 'Hours' },
        { field: 'startDate', label: 'Start' },
        { field: 'endDate', label: 'Due' },
        { field: 'jiraId', label: 'Jira' }
    ];
    
    const sortField = desktopState.taskSort.field;
    const sortDir = desktopState.taskSort.direction;
    
    container.innerHTML = `
        <table class="desktop-tasks-table" style="min-width: 900px;">
            <colgroup>
                <col style="width: 25%;">
                <col style="width: 12%;">
                <col style="width: 11%;">
                <col style="width: 10%;">
                <col style="width: 8%;">
                <col style="width: 12%;">
                <col style="width: 12%;">
                <col style="width: 10%;">
            </colgroup>
            <thead>
                <tr>
                    ${columns.map(col => `
                        <th onclick="sortDesktopTasks('${col.field}')" class="${sortField === col.field ? 'sorted' : ''}">
                            ${col.label}
                            <span class="sort-icon">${sortField === col.field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${sorted.map(task => {
                    const statusInfo = getStatusInfo(task.status, task.completed);
                    const badgeStyle = badgeColors[statusInfo.color] || badgeColors.secondary;
                    const member = getTeamMember(task.owner);
                    const ownerName = member ? member.name : (task.owner || 'Unassigned');
                    const prioColor = priorityColors[task.priority] || '#9ca3af';
                    const normalizedStatus = normalizeTaskStatus(task.status, task.completed ? 'completed' : 'todo');
                    const rowStatusClass = task.completed ? 'row-completed' : `row-${normalizedStatus}`;
                    
                    return `
                        <tr class="${rowStatusClass}" onclick="showDesktopTaskDetail('${task.id}')">
                            <td><span class="table-task-name">${escapeHtml(task.name)}</span></td>
                            <td>${escapeHtml(ownerName)}</td>
                            <td><span class="table-status-badge" style="${badgeStyle}">${statusInfo.label}</span></td>
                            <td>
                                <span class="table-priority-badge">
                                    <span class="table-priority-dot" style="background: ${prioColor};"></span>
                                    ${escapeHtml(task.priority || 'normal')}
                                </span>
                            </td>
                            <td>${task.estimatedHours || '-'}h</td>
                            <td>${task.startDate ? formatDate(task.startDate) : '-'}</td>
                            <td>${task.endDate ? formatDate(task.endDate) : '-'}</td>
                            <td>
                                ${task.jiraUrl ? `<a href="${sanitizeUrl(task.jiraUrl)}" target="_blank" rel="noopener noreferrer" class="table-jira-link" onclick="event.stopPropagation();">
                                    ${escapeHtml(task.jiraId || 'Link')}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </a>` : (task.jiraId || '-')}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function sortDesktopTasks(field) {
    if (desktopState.taskSort.field === field) {
        desktopState.taskSort.direction = desktopState.taskSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        desktopState.taskSort.field = field;
        desktopState.taskSort.direction = 'asc';
    }
    applyDesktopFilters();
}

// =============================================
// BANDWIDTH GRID
// =============================================

function renderDesktopBandwidthGrid() {
    const container = document.getElementById('desktop-bandwidth-grid');
    if (!container || !appData.teamMembers) return;
    
    const tasksByOwner = {};
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            const owner = task.owner || 'unassigned';
            if (!tasksByOwner[owner]) tasksByOwner[owner] = [];
            tasksByOwner[owner].push(task);
        });
    }
    
    container.innerHTML = appData.teamMembers.map(member => {
        const sprintBandwidth = getSprintBandwidth(member);
        const remainingBandwidth = getRemainingSprintBandwidth(member);
        const memberTasks = tasksByOwner[member.id] || [];
        const allocatedHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
        const utilizationPercent = sprintBandwidth > 0 ? Math.round((allocatedHours / sprintBandwidth) * 100) : 0;
        const availableHours = Math.max(0, sprintBandwidth - allocatedHours);
        
        const gradient = getGradientForColorClass(member.colorClass);
        const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
        
        const progressColor = utilizationPercent > 100 ? 'var(--danger)' : 
                             utilizationPercent > 80 ? 'var(--warning)' : 'var(--success)';
        
        return `
            <div class="desktop-bandwidth-card" data-tip="${escapeHtml(member.name)}: ${memberTasks.length} tasks, ${allocatedHours}h / ${sprintBandwidth}h capacity">
                <div class="bandwidth-card-header">
                    <div class="bandwidth-card-avatar" style="background: ${gradient};">
                        ${initials}
                    </div>
                    <div class="bandwidth-card-info">
                        <h4>${escapeHtml(member.name)}</h4>
                        <span>${escapeHtml(member.role || 'Team Member')}</span>
                    </div>
                    <span class="bandwidth-card-task-count" data-tip="${memberTasks.length} task${memberTasks.length !== 1 ? 's' : ''} assigned">${memberTasks.length} tasks</span>
                </div>
                <div class="bandwidth-card-progress">
                    <div class="bandwidth-progress-bar">
                        <div class="bandwidth-progress-fill" style="width: ${Math.min(utilizationPercent, 100)}%; background: ${progressColor};"></div>
                    </div>
                    <div class="bandwidth-progress-text">
                        <span>${allocatedHours}h allocated</span>
                        <span>${utilizationPercent}%</span>
                    </div>
                </div>
                <div class="bandwidth-card-stats">
                    <div class="bandwidth-stat">
                        <span class="bandwidth-stat-value">${sprintBandwidth}h</span>
                        <span class="bandwidth-stat-label">Total</span>
                    </div>
                    <div class="bandwidth-stat">
                        <span class="bandwidth-stat-value">${availableHours}h</span>
                        <span class="bandwidth-stat-label">Available</span>
                    </div>
                    <div class="bandwidth-stat">
                        <span class="bandwidth-stat-value">${Math.round(remainingBandwidth)}h</span>
                        <span class="bandwidth-stat-label">Remaining</span>
                    </div>
                    <div class="bandwidth-stat">
                        <span class="bandwidth-stat-value">${memberTasks.filter(t => t.completed).length}/${memberTasks.length}</span>
                        <span class="bandwidth-stat-label">Done</span>
                    </div>
                </div>
                ${(() => {
                    const avail = getNextAvailableDay(member, 2);
                    if (avail) {
                        const isToday = avail.date === getTodayLocalDate();
                        return `<div class="next-available-badge" data-tip="Next day with ${avail.freeHours}h free">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${isToday ? 'Today' : formatDate(avail.date)} · ${avail.freeHours}h free
                        </div>`;
                    } else {
                        return `<div class="next-available-badge busy" data-tip="No available slot this sprint">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                            Fully booked
                        </div>`;
                    }
                })()}
                <div class="bandwidth-view-details-btn" data-tip="View full profile for ${escapeHtml(member.name)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    View Details
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </div>
        `;
    }).join('');
}

// =============================================
// MILESTONES
// =============================================

function renderDesktopMilestones() {
    const container = document.getElementById('desktop-milestones-timeline');
    const summaryGrid = document.getElementById('milestone-summary-grid');
    
    if (!appData.milestones || appData.milestones.length === 0) {
        if (container) {
            container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--text-muted);"><p>No milestones found</p></div>`;
        }
        if (summaryGrid) summaryGrid.innerHTML = '';
        return;
    }
    
    const today = getTodayLocalDate();
    const todayDate = new Date(today);
    const sortedMilestones = [...appData.milestones].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Compute stats
    const total = sortedMilestones.length;
    let completedCount = 0, upcomingCount = 0, overdueCount = 0, inProgressCount = 0;
    
    sortedMilestones.forEach(m => {
        const mDate = new Date(m.date);
        const isOverdue = mDate < todayDate && m.status !== 'completed';
        if (m.status === 'completed') completedCount++;
        else if (isOverdue) overdueCount++;
        else if (m.status === 'in-progress') inProgressCount++;
        else upcomingCount++;
    });
    
    // Render summary stats
    if (summaryGrid) {
        summaryGrid.innerHTML = `
            <div class="milestone-stat-card">
                <div class="milestone-stat-icon total">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                </div>
                <div class="milestone-stat-info">
                    <span class="milestone-stat-value">${total}</span>
                    <span class="milestone-stat-label">Total Milestones</span>
                </div>
            </div>
            <div class="milestone-stat-card">
                <div class="milestone-stat-icon completed">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <div class="milestone-stat-info">
                    <span class="milestone-stat-value">${completedCount}</span>
                    <span class="milestone-stat-label">Completed</span>
                </div>
            </div>
            <div class="milestone-stat-card">
                <div class="milestone-stat-icon upcoming">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
                <div class="milestone-stat-info">
                    <span class="milestone-stat-value">${upcomingCount + inProgressCount}</span>
                    <span class="milestone-stat-label">In Progress / Upcoming</span>
                </div>
            </div>
            <div class="milestone-stat-card">
                <div class="milestone-stat-icon overdue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div class="milestone-stat-info">
                    <span class="milestone-stat-value">${overdueCount}</span>
                    <span class="milestone-stat-label">Overdue</span>
                </div>
            </div>
        `;
    }
    
    // Render timeline nodes
    if (container) {
        const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
        const timelineHint = overdueCount > 0 
            ? `<p class="section-hint-text" style="margin: 0 0 16px; padding-left: 32px;">${completionRate}% of milestones completed. <strong style="color: var(--danger);">${overdueCount} overdue</strong> — review deadlines.</p>`
            : `<p class="section-hint-text" style="margin: 0 0 16px; padding-left: 32px;">${completionRate}% of milestones completed. All timelines on track.</p>`;
        
        container.innerHTML = timelineHint + sortedMilestones.map(milestone => {
            const milestoneDate = new Date(milestone.date);
            const isOverdue = milestoneDate < todayDate && milestone.status !== 'completed';
            const daysLeft = Math.ceil((milestoneDate - todayDate) / (1000 * 60 * 60 * 24));
            const daysOverdue = Math.abs(daysLeft);
            
            let statusKey = 'pending';
            if (milestone.status === 'completed') statusKey = 'completed';
            else if (milestone.status === 'in-progress') statusKey = 'in-progress';
            else if (isOverdue) statusKey = 'overdue';
            else if (daysLeft <= 7 && daysLeft > 0) statusKey = 'upcoming';
            
            const badgeIcons = {
                'completed': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"></polyline></svg>',
                'in-progress': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
                'overdue': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
                'upcoming': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
                'pending': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
            };
            const badgeLabels = {
                'completed': 'Completed',
                'in-progress': 'In Progress',
                'overdue': 'Overdue',
                'upcoming': 'Upcoming',
                'pending': 'Pending'
            };
            
            const progress = milestone.progress !== undefined ? milestone.progress : 0;
            
            const overdueWarning = isOverdue ? `
                <div class="milestone-overdue-warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue
                </div>
            ` : '';
            
            const dueDateLabel = milestone.status === 'completed' ? 'Completed' :
                                daysLeft === 0 ? 'Due today' :
                                daysLeft === 1 ? 'Due tomorrow' :
                                daysLeft > 1 ? `${daysLeft} days left` :
                                `${daysOverdue} days overdue`;
            
            return `
                <div class="milestone-node">
                    <div class="milestone-node-dot dot-${statusKey}"></div>
                    <div class="milestone-node-card card-${statusKey}">
                        <div class="milestone-card-top">
                            <span class="milestone-card-title">${escapeHtml(milestone.title)}</span>
                            <span class="milestone-card-badge badge-${statusKey}">${badgeIcons[statusKey] || ''} ${badgeLabels[statusKey]}</span>
                        </div>
                        <div class="milestone-card-meta">
                            <span class="milestone-meta-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                ${formatDate(milestone.date)}
                            </span>
                            <span class="milestone-meta-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                ${escapeHtml(milestone.assignee || 'Unassigned')}
                            </span>
                            <span class="milestone-meta-item" style="color: ${statusKey === 'overdue' ? 'var(--danger)' : 'var(--text-muted)'}; font-weight: ${statusKey === 'overdue' ? '600' : '400'};">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                ${dueDateLabel}
                            </span>
                        </div>
                        <div class="milestone-card-progress">
                            <div class="milestone-progress-track">
                                <div class="milestone-progress-fill fill-${statusKey}" style="width: ${progress}%;"></div>
                            </div>
                            <div class="milestone-progress-info">
                                <span>${milestone.description || ''}</span>
                                <span class="milestone-progress-percent">${progress}%</span>
                            </div>
                        </div>
                        ${overdueWarning}
                    </div>
                </div>
            `;
        }).join('');
    }
}

// =============================================
// SPRINT CALENDAR (Ported from Mobile)
// =============================================

function renderDesktopSprintCalendar() {
    const container = document.getElementById('desktop-sprint-calendar');
    if (!container || !appData.project || !appData.tasks) return;
    
    const todayStr = getTodayLocalDate();
    
    // Build task count by date with status breakdown
    const loadByDate = {};
    const statusByDate = {};
    appData.tasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        const dates = generateDateRange(task.startDate, task.endDate);
        const status = normalizeTaskStatus(task);
        dates.forEach(d => {
            if (!isWeekend(d)) {
                loadByDate[d] = (loadByDate[d] || 0) + 1;
                if (!statusByDate[d]) statusByDate[d] = { completed: 0, blocked: 0, inProgress: 0, review: 0, todo: 0 };
                if (task.completed || status === 'completed') statusByDate[d].completed++;
                else if (status === 'blocked') statusByDate[d].blocked++;
                else if (status === 'in-progress') statusByDate[d].inProgress++;
                else if (status === 'review') statusByDate[d].review++;
                else statusByDate[d].todo++;
            }
        });
    });
    
    const sprintDates = generateDateRange(appData.project.startDate, appData.project.endDate);
    
    // Group into weeks
    const weekGroups = [];
    let currentWeek = { dates: [], weekNumber: 1 };
    
    sprintDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = date.getDay();
        
        if (dayOfWeek === 0 && currentWeek.dates.length > 0) {
            weekGroups.push(currentWeek);
            currentWeek = { dates: [], weekNumber: weekGroups.length + 1 };
        }
        
        currentWeek.dates.push({
            dateStr,
            date,
            dayOfWeek,
            dayNum: date.getDate(),
            isToday: dateStr === todayStr,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            taskCount: loadByDate[dateStr] || 0
        });
    });
    
    if (currentWeek.dates.length > 0) weekGroups.push(currentWeek);
    
    const maxTasks = Math.max(3, ...Object.values(loadByDate));
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Calculate sprint summary stats
    const totalSprintTasks = appData.tasks ? appData.tasks.length : 0;
    const totalCompleted = appData.tasks ? appData.tasks.filter(t => t.completed).length : 0;
    const totalBlocked = appData.tasks ? appData.tasks.filter(t => normalizeTaskStatus(t.status) === 'blocked').length : 0;
    const totalInProgress = appData.tasks ? appData.tasks.filter(t => normalizeTaskStatus(t.status) === 'in-progress').length : 0;
    const workingDatesCount = sprintDates.filter(d => !isWeekend(d)).length;
    const avgTasksPerDay = workingDatesCount > 0 ? (Object.values(loadByDate).reduce((a, b) => a + b, 0) / workingDatesCount).toFixed(1) : 0;
    const peakDay = Object.entries(loadByDate).sort((a, b) => b[1] - a[1])[0];
    const peakDayLabel = peakDay ? `${new Date(peakDay[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${peakDay[1]} tasks)` : 'N/A';
    
    container.innerHTML = `
        <div class="cal-summary-strip">
            <div class="cal-summary-item"><span class="cal-summary-val">${workingDatesCount}</span><span class="cal-summary-lbl">Work Days</span></div>
            <div class="cal-summary-item"><span class="cal-summary-val">${avgTasksPerDay}</span><span class="cal-summary-lbl">Avg Tasks/Day</span></div>
            <div class="cal-summary-item"><span class="cal-summary-val">${peakDayLabel}</span><span class="cal-summary-lbl">Peak Day</span></div>
            <div class="cal-summary-item"><span class="cal-summary-val">${totalCompleted}/${totalSprintTasks}</span><span class="cal-summary-lbl">Completed</span></div>
            ${totalBlocked > 0 ? `<div class="cal-summary-item cal-summary-danger"><span class="cal-summary-val">${totalBlocked}</span><span class="cal-summary-lbl">Blocked</span></div>` : ''}
        </div>
        <div class="desktop-calendar-grid desktop-calendar-compact">
            <div class="desktop-calendar-header-row">
                <div class="desktop-calendar-weekday"></div>
                ${weekdays.map((d, i) => `<div class="desktop-calendar-weekday ${i === 0 || i === 6 ? 'weekend' : ''}">${d}</div>`).join('')}
            </div>
            ${weekGroups.map(week => {
                const isCurrentWeek = week.dates.some(d => d.isToday);
                const weekTasks = week.dates.reduce((sum, d) => sum + d.taskCount, 0);
                return `
                    <div class="desktop-calendar-week-row ${isCurrentWeek ? 'current-week' : ''}">
                        <div class="desktop-calendar-week-label" data-tip="Week ${week.weekNumber}: ${weekTasks} tasks">W${week.weekNumber}</div>
                        ${week.dates.map(day => {
                            const intensity = maxTasks > 0 ? Math.min(day.taskCount / maxTasks, 1) : 0;
                            const monthShort = day.date.toLocaleDateString('en-US', { month: 'short' });
                            const ds = statusByDate[day.dateStr] || { completed: 0, blocked: 0, inProgress: 0, review: 0, todo: 0 };
                            // Determine dominant status for the day
                            let dayStatusClass = '';
                            if (!day.isWeekend && day.taskCount > 0) {
                                if (ds.blocked > 0) dayStatusClass = 'cal-has-blocked';
                                else if (ds.inProgress > 0) dayStatusClass = 'cal-has-progress';
                                else if (ds.review > 0) dayStatusClass = 'cal-has-review';
                                else if (ds.completed === day.taskCount) dayStatusClass = 'cal-all-done';
                                else dayStatusClass = 'cal-has-todo';
                            }
                            return `
                                <div class="desktop-calendar-day 
                                    ${day.isToday ? 'today' : ''} 
                                    ${day.isWeekend ? 'weekend' : ''} 
                                    ${day.taskCount > 0 && !day.isWeekend ? 'has-tasks' : ''} 
                                    ${day.taskCount >= 3 ? 'high-load' : ''}
                                    ${dayStatusClass}"
                                    style="--intensity: ${intensity.toFixed(2)}; grid-column: ${day.dayOfWeek + 2};"
                                    data-tip="${monthShort} ${day.dayNum}: ${day.isWeekend ? 'Weekend (No Work)' : `${day.taskCount} task${day.taskCount !== 1 ? 's' : ''} — ✅${ds.completed} 🔵${ds.inProgress} 🔴${ds.blocked} 🔍${ds.review} ⬜${ds.todo}`}">
                                    <span class="day-num">${day.dayNum}</span>
                                    ${!day.isWeekend && day.taskCount > 0 ? `<span class="day-tasks">${day.taskCount}</span>` : ''}
                                    ${day.isWeekend ? '<span class="day-off-mark">✕</span>' : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('')}
        </div>
        <div class="desktop-calendar-legend">
            <div class="legend-item">
                <div class="legend-swatch" style="background: rgba(239, 68, 68, 0.12); border: 1px dashed rgba(239,68,68,0.4);"></div>
                <span class="legend-label">Weekend</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch" style="background: rgba(16, 185, 129, 0.35);"></div>
                <span class="legend-label">All Done</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch" style="background: rgba(59, 130, 246, 0.3);"></div>
                <span class="legend-label">In Progress</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch" style="background: rgba(239, 68, 68, 0.3);"></div>
                <span class="legend-label">Has Blocked</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch" style="background: rgba(6, 182, 212, 0.3);"></div>
                <span class="legend-label">In Review</span>
            </div>
            <div class="legend-item">
                <div class="legend-swatch" style="border: 2px solid var(--primary); background: rgba(59, 130, 246, 0.1);"></div>
                <span class="legend-label">Today</span>
            </div>
        </div>
    `;
}

// =============================================
// TEAM AVAILABILITY CALENDAR
// =============================================

function renderTeamAvailability() {
    const container = document.getElementById('desktop-team-availability');
    if (!container || !appData.project || !appData.teamMembers || !appData.tasks) return;
    
    const sprintDates = generateDateRange(appData.project.startDate, appData.project.endDate);
    const todayStr = getTodayLocalDate();
    
    // Only show working days (filter out weekends) + limit to ~14 days for readability
    const workingDates = sprintDates.filter(d => !isWeekend(d));
    
    // Find the current/upcoming 2-week window
    const todayIndex = workingDates.findIndex(d => d >= todayStr);
    const startIdx = Math.max(0, todayIndex > 0 ? todayIndex - 2 : 0);
    const displayDates = workingDates.slice(startIdx, startIdx + 12);
    
    if (displayDates.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--text-muted);">No working days to display</div>';
        return;
    }
    
    // Build leave lookup per member: { memberId: Set(['2026-02-16', ...]) }
    const memberLeaves = {};
    appData.teamMembers.forEach(m => {
        memberLeaves[m.id] = new Set(m.leaves || []);
    });
    
    // Build task count per member per day
    const memberLoad = {};
    appData.teamMembers.forEach(m => { memberLoad[m.id] = {}; });
    
    appData.tasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        const dates = generateDateRange(task.startDate, task.endDate);
        const ownerId = task.owner;
        dates.forEach(d => {
            if (isWeekend(d)) return;
            if (ownerId === 'both') {
                appData.teamMembers.forEach(m => {
                    if (!memberLoad[m.id]) memberLoad[m.id] = {};
                    memberLoad[m.id][d] = (memberLoad[m.id][d] || 0) + 1;
                });
            } else if (memberLoad[ownerId]) {
                memberLoad[ownerId][d] = (memberLoad[ownerId][d] || 0) + 1;
            }
        });
    });
    
    const colCount = displayDates.length;
    const gridCols = `120px repeat(${colCount}, 1fr)`;
    
    container.innerHTML = `
        <p class="team-avail-hint">Showing ${displayDates.length} working days around today. Numbers indicate active tasks assigned.</p>
        <div class="team-avail-grid">
            <div class="team-avail-header-row" style="grid-template-columns: ${gridCols};">
                <div class="team-avail-day-header">Member</div>
                ${displayDates.map(d => {
                    const dt = new Date(d + 'T00:00:00');
                    const dayNum = dt.getDate();
                    const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 2);
                    const isToday = d === todayStr;
                    const isPast = d < todayStr;
                    return `<div class="team-avail-day-header ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" data-tip="${formatDate(d)}" style="${isToday ? 'color: var(--primary); font-weight: 700;' : ''}">${dayName}<br>${dayNum}</div>`;
                }).join('')}
            </div>
            ${appData.teamMembers.map(member => {
                const leaveSet = memberLeaves[member.id];
                return `<div class="team-avail-row" style="grid-template-columns: ${gridCols};">
                    <div class="team-avail-name" data-tip="${member.name}">${escapeHtml(member.name.split(' ')[0])}</div>
                    ${displayDates.map(d => {
                        const isPast = d < todayStr;
                        const isOnLeave = leaveSet.has(d);
                        const taskCount = (memberLoad[member.id] && memberLoad[member.id][d]) || 0;
                        
                        let cellClass = '';
                        let label = '';
                        let title = '';
                        
                        if (isOnLeave) {
                            cellClass = 'avail-leave';
                            label = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';
                            title = `${member.name}: On leave`;
                        } else if (isPast) {
                            cellClass = taskCount > 0 ? 'avail-past-busy' : 'avail-past';
                            label = taskCount > 0 ? String(taskCount) : '-';
                            title = `${member.name}: ${taskCount} task${taskCount !== 1 ? 's' : ''} on ${formatDate(d)} (past)`;
                        } else if (taskCount >= 3) {
                            cellClass = 'avail-overloaded';
                            label = String(taskCount);
                            title = `${member.name}: ${taskCount} tasks — overloaded`;
                        } else if (taskCount > 0) {
                            cellClass = 'avail-busy';
                            label = String(taskCount);
                            title = `${member.name}: ${taskCount} task${taskCount !== 1 ? 's' : ''}`;
                        } else {
                            cellClass = 'avail-free';
                            label = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                            title = `${member.name}: Free on ${formatDate(d)}`;
                        }
                        
                        return `<div class="team-avail-cell ${cellClass}" data-tip="${title}">${label}</div>`;
                    }).join('')}
                </div>`;
            }).join('')}
        </div>
        <div class="team-avail-legend">
            <div class="team-avail-legend-item"><div class="team-avail-legend-dot" style="background: rgba(16, 185, 129, 0.3);"></div> Free</div>
            <div class="team-avail-legend-item"><div class="team-avail-legend-dot" style="background: rgba(59, 130, 246, 0.3);"></div> Busy (1-2)</div>
            <div class="team-avail-legend-item"><div class="team-avail-legend-dot" style="background: rgba(239, 68, 68, 0.3);"></div> Overloaded (3+)</div>
            <div class="team-avail-legend-item"><div class="team-avail-legend-dot" style="background: rgba(245, 158, 11, 0.35);"></div> On Leave</div>
            <div class="team-avail-legend-item"><div class="team-avail-legend-dot" style="background: var(--gray-200);"></div> Past Day</div>
        </div>
        <p class="team-avail-data-hint">To mark leaves, add a <strong>leaves</strong> column to your MEMBERS sheet with comma-separated dates (e.g. <code>2026-02-16,2026-02-17</code>).</p>
    `;
}

// =============================================
// WEEKLY BREAKDOWN
// =============================================

function renderDesktopWeeklyBreakdown() {
    const container = document.getElementById('desktop-weekly-breakdown');
    if (!container || !appData.project || !appData.tasks) return;
    
    const sprintDates = generateDateRange(appData.project.startDate, appData.project.endDate);
    const todayStr = getTodayLocalDate();
    
    // Group into weeks
    const weeks = [];
    let weekStart = null;
    let weekDates = [];
    
    sprintDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = date.getDay();
        
        if (dayOfWeek === 1 || weekStart === null) { // Monday or first day
            if (weekDates.length > 0) {
                weeks.push({ start: weekDates[0], end: weekDates[weekDates.length - 1], dates: [...weekDates] });
            }
            weekDates = [];
            weekStart = dateStr;
        }
        weekDates.push(dateStr);
    });
    if (weekDates.length > 0) {
        weeks.push({ start: weekDates[0], end: weekDates[weekDates.length - 1], dates: [...weekDates] });
    }
    
    container.innerHTML = weeks.map((week, idx) => {
        const isCurrentWeek = week.dates.includes(todayStr);
        
        // Find tasks that overlap this week
        const weekTasks = appData.tasks.filter(task => {
            if (!task.startDate || !task.endDate) return false;
            return task.startDate <= week.end && task.endDate >= week.start;
        });
        
        const inProgress = weekTasks.filter(t => normalizeTaskStatus(t.status) === 'in-progress').length;
        const completed = weekTasks.filter(t => normalizeTaskStatus(t.status) === 'completed').length;
        const blocked = weekTasks.filter(t => normalizeTaskStatus(t.status) === 'blocked').length;
        
        return `
            <div style="padding: 16px; background: ${isCurrentWeek ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface-secondary)'}; border-radius: 10px; border: 1px solid ${isCurrentWeek ? 'var(--primary)' : 'var(--card-border)'}; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-primary);">Week ${idx + 1} ${isCurrentWeek ? '(Current)' : ''}</span>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${formatDate(week.start)} - ${formatDate(week.end)}</span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span style="padding: 4px 10px; background: var(--badge-bg); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: var(--badge-text);">${weekTasks.length} tasks</span>
                    ${inProgress > 0 ? `<span style="padding: 4px 10px; background: rgba(59, 130, 246, 0.1); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #3b82f6;">${inProgress} active</span>` : ''}
                    ${completed > 0 ? `<span style="padding: 4px 10px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #10b981;">${completed} done</span>` : ''}
                    ${blocked > 0 ? `<span style="padding: 4px 10px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #ef4444;">${blocked} blocked</span>` : ''}
                </div>
                ${weekTasks.length > 0 ? `
                <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px;">
                    ${weekTasks.slice(0, 5).map(task => {
                        const ns = normalizeTaskStatus(task.status, task.completed ? 'completed' : 'todo');
                        const dotColor = ns === 'completed' ? '#10b981' : ns === 'in-progress' ? '#3b82f6' : ns === 'blocked' ? '#ef4444' : ns === 'review' ? '#06b6d4' : '#9ca3af';
                        const bgTint = ns === 'completed' ? 'rgba(16,185,129,0.06)' : ns === 'in-progress' ? 'rgba(59,130,246,0.05)' : ns === 'blocked' ? 'rgba(239,68,68,0.05)' : ns === 'review' ? 'rgba(6,182,212,0.05)' : 'var(--card-bg)';
                        const member = getTeamMember(task.owner);
                        const ownerLabel = member ? member.name : (task.owner || '');
                        const statusInfo = getStatusInfo(task.status, task.completed);
                        return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: ${bgTint}; border-left: 3px solid ${dotColor}; border-radius: 6px; cursor: pointer; font-size: 0.82rem;" onclick="showDesktopTaskDetail('${task.id}')">
                            <div style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1;">
                                <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
                                <span style="color: var(--text-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;${task.completed ? 'text-decoration:line-through;opacity:0.65;' : ''}">${escapeHtml(task.name)}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px;">
                                <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:${dotColor}15;color:${dotColor};font-weight:500;">${statusInfo.label}</span>
                                <span style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(ownerLabel)}</span>
                            </div>
                        </div>`;
                    }).join('')}
                    ${weekTasks.length > 5 ? `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 4px;">+${weekTasks.length - 5} more tasks</div>` : ''}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function updateLegend() {
    const legend = document.querySelector('.legend');
    if (!legend) return;
    
    let legendHTML = '';
    
    // Status-based Gantt bar colors
    legendHTML += `
        <div class="legend-item">
            <div class="legend-color" style="background:#10b981;"></div>Completed
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#3b82f6;"></div>In Progress
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#ef4444;"></div>Blocked
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#06b6d4;"></div>In Review
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#9ca3af;"></div>To Do / Pending
        </div>
    `;
    
    // Priority overrides
    legendHTML += `
        <div class="legend-item">
            <div class="legend-color" style="background:linear-gradient(135deg,#ef4444,#dc2626);border:2px solid #fff;"></div>Urgent Priority
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:rgba(108,117,125,0.8);opacity:0.9;"></div>Low Priority
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:rgba(239,68,68,0.12);border:1px dashed #ef4444;"></div>Weekend / Holiday
        </div>
    `;
    
    legend.innerHTML = legendHTML;
}

function getGradientForColorClass(colorClass) {
    const colors = {
        'primary': '#2563eb',
        'success': '#059669',
        'warning': '#d97706',
        'danger': '#dc2626',
        'info': '#0891b2'
    };
    return colors[colorClass] || colors.primary;
}

// =============================================
// INITIALIZATION
// =============================================

// Note: renderAll() is called from dataLoader.js after data loads
// This DOMContentLoaded handler is just a fallback

/**
 * Dynamically create task sections for each team member
 */
function setupDynamicSections() {
    if (!appData.teamMembers || appData.teamMembers.length === 0) return;
    
    // Find the milestones section to insert task sections before it
    const sections = document.querySelectorAll('.section');
    let milestonesSection = null;
    
    for (const sec of sections) {
        const header = sec.querySelector('.section-header h2');
        if (header && header.textContent.toLowerCase().includes('milestone')) {
            milestonesSection = sec;
            break;
        }
    }
    
    if (!milestonesSection) return;
    
    // Check if task sections already exist
    const existingTaskSections = document.querySelectorAll('.section .task-grid');
    if (existingTaskSections.length > 0) return; // Already set up
    
    // Create task sections for each team member
    appData.teamMembers.forEach((member, index) => {
        const iconClass = `icon-${member.id}`;
        const gradient = getGradientForColorClass(member.colorClass);
        
        const sectionHTML = `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon ${iconClass}" style="background:${gradient};"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                    <h2>${member.name}'s Tasks</h2>
                </div>
                <div class="task-grid">
                    <!-- Dynamic task cards -->
                </div>
            </div>
        `;
        
        milestonesSection.insertAdjacentHTML('beforebegin', sectionHTML);
    });
}

/**
 * Add toolbar with controls
 */
function addToolbar() {
    const content = document.querySelector('.content');
    if (!content) return;
    
    // Check if toolbar already exists
    if (document.getElementById('toolbar')) return;
    
    const ownerOptions = appData.teamMembers.map(m => 
        `<option value="${m.id}">${m.name}</option>`
    ).join('');
    
    content.insertAdjacentHTML('afterbegin', `
        <div id="toolbar" role="toolbar" aria-label="Task filtering and actions toolbar">
            <div class="toolbar-group toolbar-actions">
                <button class="btn btn-print" data-action="print" aria-label="Print report">Print</button>
                <button class="btn btn-refresh" data-action="refresh" aria-label="Refresh data from Google Sheets">Refresh</button>
                <button class="btn btn-export" data-action="export" aria-label="Export data as JSON">Export</button>
            </div>
            <input type="text" placeholder="Search tasks..." class="toolbar-search" data-filter="search" aria-label="Search tasks">
            <div class="toolbar-group toolbar-filters">
                <select class="toolbar-select" data-filter="owner" aria-label="Filter by owner">
                    <option value="all">All Owners</option>
                    ${ownerOptions}
                    <option value="both">Both</option>
                </select>
                <select class="toolbar-select" data-filter="priority" aria-label="Filter by priority">
                    <option value="all">All Priorities</option>
                    <option value="urgent">Urgent</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                </select>
                <label class="toolbar-checkbox">
                    <input type="checkbox" data-filter="completed" aria-label="Hide completed tasks">
                    <span>Hide Completed</span>
                </label>
            </div>
        </div>
    `);
    
    // Event delegation for better performance
    const toolbar = document.getElementById('toolbar');
    toolbar.addEventListener('click', handleToolbarAction);
    toolbar.addEventListener('change', handleToolbarFilter);
    toolbar.addEventListener('input', handleToolbarInput);
}

// Event handlers using delegation
function handleToolbarAction(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    
    switch(action) {
        case 'print':
            window.print();
            break;
        case 'refresh':
            if (typeof refreshData === 'function') refreshData();
            break;
        case 'export':
            if (typeof exportData === 'function') exportData();
            break;
    }
}

function handleToolbarFilter(e) {
    const filterType = e.target.dataset.filter;
    if (!filterType) return;
    
    switch(filterType) {
        case 'owner':
            filterOwner(e.target.value);
            break;
        case 'priority':
            filterPriority(e.target.value);
            break;
        case 'completed':
            filterCompleted(e.target.checked);
            break;
    }
}

function handleToolbarInput(e) {
    if (e.target.dataset.filter === 'search') {
        filterSearch(e.target.value);
    }
}

// =============================================
// EXECUTIVE DASHBOARD FUNCTIONS
// =============================================

function renderExecutiveDashboard() {
    if (!appData.tasks || !appData.teamMembers) return;
    
    // Calculate sprint progress
    const totalTasks = appData.tasks.length;
    const completedTasks = appData.tasks.filter(task => task.completed).length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Update sprint progress
    const progressValue = document.getElementById('sprint-progress-value');
    const progressSubtitle = document.getElementById('sprint-progress-subtitle');
    if (progressValue) progressValue.textContent = `${progressPercent}%`;
    if (progressSubtitle) progressSubtitle.textContent = `${completedTasks} of ${totalTasks} tasks completed`;
    
    // Calculate team utilization using SPRINT-BASED bandwidth
    const teamSprintBandwidth = getTeamSprintBandwidth();
    const totalAllocatedHours = appData.tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const utilizationPercent = teamSprintBandwidth > 0 ? 
        Math.min(Math.round((totalAllocatedHours / teamSprintBandwidth) * 100), 999) : 0;
    
    const utilizationValue = document.getElementById('team-utilization-value');
    const utilizationSubtitle = document.getElementById('team-utilization-subtitle');
    if (utilizationValue) utilizationValue.textContent = `${utilizationPercent}%`;
    if (utilizationSubtitle) {
        utilizationSubtitle.textContent = `${totalAllocatedHours}h / ${teamSprintBandwidth}h sprint capacity`;
    }
    
    // Calculate risk level
    const blockedTasks = appData.tasks.filter(task => 
        task.status && task.status.toLowerCase().includes('blocked') ||
        task.blockers && task.blockers.trim() !== ''
    ).length;
    
    const delayedTasks = appData.tasks.filter(task => 
        task.status && task.status.toLowerCase().includes('delayed')
    ).length;
    
    // Risk factors: blocked tasks, overutilization, delays
    const overUtilized = utilizationPercent > 100;
    const riskLevel = blockedTasks > 2 || delayedTasks > 1 || overUtilized ? 'High' : 
                     blockedTasks > 0 || delayedTasks > 0 || utilizationPercent > 90 ? 'Medium' : 'Low';
    
    const riskValue = document.getElementById('risk-indicator-value');
    const riskSubtitle = document.getElementById('risk-indicator-subtitle');
    if (riskValue) riskValue.textContent = riskLevel;
    if (riskSubtitle) {
        const riskFactors = [];
        if (blockedTasks > 0) riskFactors.push(`${blockedTasks} blocked`);
        if (delayedTasks > 0) riskFactors.push(`${delayedTasks} delayed`);
        if (overUtilized) riskFactors.push('over capacity');
        riskSubtitle.textContent = riskFactors.length > 0 ? riskFactors.join(', ') : 'No risks identified';
    }
    
    // Update risk indicator color
    const riskCard = document.querySelector('.risk-indicator');
    if (riskCard) {
        riskCard.classList.remove('risk-low', 'risk-medium', 'risk-high');
        riskCard.classList.add(`risk-${riskLevel.toLowerCase()}`);
    }
    
    // Render status breakdown
    renderStatusBreakdown();
    
    // Update burndown chart (simplified version)
    updateBurndownChart(progressPercent);
}

function renderStatusBreakdown() {
    const statusBars = document.getElementById('status-bars');
    if (!statusBars || !appData.tasks) return;
    
    // Count tasks by status
    const statusCounts = {};
    const totalTasks = appData.tasks.length;
    
    appData.tasks.forEach(task => {
        const status = task.completed ? 'Completed' : (task.status || 'Not Started');
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // Define status colors
    const statusColors = {
        'Completed': '#10b981',
        'In Progress': '#f59e0b', 
        'Review': '#06b6d4',
        'Pending': '#6b7280',
        'Blocked': '#ef4444',
        'Delayed': '#f97316',
        'Not Started': '#94a3b8'
    };
    
    // Generate status bars HTML
    const statusItems = Object.entries(statusCounts)
        .sort(([,a], [,b]) => b - a)
        .map(([status, count]) => {
            const percentage = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
            const color = statusColors[status] || '#94a3b8';
            
            return `
                <div class="status-bar-item">
                    <div class="status-bar-label">${status}</div>
                    <div class="status-bar-container">
                        <div class="status-bar-fill" style="width: ${percentage}%; background-color: ${color};"></div>
                    </div>
                    <div class="status-bar-count">${count}</div>
                </div>
            `;
        }).join('');
    
    statusBars.innerHTML = statusItems;
}

function updateBurndownChart(progressPercent) {
    const burndownLine = document.querySelector('.burndown-line');
    if (burndownLine) {
        // Simulate burndown progress (in real app, this would be calculated from actual data)
        const remainingWork = 100 - progressPercent;
        burndownLine.style.width = `${remainingWork}%`;
    }
}

// =============================================
// KEYBOARD NAVIGATION
// =============================================

let currentFocusIndex = -1;
let focusableElements = [];

function initializeKeyboardNavigation() {
    // Make main sections focusable
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.setAttribute('tabindex', '0');
    });
    
    // Add keyboard event listeners
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    // Initialize focusable elements
    updateFocusableElements();
}

function updateFocusableElements() {
    focusableElements = Array.from(document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), .section, .task-card, .gantt-row'
    )).filter(el => {
        return el.offsetWidth > 0 && el.offsetHeight > 0 && 
               window.getComputedStyle(el).visibility !== 'hidden';
    });
}

function handleKeyboardNavigation(e) {
    const activeElement = document.activeElement;
    
    // Handle different key combinations
    switch(e.key) {
        case 'ArrowDown':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                navigateToNextSection();
            } else if (activeElement.closest('.gantt-chart')) {
                e.preventDefault();
                navigateGanttDown();
            }
            break;
            
        case 'ArrowUp':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                navigateToPreviousSection();
            } else if (activeElement.closest('.gantt-chart')) {
                e.preventDefault();
                navigateGanttUp();
            }
            break;
            
        case 'ArrowLeft':
        case 'ArrowRight':
            if (activeElement.closest('.gantt-chart')) {
                e.preventDefault();
                navigateGanttHorizontal(e.key === 'ArrowRight');
            }
            break;
            
        case 'Enter':
        case ' ':
            if (activeElement.classList.contains('task-card') || 
                activeElement.classList.contains('gantt-row')) {
                e.preventDefault();
                toggleTaskDetails(activeElement);
            }
            break;
            
        case 'Escape':
            closeModalsAndMenus();
            break;
            
        case '/':
            if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                focusSearchInput();
            }
            break;
    }
}

function navigateToNextSection() {
    const sections = Array.from(document.querySelectorAll('.section'));
    const currentSection = document.activeElement.closest('.section');
    const currentIndex = currentSection ? sections.indexOf(currentSection) : -1;
    const nextIndex = (currentIndex + 1) % sections.length;
    
    sections[nextIndex].focus();
    sections[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigateToPreviousSection() {
    const sections = Array.from(document.querySelectorAll('.section'));
    const currentSection = document.activeElement.closest('.section');
    const currentIndex = currentSection ? sections.indexOf(currentSection) : sections.length - 1;
    const prevIndex = currentIndex <= 0 ? sections.length - 1 : currentIndex - 1;
    
    sections[prevIndex].focus();
    sections[prevIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigateGanttDown() {
    const ganttRows = Array.from(document.querySelectorAll('.gantt-row'));
    const currentRow = document.activeElement.closest('.gantt-row');
    
    if (!currentRow && ganttRows.length > 0) {
        ganttRows[0].focus();
        return;
    }
    
    const currentIndex = ganttRows.indexOf(currentRow);
    if (currentIndex < ganttRows.length - 1) {
        ganttRows[currentIndex + 1].focus();
        ganttRows[currentIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function navigateGanttUp() {
    const ganttRows = Array.from(document.querySelectorAll('.gantt-row'));
    const currentRow = document.activeElement.closest('.gantt-row');
    
    if (!currentRow) return;
    
    const currentIndex = ganttRows.indexOf(currentRow);
    if (currentIndex > 0) {
        ganttRows[currentIndex - 1].focus();
        ganttRows[currentIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function navigateGanttHorizontal(goRight) {
    const currentRow = document.activeElement.closest('.gantt-row');
    if (!currentRow) return;
    
    const cells = Array.from(currentRow.querySelectorAll('.gantt-cell'));
    const currentCell = document.activeElement.closest('.gantt-cell');
    
    if (!currentCell && cells.length > 0) {
        cells[0].focus();
        return;
    }
    
    const currentIndex = cells.indexOf(currentCell);
    const nextIndex = goRight ? 
        Math.min(currentIndex + 1, cells.length - 1) : 
        Math.max(currentIndex - 1, 0);
    
    if (nextIndex !== currentIndex) {
        cells[nextIndex].focus();
        cells[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function toggleTaskDetails(element) {
    // Toggle expanded details for task
    element.classList.toggle('expanded');
    
    // In a real implementation, this would show/hide additional task details
    const details = element.querySelector('.task-details');
    if (details) {
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
    }
}

function closeModalsAndMenus() {
    // Close any open modals, dropdowns, etc.
    const expandedElements = document.querySelectorAll('.expanded, .open');
    expandedElements.forEach(el => {
        el.classList.remove('expanded', 'open');
    });
}

function focusSearchInput() {
    const searchInput = document.querySelector('[data-filter="search"]');
    if (searchInput) {
        searchInput.focus();
        searchInput.select();
    }
}

// =============================================
// VIRTUAL SCROLLING FOR GANTT CHART
// =============================================

let virtualScrollState = {
    totalRows: 0,
    visibleRows: 20,
    rowHeight: 50,
    scrollTop: 0,
    container: null,
    viewport: null
};

function initializeVirtualScrolling() {
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;
    
    // Create virtual scrolling container
    const virtualContainer = document.createElement('div');
    virtualContainer.className = 'gantt-virtual-container';
    
    const viewport = document.createElement('div');
    viewport.className = 'gantt-viewport';
    
    const content = document.createElement('div');
    content.className = 'gantt-virtual-content';
    
    viewport.appendChild(content);
    virtualContainer.appendChild(viewport);
    
    // Replace existing gantt chart with virtual container
    const existingChart = ganttContainer.querySelector('.gantt-chart');
    if (existingChart) {
        ganttContainer.innerHTML = '';
        ganttContainer.appendChild(virtualContainer);
    }
    
    virtualScrollState.container = virtualContainer;
    virtualScrollState.viewport = viewport;
    
    // Add scroll event listener
    viewport.addEventListener('scroll', handleVirtualScroll);
    
    // Set initial dimensions
    updateVirtualScrollDimensions();
}

function updateVirtualScrollDimensions() {
    if (!virtualScrollState.container || !appData.tasks) return;
    
    const { container, viewport } = virtualScrollState;
    const totalRows = appData.tasks.length;
    const rowHeight = 50; // Approximate row height
    
    virtualScrollState.totalRows = totalRows;
    virtualScrollState.rowHeight = rowHeight;
    
    // Set container height to show only visible rows
    const visibleHeight = Math.min(totalRows, virtualScrollState.visibleRows) * rowHeight;
    container.style.height = `${visibleHeight}px`;
    
    // Set content height to total height
    const content = container.querySelector('.gantt-virtual-content');
    if (content) {
        content.style.height = `${totalRows * rowHeight}px`;
    }
    
    // Initial render
    renderVisibleRows(0);
}

function handleVirtualScroll(e) {
    const scrollTop = e.target.scrollTop;
    virtualScrollState.scrollTop = scrollTop;
    
    const startRow = Math.floor(scrollTop / virtualScrollState.rowHeight);
    renderVisibleRows(startRow);
}

function renderVisibleRows(startRow) {
    if (!appData.tasks || !virtualScrollState.viewport) return;
    
    const endRow = Math.min(
        startRow + virtualScrollState.visibleRows, 
        appData.tasks.length
    );
    
    const visibleTasks = appData.tasks.slice(startRow, endRow);
    
    // Create partial Gantt chart for visible tasks
    const content = virtualScrollState.viewport.querySelector('.gantt-virtual-content');
    if (!content) return;
    
    // Calculate date range (reuse existing logic)
    const dates = generateDateRange(appData.project.startDate, appData.project.endDate);
    const dateCount = dates.length;
    
    // Generate HTML for visible rows only
    const visibleRowsHtml = visibleTasks.map((task, index) => {
        const actualIndex = startRow + index;
        // Reuse existing row rendering logic but for specific task
        return generateGanttRowHtml(task, dates, dateCount, actualIndex);
    }).join('');
    
    // Update content transform to show correct position
    const offsetY = startRow * virtualScrollState.rowHeight;
    content.style.transform = `translateY(${offsetY}px)`;
    content.innerHTML = visibleRowsHtml;
}

function generateGanttRowHtml(task, dates, dateCount, rowIndex) {
    // Simplified version of the existing row generation logic
    const member = getTeamMember(task.owner);
    const ownerName = task.owner === 'both' ? 'Both' : (member ? member.name : task.owner);
    
    let startDateFormatted = 'No date';
    let endDateFormatted = '';
    let dateInfo = 'Status: ' + (task.status || 'Not Started');
    
    if (task.startDate && task.endDate) {
        startDateFormatted = formatDate(task.startDate);
        endDateFormatted = formatDate(task.endDate);
        dateInfo = startDateFormatted === endDateFormatted ? startDateFormatted : `${startDateFormatted} - ${endDateFormatted}`;
    }
    
    // Get status and priority styling
    const statusInfo = getStatusInfo(task.status, task.completed);
    const priorityInfo = getPriorityInfo(task.priority);
    
    let rowHtml = `<div class="gantt-row ${statusInfo.class} ${priorityInfo.class}" style="grid-template-columns: 220px repeat(${dateCount}, minmax(30px, 1fr));" tabindex="0" data-row-index="${rowIndex}">
        <div class="gantt-task-name">
            <span class="gantt-task-title">${escapeHtml(task.name)}</span>
            <span class="gantt-task-owner">${escapeHtml(ownerName)} • ${dateInfo}</span>
        </div>`;
    
    // Add cells (simplified for virtual scrolling)
    dates.forEach(date => {
        const isWE = isWeekend(date);
        const isHol = isHoliday(date);
        const isToday = date === getTodayLocalDate(); // Use canonical local date
        const cellClasses = ['gantt-cell'];
        if (isWE || isHol) cellClasses.push('weekend');
        if (isToday) cellClasses.push('today');
        
        rowHtml += `<div class="${cellClasses.join(' ')}"></div>`;
    });
    
    rowHtml += '</div>';
    return rowHtml;
}

// =============================================
// MOBILE UI MANAGEMENT
// =============================================

// Initialization flag to prevent duplicate setup
let mobileUIInitialized = false;

function initializeMobileUI() {
    if (!isMobileDevice()) return;
    if (mobileUIInitialized) {
        console.log('Mobile UI already initialized, skipping...');
        return;
    }
    
    console.log('Initializing mobile UI...');
    mobileUIInitialized = true;
    
    // Setup mobile navigation
    setupMobileNavigation();
    
    // Render initial mobile section
    renderMobileSection('dashboard');
    
    // Setup mobile search
    setupMobileSearch();
    
    // Setup shared keyboard navigation
    setupSharedKeyboardNavigation();
}

// Store reference to prevent duplicate listeners
let keyboardNavigationSetup = false;

function setupSharedKeyboardNavigation() {
    if (keyboardNavigationSetup) return;
    keyboardNavigationSetup = true;
    
    document.addEventListener('keydown', (e) => {
        // Close menu overlay
        const menuOverlay = document.querySelector('.menu-overlay');
        const hamburger = document.querySelector('.hamburger-menu');
        if (e.key === 'Escape' && menuOverlay && menuOverlay.classList.contains('active')) {
            menuOverlay.classList.remove('active');
            if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
            return;
        }
        
        // Close search overlay
        const searchOverlay = document.querySelector('.search-overlay');
        if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) {
            searchOverlay.classList.remove('active');
            // Restore focus to search button
            const searchBtn = document.querySelector('.mobile-search-btn');
            if (searchBtn) searchBtn.focus();
            return;
        }
    });
}

function setupMobileNavigation() {
    const navItems = document.querySelectorAll('.mobile-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            renderMobileSection(section);
            
            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
    
    // Hamburger menu
    const hamburger = document.querySelector('.hamburger-menu');
    const menuOverlay = document.querySelector('.menu-overlay');
    
    if (hamburger && menuOverlay) {
        hamburger.addEventListener('click', () => {
            const isActive = menuOverlay.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
            
            if (isActive) {
                // Focus first menu item for keyboard navigation
                const firstItem = menuOverlay.querySelector('.overlay-item');
                if (firstItem) firstItem.focus();
            }
        });
        
        // Close button in overlay
        const overlayClose = menuOverlay.querySelector('.overlay-close');
        if (overlayClose) {
            overlayClose.addEventListener('click', () => {
                menuOverlay.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                hamburger.focus();
            });
        }
        
        // Close menu when clicking outside
        menuOverlay.addEventListener('click', (e) => {
            if (e.target === menuOverlay) {
                menuOverlay.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            }
        });
        
        // Setup overlay button handlers
        const overlayItems = menuOverlay.querySelectorAll('.overlay-item');
        overlayItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const action = item.dataset.action;
                handleOverlayAction(action);
                menuOverlay.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

function handleOverlayAction(action) {
    switch (action) {
        case 'dashboard':
        case 'timeline':
        case 'bandwidth':
        case 'tasks':
        case 'milestones':
            renderMobileSection(action);
            // Update active nav state
            const navItems = document.querySelectorAll('.mobile-nav-item');
            navItems.forEach(nav => {
                nav.classList.toggle('active', nav.dataset.section === action);
            });
            break;
        case 'refresh':
            showToast('Refreshing data...', 'info');
            if (typeof loadAllData === 'function') {
                loadAllData().then(() => {
                    renderMobileSection('dashboard');
                    showToast('Data refreshed!', 'success');
                }).catch(err => {
                    showToast('Failed to refresh data', 'error');
                });
            }
            break;
        case 'fullscreen':
            if (typeof toggleFullscreen === 'function') {
                toggleFullscreen();
            }
            break;
        case 'export':
            if (typeof exportData === 'function') {
                exportData();
                showToast('Export started...', 'info');
            }
            break;
    }
}

function hideMobileLoading() {
    const loadingEl = document.getElementById('mobile-loading');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
    }
}

function showMobileError(message) {
    const content = document.getElementById('mobile-content');
    if (!content) return;
    
    // Hide loading first
    hideMobileLoading();
    
    content.innerHTML = `
        <div class="mobile-error">
            <div class="error-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
            <h3>Failed to Load Data</h3>
            <p>${escapeHtml(message || 'Please check your connection and try again.')}</p>
            <button class="retry-btn" onclick="location.reload()">Retry</button>
        </div>
    `;
}

function renderMobileSection(section) {
    const content = document.getElementById('mobile-content');
    if (!content) return;
    
    // Hide loading indicator when rendering actual content
    hideMobileLoading();
    
    let html = '';
    
    switch (section) {
        case 'dashboard':
            html = renderMobileDashboard();
            break;
        case 'bandwidth':
            html = renderMobileBandwidth();
            break;
        case 'tasks':
            html = renderMobileTasks();
            break;
        case 'milestones':
            html = renderMobileMilestones();
            break;
        case 'timeline':
            html = renderMobileTimeline();
            break;
        default:
            html = '<div class="mobile-card"><h3>Section not found</h3></div>';
    }
    
    content.innerHTML = html;
    
    // Update header title
    const headerTitle = document.querySelector('.mobile-header-title');
    if (headerTitle) {
        const titles = {
            dashboard: 'Dashboard',
            team: 'Team',
            bandwidth: 'Capacity',
            tasks: 'Tasks',
            milestones: 'Milestones',
            timeline: 'Timeline'
        };
        headerTitle.textContent = titles[section] || section.charAt(0).toUpperCase() + section.slice(1);
    }
    
    // Setup event delegation for dynamically rendered content (runs once per section change)
    setupMobileContentDelegation();
}

// Event delegation for mobile content - handles all clicks without per-item listeners
let contentDelegationSetup = false;

function setupMobileContentDelegation() {
    const content = document.getElementById('mobile-content');
    if (!content) return;
    
    // Setup delegation once
    if (!contentDelegationSetup) {
        contentDelegationSetup = true;
        
        // Click handler
        content.addEventListener('click', (e) => {
            // Handle task item clicks (task-row is the actual class used)
            const taskItem = e.target.closest('.task-row');
            if (taskItem) {
                const taskId = taskItem.dataset.taskId;
                if (taskId) showTaskDetails(taskId);
                return;
            }
            
            // Handle search result clicks
            const searchResult = e.target.closest('.search-result-item');
            if (searchResult) {
                const section = searchResult.dataset.section;
                const id = searchResult.dataset.id;
                navigateToMobileResult(section, id);
                return;
            }
            
            // Handle action button clicks (navigate to sections)
            const actionBtn = e.target.closest('[data-action="navigate"]');
            if (actionBtn) {
                const section = actionBtn.dataset.section;
                if (section) renderMobileSection(section);
                return;
            }
        });
        
        // Keyboard handler for Enter/Space on interactive elements with role="button"
        content.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            
            // Prevent space from scrolling the page
            if (e.key === ' ') e.preventDefault();
            
            // Find closest interactive element
            const taskItem = e.target.closest('.task-row');
            const searchResult = e.target.closest('.search-result-item');
            const actionBtn = e.target.closest('[data-action="navigate"]');
            
            if (taskItem) {
                const taskId = taskItem.dataset.taskId;
                if (taskId) showTaskDetails(taskId);
            } else if (searchResult) {
                const section = searchResult.dataset.section;
                const id = searchResult.dataset.id;
                navigateToMobileResult(section, id);
            } else if (actionBtn) {
                const section = actionBtn.dataset.section;
                if (section) renderMobileSection(section);
            }
        });
    }
}

function renderMobileDashboard() {
    // Get comprehensive sprint time state
    const timeState = getSprintTimeState();
    
    // Single-pass metrics calculation for performance
    const metrics = {
        total: 0,
        completed: 0,
        inProgress: 0,
        blocked: 0,
        overdue: 0,
        allocatedHours: 0
    };
    
    const now = new Date();
    
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            metrics.total++;
            
            const status = String(task.status || '').toLowerCase();
            if (status === 'completed') metrics.completed++;
            if (status === 'in-progress') metrics.inProgress++;
            if (status === 'blocked') metrics.blocked++;
            
            // Check overdue: has endDate, past due, not completed
            if (task.endDate && new Date(task.endDate) < now && status !== 'completed') {
                metrics.overdue++;
            }
            
            // Accumulate hours if available - use EXPLICIT estimatedHours field
            if (task.estimatedHours) {
                metrics.allocatedHours += parseFloat(task.estimatedHours) || 0;
            }
        });
    }
    
    // SPRINT-BASED BANDWIDTH - Use REMAINING for planning accuracy
    const sprintCapacity = getTeamSprintCapacity();
    const totalSprintHours = sprintCapacity.totalSprintHours;
    const remainingTeamHours = getTeamRemainingBandwidth();
    const availableHours = Math.max(0, totalSprintHours - metrics.allocatedHours);
    
    // Clamp percentage to [0, 100]
    const utilizationPercent = totalSprintHours > 0 ? 
        Math.min(100, Math.max(0, (metrics.allocatedHours / totalSprintHours) * 100)) : 0;
    
    // Calculate progress percentage
    const progressPercent = metrics.total > 0 ? Math.round((metrics.completed / metrics.total) * 100) : 0;
    
    // Sprint dates for context
    const sprintStart = appData.project ? formatDate(appData.project.startDate) : '—';
    const sprintEnd = appData.project ? formatDate(appData.project.endDate) : '—';
    const sprintName = appData.project?.name || 'Sprint';
    
    // Format today
    const todayFormatted = new Date(timeState.today).toLocaleDateString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric' 
    });
    
    // Sprint state message
    let sprintStateHtml = '';
    if (!timeState.isValid) {
        sprintStateHtml = '<div class="sprint-state-error">Sprint dates not configured</div>';
    } else if (timeState.isComplete) {
        sprintStateHtml = '<div class="sprint-state-complete">Sprint completed</div>';
    } else if (timeState.isNotStarted) {
        sprintStateHtml = `<div class="sprint-state-pending">Starts ${sprintStart}</div>`;
    } else {
        sprintStateHtml = `<div class="sprint-state-active">Day ${timeState.currentDay} of ${timeState.totalWorkingDays}</div>`;
    }
    
    return `
        <div class="mobile-dashboard">

            <!-- Sprint Context Header with Today's Date -->
            <div class="mobile-card sprint-context-card">
                <div class="sprint-header" data-tip="Current sprint information">
                    <h3 class="sprint-name">${escapeHtml(sprintName)}</h3>
                    <div class="sprint-dates">${sprintStart} - ${sprintEnd}</div>
                    ${sprintStateHtml}
                </div>
                <div class="today-context">
                    <svg class="today-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span class="today-date">Today: ${todayFormatted}</span>
                    ${timeState.isValid && !timeState.isComplete ? 
                        `<span class="remaining-days">${timeState.remainingWorkingDays} working days left</span>` : ''}
                </div>
                <div class="sprint-progress-bar" data-tip="Overall sprint completion">
                    <div class="sprint-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="sprint-progress-text">${progressPercent}% complete (${metrics.completed}/${metrics.total} tasks)</div>
            </div>
            
            <!-- Key Metrics - Compact Single Row -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Sprint Status</h3>
                    <button type="button" class="help-icon-button" aria-label="Task status breakdown" data-tip="Task status breakdown">
                        <svg class="help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </button>
                </div>
                <div class="metric-row">
                    <div class="metric-compact" data-tip="Tasks currently being worked on">
                        <div class="metric-value-sm">${metrics.inProgress}</div>
                        <div class="metric-label-sm">Active</div>
                    </div>
                    <div class="metric-compact ${metrics.blocked > 0 ? 'danger' : ''}" data-tip="Tasks blocked or requiring attention">
                        <div class="metric-value-sm">${metrics.blocked}</div>
                        <div class="metric-label-sm">Blocked</div>
                    </div>
                    <div class="metric-compact ${metrics.overdue > 0 ? 'warning' : ''}" data-tip="Tasks past their due date">
                        <div class="metric-value-sm">${metrics.overdue}</div>
                        <div class="metric-label-sm">Overdue</div>
                    </div>
                    <div class="metric-compact success" data-tip="Completed tasks">
                        <div class="metric-value-sm">${metrics.completed}</div>
                        <div class="metric-label-sm">Done</div>
                    </div>
                </div>
            </div>
            
            <!-- Sprint Bandwidth - Show REMAINING capacity for planning -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Team Capacity</h3>
                    <span class="card-subtitle">${timeState.remainingWorkingDays} days remaining</span>
                </div>
                <div class="card-content">
                    <div class="bandwidth-summary">
                        <div class="bandwidth-bar">
                            <div class="bandwidth-used ${utilizationPercent > 100 ? 'overloaded' : ''}" style="width: ${Math.min(utilizationPercent, 100).toFixed(1)}%"></div>
                        </div>
                        <div class="bandwidth-text">
                            <span class="bandwidth-allocated">${metrics.allocatedHours}h allocated</span>
                            <span class="bandwidth-total">${Math.round(totalSprintHours)}h sprint total</span>
                        </div>
                        <div class="bandwidth-remaining-context">
                            <span class="remaining-hours">${Math.round(remainingTeamHours)}h remaining team capacity</span>
                            ${availableHours < 0 ? 
                                `<span class="over-capacity-warning">${Math.abs(Math.round(availableHours))}h OVER committed</span>` : 
                                `<span class="available-hours">${Math.round(availableHours)}h unallocated</span>`}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Quick Navigation (READ-ONLY - no mutation actions) -->
            <div class="mobile-card quick-nav-card">
                <div class="card-header">
                    <h3>Quick Actions</h3>
                </div>
                <div class="card-content">
                    <div class="quick-nav-grid">
                        <button class="quick-nav-btn" data-action="navigate" data-section="timeline" data-tip="Jump to visual sprint timeline">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
                            <span>Timeline</span>
                        </button>
                        <button class="quick-nav-btn" data-action="navigate" data-section="tasks" data-tip="View and manage all tasks">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            <span>Tasks</span>
                        </button>
                        <button class="quick-nav-btn" data-action="navigate" data-section="bandwidth" data-tip="Check team capacity & load">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                            <span>Capacity</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderMobileTeam() {
    if (!appData.teamMembers) return '<div class="mobile-card"><p>No team data available</p></div>';
    
    // Pre-compute task counts by owner for O(n) lookup
    const taskCountByOwner = {};
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            const owner = task.owner || 'unassigned';
            taskCountByOwner[owner] = (taskCountByOwner[owner] || 0) + 1;
        });
    }
    
    return `
        <div class="mobile-team">
            ${appData.teamMembers.map(member => {
                const memberName = member.name || 'Unknown';
                const initial = escapeHtml(memberName.charAt(0).toUpperCase() || '?');
                // Use nullish coalescing to allow 0 as a valid value
                const bandwidthHours = member.bandwidthHours ?? 40;
                const taskCount = taskCountByOwner[member.id] || 0;
                
                return `
                <div class="mobile-card team-member-card">
                    <div class="card-header">
                        <div class="member-avatar">${initial}</div>
                        <div class="member-info">
                            <h4>${escapeHtml(memberName)}</h4>
                            <span class="member-role">${escapeHtml(member.role || 'Team Member')}</span>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="member-stats">
                            <div class="stat">
                                <span class="stat-value">${bandwidthHours}h</span>
                                <span class="stat-label">Bandwidth</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${taskCount}</span>
                                <span class="stat-label">Tasks</span>
                            </div>
                        </div>
                        <div class="bandwidth-indicator">
                            <div class="bandwidth-fill" style="width: ${Math.min(100, (bandwidthHours / 40) * 100)}%"></div>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderMobileBandwidth() {
    if (!appData.teamMembers) return '<div class="mobile-card"><p>No bandwidth data available</p></div>';
    
    // Get comprehensive sprint time state
    const timeState = getSprintTimeState();
    
    if (!timeState.isValid) {
        return `<div class="mobile-card"><p class="error-state">Sprint dates not configured. Update SPRINT_CONFIG sheet.</p></div>`;
    }
    
    // SPRINT-BASED BANDWIDTH CALCULATION
    const sprintCapacity = getTeamSprintCapacity();
    const allocatedHours = getAllocatedHoursByMember();
    
    const totalSprintCapacity = sprintCapacity.totalSprintHours;
    const totalAllocated = appData.tasks?.reduce((sum, task) => sum + (task.estimatedHours || 0), 0) || 0;
    const utilization = totalSprintCapacity > 0 ? (totalAllocated / totalSprintCapacity) * 100 : 0;
    const availableHours = Math.max(0, totalSprintCapacity - totalAllocated);
    
    // REMAINING capacity for planning
    const remainingTeamCapacity = getTeamRemainingBandwidth();
    
    // Format today
    const todayFormatted = new Date(timeState.today).toLocaleDateString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric' 
    });
    
    return `
        <div class="mobile-bandwidth">
            <!-- Today's Context - Critical for Planning -->
            <div class="mobile-card today-context-card">
                <div class="today-header">
                    <svg class="today-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span class="today-date">${todayFormatted}</span>
                </div>
                <div class="sprint-time-context">
                    ${timeState.isComplete ? 
                        '<div class="sprint-complete-badge">Sprint Completed</div>' :
                        `<div class="sprint-day-indicator">Day ${timeState.currentDay} of ${timeState.totalWorkingDays}</div>
                         <div class="remaining-indicator">${timeState.remainingWorkingDays} working days remaining</div>`
                    }
                </div>
            </div>
            
            <!-- Sprint Capacity Overview -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Sprint Capacity</h3>
                    <span class="card-subtitle">${timeState.totalWorkingDays} total working days</span>
                </div>
                <div class="card-content">
                    <div class="capacity-overview">
                        <!-- Progress Ring Visualization -->
                        <div class="capacity-ring-container">
                            <svg class="capacity-ring" viewBox="0 0 100 100" aria-label="Sprint capacity utilization ${Math.round(utilization)}%">
                                <circle class="ring-bg" cx="50" cy="50" r="42" fill="none" stroke-width="8"/>
                                <circle class="ring-fill ${utilization > 100 ? 'overloaded' : utilization > 80 ? 'high' : ''}" 
                                        cx="50" cy="50" r="42" fill="none" stroke-width="8"
                                        stroke-dasharray="${Math.min(utilization, 100) * 2.64} 264"
                                        transform="rotate(-90 50 50)"/>
                            </svg>
                            <div class="capacity-ring-text">
                                <span class="ring-percent">${Math.round(utilization)}%</span>
                                <span class="ring-label">Allocated</span>
                            </div>
                        </div>
                        
                        <!-- Capacity Details -->
                        <div class="capacity-breakdown">
                            <div class="breakdown-row">
                                <span class="breakdown-label">Sprint Total</span>
                                <span class="breakdown-value">${Math.round(totalSprintCapacity)}h</span>
                            </div>
                            <div class="breakdown-row">
                                <span class="breakdown-label">Allocated</span>
                                <span class="breakdown-value allocated">${totalAllocated}h</span>
                            </div>
                            <div class="breakdown-row highlight">
                                <span class="breakdown-label">Remaining Capacity</span>
                                <span class="breakdown-value remaining">${Math.round(remainingTeamCapacity)}h</span>
                            </div>
                            <div class="breakdown-row ${totalAllocated > totalSprintCapacity ? 'danger' : ''}">
                                <span class="breakdown-label">Unallocated</span>
                                <span class="breakdown-value ${totalAllocated > totalSprintCapacity ? 'over-capacity' : 'available'}">
                                    ${totalAllocated > totalSprintCapacity ? `${Math.round(totalAllocated - totalSprintCapacity)}h OVER` : `${Math.round(availableHours)}h`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Individual Member Capacity with Next Available Day -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Team Breakdown</h3>
                </div>
                <div class="card-content">
                    ${sprintCapacity.memberCapacities.map(memberCap => {
                        const member = appData.teamMembers.find(m => m.id === memberCap.id);
                        const memberAllocated = allocatedHours[memberCap.id] || 0;
                        const memberUtilization = memberCap.totalSprintHours > 0 
                            ? (memberAllocated / memberCap.totalSprintHours) * 100 
                            : 0;
                        const memberRemaining = getRemainingSprintBandwidth(member || { bandwidthHours: 40 });
                        const isOverloaded = memberAllocated > memberCap.totalSprintHours;
                        
                        // Get next available day for this member
                        const nextAvailable = member ? getNextAvailableDay(member, 4) : null;
                        let nextAvailableHtml = '';
                        if (timeState.isComplete) {
                            nextAvailableHtml = '<span class="next-available completed">Sprint ended</span>';
                        } else if (nextAvailable) {
                            const nextDate = new Date(nextAvailable.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                            nextAvailableHtml = `<span class="next-available has-slot">Free: ${nextDate} (${nextAvailable.freeHours}h)</span>`;
                        } else {
                            nextAvailableHtml = '<span class="next-available no-slot">No 4h+ slot available</span>';
                        }
                        
                        return `
                            <div class="member-capacity-row ${isOverloaded ? 'overloaded' : memberUtilization > 80 ? 'high-load' : ''}">
                                <div class="member-capacity-info">
                                    <span class="member-name">${escapeHtml(memberCap.name)}</span>
                                    <span class="member-hours">${memberAllocated}h / ${Math.round(memberCap.totalSprintHours)}h</span>
                                </div>
                                <div class="member-capacity-bar">
                                    <div class="capacity-bar-track">
                                        <div class="capacity-bar-fill ${isOverloaded ? 'overloaded' : ''}" 
                                             style="width: ${Math.min(100, memberUtilization)}%"></div>
                                    </div>
                                    <span class="capacity-percent ${isOverloaded ? 'overloaded' : ''}">${Math.round(memberUtilization)}%</span>
                                </div>
                                <div class="member-capacity-status">
                                    ${isOverloaded 
                                        ? `<span class="status-over">${Math.round(memberAllocated - memberCap.totalSprintHours)}h over</span>`
                                        : `<span class="status-available">${Math.round(memberRemaining)}h left</span>`
                                    }
                                </div>
                                <div class="member-next-available">
                                    ${nextAvailableHtml}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderMobileTasks() {
    if (!appData.tasks) return '<div class="mobile-card"><p>No tasks available</p></div>';
    
    // Count tasks by status for summary
    const statusCounts = {};
    const statusPriority = ['blocked', 'in-progress', 'review', 'todo', 'pending', 'completed'];
    
    appData.tasks.forEach(task => {
        const status = normalizeTaskStatus(task.status);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // Sort tasks: blocked first, then in-progress, etc.
    const sortedTasks = [...appData.tasks].sort((a, b) => {
        const aStatus = normalizeTaskStatus(a.status);
        const bStatus = normalizeTaskStatus(b.status);
        return statusPriority.indexOf(aStatus) - statusPriority.indexOf(bStatus);
    });
    
    // Status color mapping
    const statusColors = {
        'blocked': '#ef4444',
        'in-progress': '#f59e0b',
        'review': '#06b6d4',
        'todo': '#6b7280',
        'pending': '#94a3b8',
        'completed': '#10b981'
    };
    
    const html = `
        <div class="mobile-tasks-view">
            <!-- Task List - Status is Primary Signal -->
            <div class="mobile-card tasks-list">
                <div class="card-header">
                    <h3>All Tasks (${appData.tasks.length})</h3>
                    <div class="task-status-icons">
                        ${statusPriority.map(status => {
                            const count = statusCounts[status] || 0;
                            if (count === 0) return '';
                            return `<span class="status-icon-pill status-${status}" style="--status-color: ${statusColors[status]}" data-tip="${status}: ${count} tasks">
                                <span class="status-count">${count}</span>
                            </span>`;
                        }).join('')}
                    </div>
                </div>
                <div class="tasks-scroll-list">
                    ${sortedTasks.map(task => {
                        const status = normalizeTaskStatus(task.status);
                        const statusColor = statusColors[status] || '#6b7280';
                        const isBlocked = status === 'blocked';
                        const isComplete = status === 'completed';
                        
                        return `
                        <div class="task-row ${isBlocked ? 'task-blocked' : ''} ${isComplete ? 'task-complete' : ''}" 
                             data-task-id="${escapeHtml(String(task.id))}" 
                             tabindex="0" 
                             role="listitem"
                             aria-label="${escapeHtml(task.name)}, status: ${status}">
                            <div class="task-status-indicator" style="background: ${statusColor}"></div>
                            <div class="task-content">
                                <div class="task-main">
                                    <span class="task-name">${escapeHtml(task.name)}</span>
                                    <span class="task-status-badge status-${status}">${status}</span>
                                </div>
                                <div class="task-details">
                                    <span class="task-owner">${escapeHtml(task.owner || 'Unassigned')}</span>
                                    ${task.estimatedHours ? `<span class="task-hours">${task.estimatedHours}h</span>` : ''}
                                    ${task.endDate ? `<span class="task-due">Due: ${formatDate(task.endDate)}</span>` : ''}
                                </div>
                                ${isBlocked && task.blockers ? `<div class="task-blocker"><svg class="blocker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${escapeHtml(task.blockers)}</div>` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
    
    return html;
}

function renderMobileMilestones() {
    if (!appData.milestones) return '<div class="mobile-card"><p>No milestones available</p></div>';
    
    return `
        <div class="mobile-milestones">
            ${appData.milestones.map(milestone => {
                // Use EXPLICIT status from data contract - NO INFERENCE
                const status = normalizeMilestoneStatus(milestone.status || 'pending');
                const progress = Math.min(100, Math.max(0, milestone.progress || 0));
                
                return `
                <div class="mobile-card milestone-card">
                    <div class="card-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="milestone-icon" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                        <h3>${escapeHtml(milestone.title || 'Untitled Milestone')}</h3>
                        <span class="milestone-status status-${status}">${escapeHtml(status)}</span>
                    </div>
                    <div class="card-content">
                        ${milestone.description ? `<p class="milestone-description">${escapeHtml(milestone.description)}</p>` : ''}
                        ${milestone.assignee ? `<p class="milestone-assignee">Assigned to: ${escapeHtml(milestone.assignee)}</p>` : ''}
                        <div class="milestone-meta">
                            <div class="meta-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                <span>${formatDate(milestone.date)}</span>
                            </div>
                            ${progress > 0 ? `
                            <div class="meta-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                <span>${progress}% complete</span>
                            </div>
                            ` : ''}
                        </div>
                        ${progress > 0 && progress < 100 ? `
                        <div class="milestone-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;
}

// =============================================
// MOBILE TIMELINE VISUALIZATION
// Shows task distribution across sprint timeline
// =============================================
function renderMobileTimeline() {
    if (!appData.project || !appData.tasks) {
        return '<div class="mobile-card"><p>No timeline data available</p></div>';
    }
    
    const timeState = getSprintTimeState();
    
    if (!timeState.isValid) {
        return `<div class="mobile-card"><p class="error-state">Sprint dates not configured. Update SPRINT_CONFIG sheet.</p></div>`;
    }
    
    const sprintStart = new Date(appData.project.startDate + 'T00:00:00');
    const sprintEnd = new Date(appData.project.endDate + 'T00:00:00');
    
    // Use canonical local date function to avoid timezone issues
    const todayStr = getTodayLocalDate();
    const today = new Date(todayStr + 'T00:00:00');
    
    // Format today for display using local date
    const todayFormatted = today.toLocaleDateString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric' 
    });
    
    // Group tasks by week for better mobile visualization
    const weeks = [];
    let currentWeekStart = new Date(sprintStart);
    
    while (currentWeekStart <= sprintEnd) {
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const actualWeekEnd = weekEnd > sprintEnd ? sprintEnd : weekEnd;
        
        const weekTasks = appData.tasks.filter(task => {
            if (!task.startDate || !task.endDate) return false;
            const taskStart = new Date(task.startDate);
            const taskEnd = new Date(task.endDate);
            return taskStart <= actualWeekEnd && taskEnd >= currentWeekStart;
        });
        
        weeks.push({
            start: new Date(currentWeekStart),
            end: actualWeekEnd,
            tasks: weekTasks,
            isCurrentWeek: today >= currentWeekStart && today <= actualWeekEnd
        });
        
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    // Calculate load concentration (hours per day, not just task count)
    const loadByDate = {};
    const hoursByDate = {};
    appData.tasks.forEach(task => {
        if (!task.startDate || !task.endDate) return;
        const dates = generateDateRange(task.startDate, task.endDate);
        const workingDaysInTask = dates.filter(d => !isWeekend(d)).length;
        const hoursPerDay = workingDaysInTask > 0 ? (task.estimatedHours || 0) / workingDaysInTask : 0;
        
        dates.forEach(date => {
            loadByDate[date] = (loadByDate[date] || 0) + 1;
            if (!isWeekend(date)) {
                hoursByDate[date] = (hoursByDate[date] || 0) + hoursPerDay;
            }
        });
    });
    
    const maxHours = Math.max(8, ...Object.values(hoursByDate)); // 8h baseline for intensity
    
    // Weekday initials
    const weekdayInitials = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    return `
        <div class="mobile-timeline">
            <!-- Today's Context Header -->
            <div class="mobile-card timeline-header-card">
                <div class="timeline-today-context">
                    <svg class="today-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <div class="today-info">
                        <span class="today-date">${todayFormatted}</span>
                        ${timeState.isComplete ? 
                            '<span class="sprint-state completed">Sprint Completed</span>' :
                            `<span class="sprint-state">Day ${timeState.currentDay} of ${timeState.totalWorkingDays} | ${timeState.remainingWorkingDays} days remaining</span>`
                        }
                    </div>
                </div>
                <div class="timeline-sprint-info">
                    <h3>${escapeHtml(appData.project.name || 'Sprint')}</h3>
                    <div class="timeline-dates">
                        ${formatDate(appData.project.startDate)} - ${formatDate(appData.project.endDate)}
                    </div>
                </div>
                <div class="timeline-progress">
                    <div class="timeline-progress-bar">
                        <div class="timeline-progress-fill" style="width: ${timeState.progressPercent}%"></div>
                        <div class="timeline-today-marker" style="left: ${timeState.progressPercent}%"></div>
                    </div>
                    <div class="timeline-progress-labels">
                        <span>${timeState.currentDay} working days elapsed</span>
                        <span>${timeState.progressPercent}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Load Heatmap - Calendar View with Weekdays -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Sprint Calendar</h3>
                    <span class="card-subtitle">Task distribution by day</span>
                </div>
                <div class="card-content">
                    <div class="load-heatmap" role="img" aria-label="Task load distribution across sprint">
                        <!-- Weekday Header Row -->
                        <div class="heatmap-header-row">
                            <div class="heatmap-week-label" aria-hidden="true"></div>
                            <div class="heatmap-calendar-grid">
                                ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => `
                                    <div class="heatmap-weekday-header ${idx === 0 || idx === 6 ? 'weekend' : ''}">${day}</div>
                                `).join('')}
                            </div>
                        </div>
                        
                        ${(() => {
                            // Generate all dates in sprint
                            const sprintDates = generateDateRange(
                                appData.project.startDate,
                                appData.project.endDate
                            );
                            
                            // Group dates into weeks (Sun-Sat)
                            const weekGroups = [];
                            let currentWeek = { dates: [], weekNumber: 1 };
                            
                            sprintDates.forEach((dateStr, index) => {
                                const date = new Date(dateStr + 'T00:00:00');
                                const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
                                
                                // Start new week on Sunday (except first partial week)
                                if (dayOfWeek === 0 && currentWeek.dates.length > 0) {
                                    weekGroups.push(currentWeek);
                                    currentWeek = { dates: [], weekNumber: weekGroups.length + 1 };
                                }
                                
                                currentWeek.dates.push({
                                    dateStr,
                                    date,
                                    dayOfWeek,
                                    dayNum: date.getDate(),
                                    isToday: dateStr === todayStr,
                                    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                                    taskCount: loadByDate[dateStr] || 0
                                });
                            });
                            
                            // Push last week
                            if (currentWeek.dates.length > 0) {
                                weekGroups.push(currentWeek);
                            }
                            
                            // Calculate max tasks for intensity scaling
                            const maxTasks = Math.max(3, ...Object.values(loadByDate));
                            
                            return weekGroups.map((week, weekIdx) => {
                                // Calculate week metrics
                                const weekTaskCount = week.dates.reduce((sum, d) => sum + d.taskCount, 0);
                                const isCurrentWeek = week.dates.some(d => d.isToday);
                                
                                return `
                                    <div class="heatmap-week-row ${isCurrentWeek ? 'current-week' : ''}">
                                        <div class="heatmap-week-label">
                                            <span class="week-num">W${week.weekNumber}</span>
                                        </div>
                                        <div class="heatmap-calendar-grid">
                                            ${week.dates.map((day) => {
                                                // Use task count for intensity instead of hours
                                                const intensity = maxTasks > 0 ? Math.min(day.taskCount / maxTasks, 1) : 0;
                                                const isHighLoad = day.taskCount >= 3;
                                                const monthShort = day.date.toLocaleDateString('en-US', { month: 'short' });
                                                
                                                return `
                                                    <div class="heatmap-day
                                                        ${day.isToday ? ' today' : ''}
                                                        ${day.isWeekend ? ' weekend' : ''}
                                                        ${isHighLoad ? ' high-load' : ''}
                                                        ${day.taskCount === 0 && !day.isWeekend ? ' no-load' : ''}"
                                                        style="--intensity: ${intensity.toFixed(2)}; grid-column: ${day.dayOfWeek + 1};"
                                                        data-date="${day.dateStr}"
                                                        data-tasks="${day.taskCount}"
                                                        role="gridcell"
                                                        aria-label="${monthShort} ${day.dayNum}: ${day.isWeekend ? 'Weekend' : `${day.taskCount} task${day.taskCount !== 1 ? 's' : ''}`}"
                                                        data-tip="${monthShort} ${day.dayNum}: ${day.taskCount} task${day.taskCount !== 1 ? 's' : ''}">
                                                        <span class="day-date">${day.dayNum}</span>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                    
                    <div class="heatmap-legend">
                        <div class="legend-item">
                            <div class="legend-swatch weekend-swatch"></div>
                            <span class="legend-label">Weekend</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-swatch light-swatch"></div>
                            <span class="legend-label">1-2 tasks</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-swatch heavy-swatch"></div>
                            <span class="legend-label">3+ tasks</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-swatch today-swatch"></div>
                            <span class="legend-label">Today</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Week-by-Week Task Breakdown -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Weekly Breakdown</h3>
                </div>
                <div class="card-content">
                    ${weeks.map((week, index) => {
                        const weekLabel = `Week ${index + 1}`;
                        // Build local YYYY-MM-DD to avoid timezone issues
                        const startStr = `${week.start.getFullYear()}-${String(week.start.getMonth() + 1).padStart(2, '0')}-${String(week.start.getDate()).padStart(2, '0')}`;
                        const endStr = `${week.end.getFullYear()}-${String(week.end.getMonth() + 1).padStart(2, '0')}-${String(week.end.getDate()).padStart(2, '0')}`;
                        const dateRange = `${formatDate(startStr)} - ${formatDate(endStr)}`;
                        const taskCount = week.tasks.length;
                        
                        // Group tasks by status for this week
                        const inProgress = week.tasks.filter(t => normalizeTaskStatus(t.status) === 'in-progress').length;
                        const completed = week.tasks.filter(t => normalizeTaskStatus(t.status) === 'completed').length;
                        const blocked = week.tasks.filter(t => normalizeTaskStatus(t.status) === 'blocked').length;
                        
                        return `
                            <div class="week-summary ${week.isCurrentWeek ? 'current-week' : ''}">
                                <div class="week-header">
                                    <span class="week-label">${weekLabel} ${week.isCurrentWeek ? '(Current)' : ''}</span>
                                    <span class="week-dates">${dateRange}</span>
                                </div>
                                <div class="week-stats">
                                    <span class="stat-badge">${taskCount} tasks</span>
                                    ${inProgress > 0 ? `<span class="stat-badge in-progress">${inProgress} active</span>` : ''}
                                    ${completed > 0 ? `<span class="stat-badge completed">${completed} done</span>` : ''}
                                    ${blocked > 0 ? `<span class="stat-badge blocked">${blocked} blocked</span>` : ''}
                                </div>
                                ${taskCount > 0 ? `
                                    <div class="week-tasks-preview">
                                        ${week.tasks.slice(0, 3).map(task => `
                                            <div class="mini-task status-${normalizeTaskStatus(task.status)}">
                                                <span class="mini-task-name">${escapeHtml(task.name.substring(0, 30))}${task.name.length > 30 ? '...' : ''}</span>
                                                <span class="mini-task-owner">${escapeHtml(task.owner || 'Unassigned')}</span>
                                            </div>
                                        `).join('')}
                                        ${taskCount > 3 ? `<div class="more-tasks">+${taskCount - 3} more</div>` : ''}
                                    </div>
                                ` : '<div class="no-tasks-week">No tasks scheduled</div>'}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

function setupMobileSearch() {
    const searchBtn = document.querySelector('.mobile-search-btn');
    const searchOverlay = document.querySelector('.search-overlay');
    const searchInput = document.querySelector('.mobile-search-input');
    const searchClose = document.querySelector('.search-close');
    
    if (searchBtn && searchOverlay) {
        searchBtn.addEventListener('click', () => {
            searchOverlay.classList.add('active');
            // Focus search input for keyboard users
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 100);
            }
        });
        
        // Close search via close button
        if (searchClose) {
            searchClose.addEventListener('click', () => {
                searchOverlay.classList.remove('active');
                searchBtn.focus();
            });
        }
        
        // Close search when clicking outside
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) {
                searchOverlay.classList.remove('active');
                // Restore focus to search button
                searchBtn.focus();
            }
        });
        
        // Close on Escape key
        searchOverlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchOverlay.classList.remove('active');
                searchBtn.focus();
            }
        });
        
        // Search functionality
        if (searchInput) {
            const debouncedSearch = debounce((query) => {
                if (query.length > 2) {
                    performMobileSearch(query);
                } else {
                    clearMobileSearch();
                }
            }, 200);
            
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                debouncedSearch(query);
            });
        }
    }
}

function performMobileSearch(query) {
    const results = [];
    
    // Search tasks - use correct field names from dataLoader normalization
    if (appData.tasks) {
        appData.tasks.forEach(task => {
            const taskName = String(task.name || '').toLowerCase();
            const taskNotes = String(task.notes || '').toLowerCase();
            const taskOwner = String(task.owner || '').toLowerCase();
            const taskJiraId = String(task.jiraId || '').toLowerCase();
            
            if (taskName.includes(query) || 
                taskNotes.includes(query) ||
                taskOwner.includes(query) ||
                taskJiraId.includes(query)) {
                results.push({
                    type: 'task',
                    item: task,
                    title: task.name,
                    subtitle: `Assigned to ${task.owner || 'Unassigned'}`,
                    section: 'tasks'
                });
            }
        });
    }
    
    // Search team members
    if (appData.teamMembers) {
        appData.teamMembers.forEach(member => {
            const memberName = String(member.name || '').toLowerCase();
            const memberRole = String(member.role || '').toLowerCase();
            
            if (memberName.includes(query) || memberRole.includes(query)) {
                results.push({
                    type: 'member',
                    item: member,
                    title: member.name || 'Unknown',
                    subtitle: member.role || 'Team Member',
                    section: 'team'
                });
            }
        });
    }
    
    // Search milestones - use correct field names: date, title, assignee (no description/dueDate)
    if (appData.milestones) {
        appData.milestones.forEach(milestone => {
            const milestoneTitle = String(milestone.title || '').toLowerCase();
            const milestoneAssignee = String(milestone.assignee || '').toLowerCase();
            
            if (milestoneTitle.includes(query) || milestoneAssignee.includes(query)) {
                results.push({
                    type: 'milestone',
                    item: milestone,
                    title: milestone.title,
                    subtitle: `Date: ${formatDate(milestone.date)} • ${milestone.assignee || 'Unassigned'}`,
                    section: 'milestones'
                });
            }
        });
    }
    
    displayMobileSearchResults(results);
}

function displayMobileSearchResults(results) {
    const searchResults = document.querySelector('.search-results');
    if (!searchResults) return;
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="no-results">No results found</div>';
        return;
    }
    
    searchResults.innerHTML = results.map(result => {
        // Use type-specific identifiers - members use name, others use id
        const itemId = result.type === 'member' ? result.item.name : (result.item.id || '');
        
        // Map result types to existing icon classes
        const iconClass = result.type === 'task' ? 'icon-tasks' : 
                         result.type === 'member' ? 'icon-users' : 
                         result.type === 'milestone' ? 'icon-milestone' : 'icon-tasks';
        
        return `
        <div class="search-result-item" data-section="${escapeHtml(result.section)}" data-id="${escapeHtml(String(itemId))}" data-type="${escapeHtml(result.type)}" tabindex="0" role="button" aria-label="Go to ${escapeHtml(result.title)}">
            <div class="result-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="result-content">
                <div class="result-title">${escapeHtml(result.title)}</div>
                <div class="result-subtitle">${escapeHtml(result.subtitle)}</div>
            </div>
        </div>
        `;
    }).join('');
    
    // Event delegation handles clicks - no individual listeners needed
}

function clearMobileSearch() {
    const searchResults = document.querySelector('.search-results');
    if (searchResults) {
        searchResults.innerHTML = '';
    }
}

function navigateToMobileResult(section, id) {
    // Close search overlay
    const searchOverlay = document.querySelector('.search-overlay');
    if (searchOverlay) {
        searchOverlay.classList.remove('active');
    }
    
    // Navigate to section
    renderMobileSection(section);
    
    // Update navigation
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });
    
    // TODO: Scroll to specific item if needed
}

function showTaskDetails(taskId) {
    // Normalize taskId to string for consistent comparison
    const normalizedTaskId = String(taskId);
    const task = appData.tasks?.find(t => String(t.id) === normalizedTaskId);
    if (!task) return;
    
    // Store previously focused element for restoration on close
    const previouslyFocused = document.activeElement;
    
    // Normalize status to prevent XSS in class attribute
    const normalizedStatus = normalizeTaskStatus(task.status);
    
    // Priority color mapping (p0/p1/p2 system)
    const priorityMap = {
        'p0': { label: 'P0 - Critical', class: 'priority-p0' },
        'p1': { label: 'P1 - High', class: 'priority-p1' },
        'p2': { label: 'P2 - Normal', class: 'priority-p2' },
        'urgent': { label: 'Urgent', class: 'priority-p0' },
        'high': { label: 'High', class: 'priority-p1' },
        'normal': { label: 'Normal', class: 'priority-p2' },
        'low': { label: 'Low', class: 'priority-low' }
    };
    const priority = task.priority ? (priorityMap[task.priority.toLowerCase()] || { label: task.priority, class: 'priority-default' }) : { label: 'Not set', class: 'priority-default' };
    
    // Create modal overlay with proper ARIA attributes
    const modal = document.createElement('div');
    modal.className = 'mobile-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title-' + normalizedTaskId);
    modal.setAttribute('aria-describedby', 'modal-content-' + normalizedTaskId);
    modal.innerHTML = `
        <div class="mobile-modal modern-task-modal">
            <div class="modal-header-modern">
                <div class="modal-header-top">
                    <div class="modal-badges">
                        <span class="status-badge-modern status-${normalizedStatus}">${escapeHtml(task.status || 'todo')}</span>
                        <span class="priority-badge-modern ${priority.class}">${escapeHtml(priority.label)}</span>
                    </div>
                    <button class="modal-close-modern" data-action="close" aria-label="Close modal">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <h3 id="modal-title-${normalizedTaskId}" class="modal-title-modern">${escapeHtml(task.name)}</h3>
            </div>
            <div class="modal-content-modern" id="modal-content-${normalizedTaskId}">
                <div class="task-detail-compact">
                    
                    <!-- Inline Info Grid -->
                    <div class="info-grid-compact">
                        <div class="info-item">
                            <span class="info-label">Owner</span>
                            <span class="info-value">${escapeHtml(task.owner || 'Unassigned')}</span>
                        </div>
                        ${task.estimatedHours ? `
                        <div class="info-item">
                            <span class="info-label">Effort</span>
                            <span class="info-value">${task.estimatedHours}h</span>
                        </div>
                        ` : ''}
                        ${task.startDate ? `
                        <div class="info-item">
                            <span class="info-label">Start</span>
                            <span class="info-value">${formatDate(task.startDate)}</span>
                        </div>
                        ` : ''}
                        ${task.endDate ? `
                        <div class="info-item">
                            <span class="info-label">Due</span>
                            <span class="info-value">${formatDate(task.endDate)}</span>
                        </div>
                        ` : ''}
                        ${task.startDate && task.endDate ? `
                        <div class="info-item">
                            <span class="info-label">Duration</span>
                            <span class="info-value">${getWorkingDays(task.startDate, task.endDate)} days</span>
                        </div>
                        ` : ''}
                        ${task.assignedBy ? `
                        <div class="info-item">
                            <span class="info-label">Assigned By</span>
                            <span class="info-value">${escapeHtml(task.assignedBy)}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- Jira Link -->
                    ${task.jiraUrl ? `
                        <a href="${sanitizeUrl(task.jiraUrl)}" target="_blank" rel="noopener noreferrer" class="jira-link-compact">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                            <span>${escapeHtml(task.jiraId || 'View in Jira')}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <line x1="7" y1="17" x2="17" y2="7"></line>
                                <polyline points="7 7 17 7 17 17"></polyline>
                            </svg>
                        </a>
                    ` : task.jiraId ? `
                        <div class="jira-text-compact">${escapeHtml(task.jiraId)}</div>
                    ` : ''}
                    
                    <!-- Notes -->
                    ${task.notes ? `
                        <div class="notes-compact">
                            <div class="notes-label">Notes</div>
                            <p class="notes-text">${escapeHtml(task.notes)}</p>
                        </div>
                    ` : ''}
                    
                    <!-- Blockers -->
                    ${task.blockers ? `
                        <div class="blockers-compact">
                            <div class="blockers-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                Blocker
                            </div>
                            <p class="blockers-text">${escapeHtml(task.blockers)}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Get all focusable elements within modal for focus trap
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    // Focus trap handler
    const handleFocusTrap = (e) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) { // Shift + Tab
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            }
        } else { // Tab
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    };
    
    // Focus management: move focus into modal
    const closeBtn = modal.querySelector('.modal-close-modern');
    if (closeBtn) {
        closeBtn.focus();
        closeBtn.addEventListener('click', () => {
            document.removeEventListener('keydown', handleFocusTrap);
            document.removeEventListener('keydown', handleEscape);
            closeMobileModal(previouslyFocused);
        });
    }
    
    // Handle Escape key to close modal
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', handleFocusTrap);
            document.removeEventListener('keydown', handleEscape);
            closeMobileModal(previouslyFocused);
        }
    };
    
    // Add both keyboard handlers
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleFocusTrap);
    
    // Click outside modal to close (single listener with proper cleanup)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.removeEventListener('keydown', handleFocusTrap);
            document.removeEventListener('keydown', handleEscape);
            closeMobileModal(previouslyFocused);
        }
    });
}

function closeMobileModal(previouslyFocused) {
    const modal = document.querySelector('.mobile-modal-overlay');
    if (modal) {
        modal.remove();
    }
    
    // Restore focus to previously focused element
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
    }
}

// Mobile detection aligned with CSS media query (max-width: 768px)
const mobileMediaQuery = window.matchMedia('(max-width: 768px)');

function isMobileDevice() {
    return mobileMediaQuery.matches;
}

// Listen for viewport changes to update mobile UI if needed
if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', (e) => {
        if (e.matches && !mobileUIInitialized) {
            // Switched to mobile view
            initializeMobileUI();
        }
        // Note: Switching from mobile to desktop doesn't tear down mobile UI
        // as CSS handles visibility via .mobile-only/.desktop-only classes
    });
} else if (typeof mobileMediaQuery.addListener === 'function') {
    // Fallback for older Safari/WebViews that don't support addEventListener
    mobileMediaQuery.addListener((e) => {
        if (e.matches && !mobileUIInitialized) {
            initializeMobileUI();
        }
    });
}


// =============================================
// V3 FEATURES: AUTO-REFRESH, NOTIFICATIONS,
// MEMBER PROFILES, ACTIVITY LOG, FAB,
// BREADCRUMB, MICRO-INTERACTIONS
// =============================================

// --- DATA SNAPSHOT FOR ACTIVITY LOG ---
let _previousSnapshot = null;
let _activityLog = [];

function takeDataSnapshot() {
    if (!appData.tasks) return null;
    return {
        timestamp: Date.now(),
        taskCount: appData.tasks.length,
        tasks: appData.tasks.map(t => ({
            id: t.id,
            name: t.name,
            status: t.status,
            completed: t.completed,
            owner: t.owner,
            estimatedHours: t.estimatedHours
        })),
        completedCount: appData.tasks.filter(t => t.completed).length,
        blockedCount: appData.tasks.filter(t => 
            (t.status && t.status.toLowerCase().includes('blocked')) || (t.blockers && t.blockers.trim() !== '')
        ).length
    };
}

// --- AUTO-REFRESH (5-minute polling) ---
let _autoRefreshInterval = null;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function initAutoRefresh() {
    if (_autoRefreshInterval) clearInterval(_autoRefreshInterval);
    
    _autoRefreshInterval = setInterval(async () => {
        try {
            // Take snapshot before silent reload
            _previousSnapshot = takeDataSnapshot();
            
            // Silently re-fetch data without skeleton
            const success = await loadAllData();
            if (!success) return;
            
            const newSnapshot = takeDataSnapshot();
            const hasChanges = detectChanges(_previousSnapshot, newSnapshot);
            
            if (hasChanges) {
                showAutoRefreshBar();
                computeActivityDiff(_previousSnapshot, newSnapshot);
            }
        } catch (e) {
            console.warn('[Auto-Refresh] Silent poll failed:', e);
        }
    }, AUTO_REFRESH_MS);
}

function detectChanges(oldSnap, newSnap) {
    if (!oldSnap || !newSnap) return false;
    if (oldSnap.taskCount !== newSnap.taskCount) return true;
    if (oldSnap.completedCount !== newSnap.completedCount) return true;
    if (oldSnap.blockedCount !== newSnap.blockedCount) return true;
    // Check individual task status changes
    for (let i = 0; i < newSnap.tasks.length; i++) {
        const nt = newSnap.tasks[i];
        const ot = oldSnap.tasks.find(t => t.id === nt.id);
        if (!ot) return true; // new task
        if (ot.status !== nt.status || ot.completed !== nt.completed) return true;
    }
    return false;
}

function showAutoRefreshBar() {
    const bar = document.getElementById('auto-refresh-bar');
    if (bar) bar.style.display = 'flex';
}

function hideAutoRefreshBar() {
    const bar = document.getElementById('auto-refresh-bar');
    if (bar) bar.style.display = 'none';
}

function applyAutoRefresh() {
    hideAutoRefreshBar();
    renderAll();
    showToast('Dashboard updated with latest data', 'success', 2500);
}

function dismissAutoRefresh() {
    hideAutoRefreshBar();
}

// --- ACTIVITY LOG ---
function computeActivityDiff(oldSnap, newSnap) {
    if (!oldSnap || !newSnap) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // New tasks
    newSnap.tasks.forEach(nt => {
        const ot = oldSnap.tasks.find(t => t.id === nt.id);
        if (!ot) {
            _activityLog.unshift({ type: 'added', text: `"${nt.name}" was added`, time: timeStr });
        }
    });
    
    // Removed tasks
    oldSnap.tasks.forEach(ot => {
        const nt = newSnap.tasks.find(t => t.id === ot.id);
        if (!nt) {
            _activityLog.unshift({ type: 'removed', text: `"${ot.name}" was removed`, time: timeStr });
        }
    });
    
    // Changed tasks
    newSnap.tasks.forEach(nt => {
        const ot = oldSnap.tasks.find(t => t.id === nt.id);
        if (!ot) return;
        if (ot.status !== nt.status) {
            _activityLog.unshift({ type: 'changed', text: `"${nt.name}" status → ${nt.status}`, time: timeStr });
        }
        if (!ot.completed && nt.completed) {
            _activityLog.unshift({ type: 'added', text: `"${nt.name}" was completed ✓`, time: timeStr });
        }
        if (ot.owner !== nt.owner) {
            _activityLog.unshift({ type: 'changed', text: `"${nt.name}" reassigned to ${nt.owner}`, time: timeStr });
        }
    });
    
    // Cap at 50 entries
    if (_activityLog.length > 50) _activityLog.length = 50;
    
    // Save to session
    try { sessionStorage.setItem('fmb-activity-log', JSON.stringify(_activityLog)); } catch(e) {}
    
    renderActivityLog();
}

function renderActivityLog() {
    const body = document.getElementById('activity-log-body');
    if (!body) return;
    
    if (_activityLog.length === 0) {
        body.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p>No activity yet</p>
                <span>Changes will appear here after a refresh</span>
            </div>
        `;
        return;
    }
    
    body.innerHTML = _activityLog.map(item => `
        <div class="activity-item">
            <div class="activity-dot ${item.type}"></div>
            <div>
                <div>${escapeHtml(item.text)}</div>
                <div class="activity-time">${escapeHtml(item.time)}</div>
            </div>
        </div>
    `).join('');
}

function toggleActivityLog() {
    const panel = document.getElementById('activity-log-panel');
    if (!panel) return;
    const isActive = panel.classList.contains('active');
    if (isActive) {
        panel.classList.remove('active');
    } else {
        panel.classList.add('active');
        renderActivityLog();
    }
}

function closeActivityLog() {
    const panel = document.getElementById('activity-log-panel');
    if (panel) panel.classList.remove('active');
}

// --- NOTIFICATION SYSTEM ---
let _notifications = [];

function generateNotifications() {
    _notifications = [];
    const today = getTodayLocalDate();
    const todayDate = new Date(today + 'T00:00:00');
    
    if (!appData.tasks) return;
    
    // Overdue tasks (end date past, not completed)
    appData.tasks.forEach(task => {
        if (task.endDate && !task.completed) {
            const endDate = new Date(task.endDate + 'T00:00:00');
            if (endDate < todayDate) {
                _notifications.push({
                    type: 'danger',
                    icon: '⚠️',
                    text: `"${task.name}" is overdue (due ${formatDate(task.endDate)})`,
                    time: 'Now'
                });
            }
        }
    });
    
    // Blocked tasks
    appData.tasks.forEach(task => {
        if ((task.status && task.status.toLowerCase().includes('blocked')) || 
            (task.blockers && task.blockers.trim() !== '')) {
            _notifications.push({
                type: 'warning',
                icon: '🚫',
                text: `"${task.name}" is blocked`,
                time: 'Active'
            });
        }
    });
    
    // Approaching milestones (within 3 days)
    if (appData.milestones) {
        appData.milestones.forEach(milestone => {
            if (milestone.status === 'completed') return;
            const mDate = new Date(milestone.date + 'T00:00:00');
            const diffDays = Math.ceil((mDate - todayDate) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 3) {
                _notifications.push({
                    type: 'info',
                    icon: '🏁',
                    text: `Milestone "${milestone.title}" ${diffDays === 0 ? 'is today' : `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`}`,
                    time: formatDate(milestone.date)
                });
            }
            // Overdue milestones
            if (diffDays < 0 && milestone.status !== 'completed') {
                _notifications.push({
                    type: 'danger',
                    icon: '🚩',
                    text: `Milestone "${milestone.title}" is overdue`,
                    time: formatDate(milestone.date)
                });
            }
        });
    }
    
    // Over-capacity members
    if (appData.teamMembers) {
        appData.teamMembers.forEach(member => {
            const sprintBandwidth = getSprintBandwidth(member);
            const memberTasks = (appData.tasks || []).filter(t => t.owner === member.id);
            const allocated = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
            if (allocated > sprintBandwidth && sprintBandwidth > 0) {
                _notifications.push({
                    type: 'warning',
                    icon: '📊',
                    text: `${member.name} is over capacity (${allocated}h / ${sprintBandwidth}h)`,
                    time: 'Now'
                });
            }
        });
    }
}

function renderNotificationDropdown() {
    const list = document.getElementById('notification-list');
    const badge = document.getElementById('notification-badge');
    if (!list) return;
    
    if (_notifications.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p>All clear!</p>
                <span>No alerts at the moment</span>
            </div>
        `;
    } else {
        list.innerHTML = _notifications.map(n => {
            const iconClass = n.type === 'danger' ? 'noti-danger' : 
                             n.type === 'warning' ? 'noti-warning' : 
                             n.type === 'success' ? 'noti-success' : 'noti-info';
            return `
                <div class="notification-item">
                    <div class="notification-item-icon ${iconClass}">
                        <span style="font-size: 14px;">${n.icon}</span>
                    </div>
                    <div class="notification-item-content">
                        <div class="notification-item-text">${escapeHtml(n.text)}</div>
                        <div class="notification-item-time">${escapeHtml(n.time)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Update badge
    if (badge) {
        if (_notifications.length > 0) {
            badge.textContent = _notifications.length > 9 ? '9+' : _notifications.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    
    const isActive = dropdown.classList.contains('active');
    // Close other panels
    closeAllOverlays();
    
    if (!isActive) {
        dropdown.classList.add('active');
    }
}

function clearNotifications() {
    _notifications = [];
    renderNotificationDropdown();
}

// --- MEMBER PROFILE DRILL-DOWN ---
function showMemberProfile(memberId) {
    const member = getTeamMember(memberId);
    if (!member) return;
    
    const overlay = document.getElementById('member-profile-overlay');
    const header = document.getElementById('member-profile-header');
    const body = document.getElementById('member-profile-body');
    if (!overlay || !header || !body) return;
    
    const memberTasks = (appData.tasks || []).filter(t => t.owner === memberId);
    const sprintBandwidth = getSprintBandwidth(member);
    const allocatedHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const completedTasks = memberTasks.filter(t => t.completed).length;
    const activeTasks = memberTasks.filter(t => !t.completed).length;
    const gradient = getGradientForColorClass(member.colorClass);
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
    const utilizationPercent = sprintBandwidth > 0 ? Math.round((allocatedHours / sprintBandwidth) * 100) : 0;
    
    // Header
    header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div class="profile-card">
                <div class="profile-avatar" style="background: ${gradient};">${initials}</div>
                <div class="profile-info">
                    <h3>${escapeHtml(member.name)}</h3>
                    <span>${escapeHtml(member.role || 'Team Member')}</span>
                </div>
            </div>
            <button onclick="closeMemberProfile()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div class="profile-stats-grid">
            <div class="profile-stat-card">
                <div class="stat-val">${memberTasks.length}</div>
                <div class="stat-lbl">Tasks</div>
            </div>
            <div class="profile-stat-card">
                <div class="stat-val">${allocatedHours}h</div>
                <div class="stat-lbl">Allocated</div>
            </div>
            <div class="profile-stat-card">
                <div class="stat-val">${utilizationPercent}%</div>
                <div class="stat-lbl">Utilization</div>
            </div>
        </div>
    `;
    
    // Body - Colour Legend + Daily Load Heatmap + Task List
    let bodyHTML = '';
    
    // Colour hierarchy legend
    bodyHTML += `<div class="profile-section">
        <div class="profile-section-title">Colour Guide</div>
        <div class="profile-color-legend">
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--success);"></span>
                <span>Completed</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--primary);"></span>
                <span>In Progress</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--danger);"></span>
                <span>Blocked</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--info);"></span>
                <span>In Review</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--gray-400);"></span>
                <span>To Do / Pending</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch" style="background: var(--warning);"></span>
                <span>Delayed</span>
            </div>
        </div>
        <div class="profile-color-legend" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
            <div class="color-legend-item">
                <span class="color-swatch heat-swatch" style="box-shadow: 0 0 0 3px rgba(16,185,129,0.3);background:var(--surface-secondary);"></span>
                <span>Low load (&lt;80%)</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch heat-swatch" style="box-shadow: 0 0 0 3px rgba(245,158,11,0.3);background:var(--surface-secondary);"></span>
                <span>High load (80-100%)</span>
            </div>
            <div class="color-legend-item">
                <span class="color-swatch heat-swatch" style="box-shadow: 0 0 0 3px rgba(239,68,68,0.3);background:var(--surface-secondary);"></span>
                <span>Over capacity (&gt;100%)</span>
            </div>
        </div>
    </div>`;
    
    // Daily Load Heatmap
    if (appData.project) {
        const weeklyHours = member.bandwidthHours ?? 40;
        const hoursPerDay = weeklyHours / WORK_DAYS_PER_WEEK;
        
        // Build daily allocation
        const dailyAllocation = {};
        memberTasks.forEach(task => {
            if (!task.startDate || !task.endDate) return;
            const taskDays = getWorkingDays(task.startDate, task.endDate);
            if (taskDays <= 0) return;
            const hoursPerTaskDay = (task.estimatedHours || 0) / taskDays;
            const dates = generateDateRange(task.startDate, task.endDate);
            dates.forEach(d => {
                if (!isWeekend(d)) {
                    dailyAllocation[d] = (dailyAllocation[d] || 0) + hoursPerTaskDay;
                }
            });
        });
        
        const sprintDates = generateDateRange(appData.project.startDate, appData.project.endDate);
        const todayStr = getTodayLocalDate();
        
        bodyHTML += `<div class="profile-section">
            <div class="profile-section-title">Daily Load Heatmap</div>
            <div class="profile-heatmap">
                ${sprintDates.map(d => {
                    const date = new Date(d + 'T00:00:00');
                    const dayNum = date.getDate();
                    const wkend = isWeekend(d);
                    const allocated = dailyAllocation[d] || 0;
                    const ratio = hoursPerDay > 0 ? allocated / hoursPerDay : 0;
                    const level = wkend ? 0 : ratio === 0 ? 0 : ratio <= 0.4 ? 1 : ratio <= 0.7 ? 2 : ratio <= 1 ? 3 : 4;
                    const isToday = d === todayStr;
                    return `<div class="heatmap-day level-${level} ${isToday ? 'is-today' : ''} ${wkend ? 'is-weekend' : ''}" 
                        data-tip="${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${wkend ? 'Weekend' : `${allocated.toFixed(1)}h / ${hoursPerDay}h`}">${dayNum}</div>`;
                }).join('')}
            </div>
        </div>`;
    }
    
    // Next available
    const avail = getNextAvailableDay(member, 2);
    if (avail) {
        const isToday = avail.date === getTodayLocalDate();
        bodyHTML += `<div class="profile-section">
            <div class="profile-section-title">Availability</div>
            <div style="padding:8px 0; font-size:0.85rem; color: var(--text-secondary);">
                Next available: <strong>${isToday ? 'Today' : formatDate(avail.date)}</strong> with <strong>${avail.freeHours}h</strong> free
            </div>
        </div>`;
    }
    
    // Task list
    bodyHTML += `<div class="profile-section">
        <div class="profile-section-title">Tasks (${memberTasks.length})</div>
        ${memberTasks.length === 0 ? '<div style="font-size:0.8rem;color:var(--text-muted);padding:12px 0;">No tasks assigned</div>' :
        memberTasks.map(task => {
            const statusInfo = getStatusInfo(task.status, task.completed);
            const dotColor = task.completed ? 'var(--success)' : 
                           task.status && task.status.toLowerCase().includes('blocked') ? 'var(--danger)' :
                           task.status && task.status.toLowerCase().includes('progress') ? 'var(--primary)' : 'var(--gray-400)';
            return `<div class="profile-task-item" onclick="closeMemberProfile(); showDesktopTaskDetail('${task.id}');">
                <div class="profile-task-dot" style="background: ${dotColor};"></div>
                <div class="profile-task-name">${escapeHtml(task.name)}</div>
                <div class="profile-task-hours">${task.estimatedHours || 0}h</div>
            </div>`;
        }).join('')}
    </div>`;
    
    body.innerHTML = bodyHTML;
    
    // Show overlay
    overlay.classList.add('active');
}

function closeMemberProfile() {
    const overlay = document.getElementById('member-profile-overlay');
    if (overlay) overlay.classList.remove('active');
}

// --- BREADCRUMB (removed) ---
function updateBreadcrumb() { /* no-op — breadcrumb removed */ }

// --- FAB ---
function initializeFAB() {
    const container = document.getElementById('fab-container');
    const fabMain = document.getElementById('fab-main');
    if (!container || !fabMain) return;
    
    fabMain.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.toggle('open');
    });
    
    // Handle FAB action buttons via delegation
    const fabMenu = document.getElementById('fab-menu');
    if (fabMenu) {
        fabMenu.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.fab-action');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                if (action) handleFabAction(action);
            }
        });
    }
    
    // Close FAB when clicking outside
    document.addEventListener('click', (e) => {
        if (container && !container.contains(e.target)) {
            container.classList.remove('open');
        }
    });
}

function handleFabAction(action) {
    const container = document.getElementById('fab-container');
    if (container) container.classList.remove('open');
    
    switch (action) {
        case 'refresh':
            refreshData();
            break;
        case 'activity':
            toggleActivityLog();
            break;
        case 'export':
            if (typeof exportData === 'function') exportData();
            break;
        case 'print':
            if (typeof window.printReport === 'function') window.printReport();
            else window.print();
            break;
    }
}

// --- HEAT GLOW ON AVATARS ---
function applyHeatGlow() {
    if (!appData.teamMembers || !appData.tasks) return;
    
    const teamList = document.getElementById('desktop-team-list');
    const bandwidthGrid = document.getElementById('desktop-bandwidth-grid');
    if (!teamList && !bandwidthGrid) return;
    
    appData.teamMembers.forEach((member, idx) => {
        const sprintBandwidth = getSprintBandwidth(member);
        const memberTasks = appData.tasks.filter(t => t.owner === member.id);
        const allocated = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
        const ratio = sprintBandwidth > 0 ? allocated / sprintBandwidth : 0;
        
        const heatClass = ratio > 1 ? 'heat-red' : ratio > 0.8 ? 'heat-yellow' : 'heat-green';
        
        // Apply to team list avatars
        if (teamList) {
            const teamAvatars = teamList.querySelectorAll('.team-member-avatar');
            if (teamAvatars[idx]) {
                teamAvatars[idx].classList.remove('heat-green', 'heat-yellow', 'heat-red');
                teamAvatars[idx].classList.add(heatClass);
            }
        }
        
        // Apply to bandwidth card avatars
        if (bandwidthGrid) {
            const bwAvatars = bandwidthGrid.querySelectorAll('.bandwidth-card-avatar');
            if (bwAvatars[idx]) {
                bwAvatars[idx].classList.remove('heat-green', 'heat-yellow', 'heat-red');
                bwAvatars[idx].classList.add(heatClass);
            }
        }
    });
}

// --- MAKE TEAM MEMBERS CLICKABLE ---
function wireTeamMemberClicks() {
    const teamList = document.getElementById('desktop-team-list');
    if (!teamList || !appData.teamMembers) return;
    
    const members = teamList.querySelectorAll('.desktop-team-member');
    members.forEach((el, idx) => {
        if (appData.teamMembers[idx]) {
            el.addEventListener('click', () => {
                showMemberProfile(appData.teamMembers[idx].id);
            });
        }
    });
}

// --- MAKE BANDWIDTH CARDS CLICKABLE ---
function wireBandwidthCardClicks() {
    const bandwidthGrid = document.getElementById('desktop-bandwidth-grid');
    if (!bandwidthGrid || !appData.teamMembers) return;
    
    const cards = bandwidthGrid.querySelectorAll('.desktop-bandwidth-card');
    cards.forEach((card, idx) => {
        if (appData.teamMembers[idx]) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                showMemberProfile(appData.teamMembers[idx].id);
            });
        }
    });
}

// --- COUNT-UP ANIMATION ---
function animateCountUp(element, target, duration = 600) {
    if (!element) return;
    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.textContent = target;
        return;
    }
    
    const isPercent = String(target).includes('%');
    const isHours = String(target).includes('h');
    const suffix = isPercent ? '%' : isHours ? 'h' : '';
    const numTarget = parseFloat(target);
    
    if (isNaN(numTarget)) {
        element.textContent = target;
        return;
    }
    
    const startTime = performance.now();
    
    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(numTarget * eased);
        
        element.textContent = `${current}${suffix}`;
        
        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            element.textContent = target;
            element.classList.add('metric-count-up');
            setTimeout(() => element.classList.remove('metric-count-up'), 400);
        }
    }
    
    requestAnimationFrame(tick);
}

function animateMetrics() {
    // Animate the main metric values
    const progressVal = document.getElementById('sprint-progress-value');
    const utilVal = document.getElementById('team-utilization-value');
    
    if (progressVal && progressVal.textContent) {
        animateCountUp(progressVal, progressVal.textContent);
    }
    if (utilVal && utilVal.textContent) {
        animateCountUp(utilVal, utilVal.textContent);
    }
}

// --- CLOSE ALL OVERLAYS ---
function closeAllOverlays() {
    const dropdown = document.getElementById('notification-dropdown');
    const activityPanel = document.getElementById('activity-log-panel');
    if (dropdown) dropdown.classList.remove('active');
    if (activityPanel) activityPanel.classList.remove('active');
}

// --- NOTIFICATION BELL HANDLER ---
function initializeNotificationBell() {
    const bellBtn = document.getElementById('notification-bell');
    if (!bellBtn) return;
    
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotificationDropdown();
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('notification-dropdown');
        if (dropdown && dropdown.classList.contains('active') && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // Clear button
    const clearBtn = document.querySelector('.notification-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearNotifications();
        });
    }
}

// --- ACTIVITY LOG CLOSE HANDLER ---
function initializeActivityLogPanel() {
    // Close button uses onclick="closeActivityLog()" in HTML — no duplicate listener needed
    
    // Restore from session
    try {
        const saved = sessionStorage.getItem('fmb-activity-log');
        if (saved) _activityLog = JSON.parse(saved);
    } catch(e) {}
}

// --- AUTO-REFRESH BAR HANDLERS ---
function initializeAutoRefreshBar() {
    const updateBtn = document.querySelector('.auto-refresh-btn');
    const dismissBtn = document.querySelector('.auto-refresh-dismiss');
    
    if (updateBtn) updateBtn.addEventListener('click', applyAutoRefresh);
    if (dismissBtn) dismissBtn.addEventListener('click', dismissAutoRefresh);
}

// --- MEMBER PROFILE OVERLAY CLOSE ---
function initializeMemberProfileOverlay() {
    const overlay = document.getElementById('member-profile-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeMemberProfile();
        });
    }
}

// --- EMPTY STATE SVGs ---
function renderEmptyState(container, title, subtitle) {
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p>${escapeHtml(title)}</p>
            <span>${escapeHtml(subtitle)}</span>
        </div>
    `;
}

// --- WIDGET REORDER (drag & drop) ---
let _widgetOrder = null;

function initWidgetReorder() {
    // Restore saved order
    try {
        const saved = localStorage.getItem('fmb-widget-order');
        if (saved) _widgetOrder = JSON.parse(saved);
    } catch(e) {}
    
    if (_widgetOrder) applyWidgetOrder();
    
    // Make dashboard cards draggable
    const dashboard = document.querySelector('.desktop-section[data-section="dashboard"]');
    if (!dashboard) return;
    
    const cards = dashboard.querySelectorAll('.desktop-card');
    cards.forEach((card, idx) => {
        card.setAttribute('draggable', 'true');
        card.dataset.widgetIdx = idx;
        
        card.addEventListener('dragstart', (e) => {
            card.style.opacity = '0.5';
            e.dataTransfer.setData('text/plain', idx);
            e.dataTransfer.effectAllowed = 'move';
        });
        
        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
        });
        
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.style.outline = '2px dashed var(--primary)';
            card.style.outlineOffset = '4px';
        });
        
        card.addEventListener('dragleave', () => {
            card.style.outline = '';
            card.style.outlineOffset = '';
        });
        
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.style.outline = '';
            card.style.outlineOffset = '';
            
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const toIdx = parseInt(card.dataset.widgetIdx);
            
            if (fromIdx === toIdx) return;
            
            const parent = card.parentNode;
            const allCards = Array.from(parent.querySelectorAll('.desktop-card'));
            const fromCard = allCards[fromIdx];
            const toCard = allCards[toIdx];
            
            if (fromIdx < toIdx) {
                parent.insertBefore(fromCard, toCard.nextSibling);
            } else {
                parent.insertBefore(fromCard, toCard);
            }
            
            // Save new order
            saveWidgetOrder();
            
            showToast('Widget order saved', 'success', 1500);
        });
    });
}

function saveWidgetOrder() {
    const dashboard = document.querySelector('.desktop-section[data-section="dashboard"]');
    if (!dashboard) return;
    
    const cards = dashboard.querySelectorAll('.desktop-card');
    const order = Array.from(cards).map(c => c.id || c.querySelector('h3')?.textContent || '');
    
    try {
        localStorage.setItem('fmb-widget-order', JSON.stringify(order));
    } catch(e) {}
}

function applyWidgetOrder() {
    if (!_widgetOrder) return;
    
    const dashboard = document.querySelector('.desktop-section[data-section="dashboard"]');
    if (!dashboard) return;
    
    const cards = Array.from(dashboard.querySelectorAll('.desktop-card'));
    
    _widgetOrder.forEach(identifier => {
        const card = cards.find(c => (c.id === identifier) || (c.querySelector('h3')?.textContent === identifier));
        if (card) dashboard.appendChild(card);
    });
}

// --- ARIA LIVE REGIONS ---
function announceScreenReader(message) {
    let region = document.getElementById('sr-announcements');
    if (!region) {
        region = document.createElement('div');
        region.id = 'sr-announcements';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
        document.body.appendChild(region);
    }
    region.textContent = message;
}

// --- MASTER INITIALIZER FOR V3 FEATURES ---
function initializeV3Features() {
    if (window.innerWidth < 769) return; // Desktop only
    
    // Initialize notification bell
    initializeNotificationBell();
    
    // Initialize activity log panel
    initializeActivityLogPanel();
    
    // Initialize auto-refresh bar handlers
    initializeAutoRefreshBar();
    
    // Initialize member profile overlay
    initializeMemberProfileOverlay();
    
    // Start auto-refresh polling
    initAutoRefresh();
    
    // Take initial data snapshot
    _previousSnapshot = takeDataSnapshot();
    
    // ARIA announcement
    announceScreenReader('Dashboard loaded with latest sprint data');
}

// --- POST-RENDER HOOK (called after renderDesktopUI) ---
function postRenderV3() {
    if (window.innerWidth < 769) return;
    
    // Generate & render notifications
    generateNotifications();
    renderNotificationDropdown();
    
    // Apply heat glow on avatars
    applyHeatGlow();
    
    // Wire team member click handlers
    wireTeamMemberClicks();
    
    // Animate metrics
    animateMetrics();
    
    // Wire bandwidth card clicks for member profile
    wireBandwidthCardClicks();
    
}

// --- EXPOSE FUNCTIONS GLOBALLY ---
window.showMemberProfile = showMemberProfile;
window.closeMemberProfile = closeMemberProfile;
window.toggleNotificationDropdown = toggleNotificationDropdown;
window.clearNotifications = clearNotifications;
window.toggleActivityLog = toggleActivityLog;
window.closeActivityLog = closeActivityLog;
window.applyAutoRefresh = applyAutoRefresh;
window.dismissAutoRefresh = dismissAutoRefresh;

