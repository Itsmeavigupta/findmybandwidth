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
}function renderTeamOverview() {
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
    
    const filteredTasks = getFilteredTasks();
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
        ganttParts.push(`<div class="gantt-header-day ${isWE || isHol ? 'weekend' : ''} ${isToday ? 'today' : ''}" title="${formatDate(date)}">
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
                    ganttParts.push(`<div class="gantt-bar ${statusClass}" style="left: 2px; width: calc(100% - 4px);" title="${escapeHtml(task.name)}: ${task.status}" role="img" aria-label="Task status: ${task.status}">
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
                    const barClass = task.priority === 'urgent' ? 'bar-urgent' : 
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
                        
                        ganttParts.push(`<div class="gantt-bar ${barClass}" style="left: ${barPosition}; width: ${barWidth};" title="${escapeHtml(task.name)}: ${dateInfo} (${workingDays} working days)${isOverflowing}" role="img" aria-label="Task duration: ${workingDays} working days${isOverflowing}">
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
}

function updateLegend() {
    if (!appData.teamMembers || appData.teamMembers.length === 0) return;
    
    const legend = document.querySelector('.legend');
    if (!legend) return;
    
    let legendHTML = '';
    
    // Add team member colors
    appData.teamMembers.forEach(member => {
        const colorClass = member.colorClass;
        const gradient = getGradientForColorClass(colorClass);
        legendHTML += `
            <div class="legend-item">
                <div class="legend-color" style="background:${gradient};"></div>${member.name}
            </div>
        `;
    });
    
    // Add priority colors
    legendHTML += `
        <div class="legend-item">
            <div class="legend-color" style="background:linear-gradient(135deg,#ef4444,#dc2626);"></div>Urgent
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:linear-gradient(135deg,#94a3b8,#64748b);"></div>Low Priority
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#fecaca;"></div>Weekend/Holiday
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
                <div class="sprint-header" title="Current sprint information">
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
                <div class="sprint-progress-bar" title="Overall sprint completion">
                    <div class="sprint-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="sprint-progress-text">${progressPercent}% complete (${metrics.completed}/${metrics.total} tasks)</div>
            </div>
            
            <!-- Key Metrics - Compact Single Row -->
            <div class="mobile-card">
                <div class="card-header">
                    <h3>Sprint Status</h3>
                    <button type="button" class="help-icon-button" aria-label="Task status breakdown" title="Task status breakdown">
                        <svg class="help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </button>
                </div>
                <div class="metric-row">
                    <div class="metric-compact" title="Tasks currently being worked on">
                        <div class="metric-value-sm">${metrics.inProgress}</div>
                        <div class="metric-label-sm">Active</div>
                    </div>
                    <div class="metric-compact ${metrics.blocked > 0 ? 'danger' : ''}" title="Tasks blocked or requiring attention">
                        <div class="metric-value-sm">${metrics.blocked}</div>
                        <div class="metric-label-sm">Blocked</div>
                    </div>
                    <div class="metric-compact ${metrics.overdue > 0 ? 'warning' : ''}" title="Tasks past their due date">
                        <div class="metric-value-sm">${metrics.overdue}</div>
                        <div class="metric-label-sm">Overdue</div>
                    </div>
                    <div class="metric-compact success" title="Completed tasks">
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
                        <button class="quick-nav-btn" data-action="navigate" data-section="timeline" title="Jump to visual sprint timeline">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line></svg>
                            <span>Timeline</span>
                        </button>
                        <button class="quick-nav-btn" data-action="navigate" data-section="tasks" title="View and manage all tasks">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            <span>Tasks</span>
                        </button>
                        <button class="quick-nav-btn" data-action="navigate" data-section="bandwidth" title="Check team capacity & load">
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
                            return `<span class="status-icon-pill status-${status}" style="--status-color: ${statusColors[status]}" title="${status}: ${count} tasks">
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
                                                        title="${monthShort} ${day.dayNum}: ${day.taskCount} task${day.taskCount !== 1 ? 's' : ''}">
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

