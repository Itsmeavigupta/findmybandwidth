// =============================================
// UTILITY FUNCTIONS
// =============================================

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

function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
}

function generateDateRange(start, end) {
    const dates = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
    }
    return dates;
}

function isHoliday(dateStr) {
    if (!appData.holidays) return false;
    return appData.holidays.some(h => h.date === dateStr);
}

// Debounce utility for performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// XSS protection helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    
    const header = document.querySelector('.header');
    const h1 = header.querySelector('h1');
    const p = header.querySelector('p');
    const metaInfo = header.querySelector('.meta-info');
    
    h1.textContent = `📊 Sprint Roadmap & Bandwidth Report - ${appData.project.name}`;
    
    const dateRange = `📅 ${formatDate(appData.project.startDate)} - ${formatDate(appData.project.endDate)}`;
    const preparedBy = `👤 Prepared by: ${appData.project.preparedBy}`;
    
    metaInfo.innerHTML = `
        <div class="meta-item">${dateRange}</div>
        <div class="meta-item">${preparedBy}</div>
    `;
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
    
    tbody.innerHTML = appData.teamMembers.map(member => `
        <tr>
            <td><strong>${member.name}</strong></td>
            <td>${member.bandwidthDesc}</td>
            <td>${member.effectiveBandwidth.split('|').map(b => 
                `<span class="badge badge-${member.colorClass}">${b.trim()}</span>`
            ).join(' ')}</td>
        </tr>
    `).join('');
}

function renderGanttChart() {
    if (!appData.project || !appData.tasks) return;
    
    const dates = generateDateRange(appData.project.startDate, appData.project.endDate);
    console.log(`📊 Gantt Chart: ${dates.length} days from ${appData.project.startDate} to ${appData.project.endDate}`);
    
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;
    
    const filteredTasks = getFilteredTasks();
    const dateCount = dates.length;
    const today = new Date().toISOString().split('T')[0];
    
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
            
            const visibleStartIndex = dates.findIndex(d => d === visibleStartDate.toISOString().split('T')[0]);
            const visibleEndIndex = dates.findIndex(d => d === visibleEndDate.toISOString().split('T')[0]);
            
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
                                   task.priority === 'pending' ? 'bar-pending' :
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
        return { class: 'status-completed', label: '✓', color: 'success' };
    }
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('blocked') || statusLower.includes('stuck')) {
        return { class: 'status-blocked', label: '🚫', color: 'danger' };
    } else if (statusLower.includes('in progress') || statusLower.includes('active')) {
        return { class: 'status-in-progress', label: '▶', color: 'warning' };
    } else if (statusLower.includes('review') || statusLower.includes('qa')) {
        return { class: 'status-review', label: '👁', color: 'info' };
    } else if (statusLower.includes('pending') || statusLower.includes('planned')) {
        return { class: 'status-pending', label: '⏳', color: 'secondary' };
    } else if (statusLower.includes('delayed') || statusLower.includes('behind')) {
        return { class: 'status-delayed', label: '⚠', color: 'danger' };
    } else if (statusLower.includes('cancelled') || statusLower.includes('abandoned')) {
        return { class: 'status-cancelled', label: '✗', color: 'muted' };
    } else {
        return { class: 'status-not-started', label: '○', color: 'secondary' };
    }
}

// Helper function to get priority styling
function getPriorityInfo(priority) {
    switch (priority) {
        case 'urgent':
            return { class: 'priority-urgent', color: '#dc3545' };
        case 'normal':
            return { class: 'priority-normal', color: '#ffc107' };
        case 'pending':
            return { class: 'priority-pending', color: '#6c757d' };
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
                           task.priority === 'pending' ? 'pending' : '';
        
        const badgeClass = `badge-${statusInfo.color}`;
        const badgeIcon = statusInfo.label;
        
        const jiraHTML = task.jiraId ? 
            `<span><strong>Jira:</strong> <a href="${task.jiraUrl}" class="jira-link" target="_blank">${task.jiraId}</a></span>` :
            '';
        
        const delayHTML = task.notes ? `<div class="delay-reason">⚠️ ${task.notes}</div>` : '';
        
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
    initializeMobileOptimizations();
    
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
            <div class="legend-color" style="background:linear-gradient(135deg,#94a3b8,#64748b);"></div>Pending
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
                    <div class="section-icon ${iconClass}" style="background:${gradient};">👤</div>
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
                <button class="btn btn-print" data-action="print" aria-label="Print report">🖨️ Print</button>
                <button class="btn btn-refresh" data-action="refresh" aria-label="Refresh data from Google Sheets">🔄 Refresh</button>
                <button class="btn btn-export" data-action="export" aria-label="Export data as JSON">📥 Export</button>
            </div>
            <input type="text" placeholder="🔍 Search tasks..." class="toolbar-search" data-filter="search" aria-label="Search tasks">
            <div class="toolbar-group toolbar-filters">
                <select class="toolbar-select" data-filter="owner" aria-label="Filter by owner">
                    <option value="all">👥 All Owners</option>
                    ${ownerOptions}
                    <option value="both">Both</option>
                </select>
                <select class="toolbar-select" data-filter="priority" aria-label="Filter by priority">
                    <option value="all">⚡ All Priorities</option>
                    <option value="urgent">🔴 Urgent</option>
                    <option value="normal">🟢 Normal</option>
                    <option value="pending">⏳ Pending</option>
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
    
    // Calculate team utilization
    const totalCapacity = appData.teamMembers.reduce((sum, member) => sum + (member.capacity || 0), 0);
    const assignedTasks = appData.tasks.filter(task => task.owner !== 'both').length;
    const utilizationPercent = totalCapacity > 0 ? Math.min(Math.round((assignedTasks / totalCapacity) * 100), 100) : 0;
    
    const utilizationValue = document.getElementById('team-utilization-value');
    if (utilizationValue) utilizationValue.textContent = `${utilizationPercent}%`;
    
    // Calculate risk level
    const blockedTasks = appData.tasks.filter(task => 
        task.status && task.status.toLowerCase().includes('blocked') ||
        task.blockers && task.blockers.trim() !== ''
    ).length;
    
    const delayedTasks = appData.tasks.filter(task => 
        task.status && task.status.toLowerCase().includes('delayed')
    ).length;
    
    const riskLevel = blockedTasks > 2 || delayedTasks > 1 ? 'High' : 
                     blockedTasks > 0 || delayedTasks > 0 ? 'Medium' : 'Low';
    
    const riskValue = document.getElementById('risk-indicator-value');
    const riskSubtitle = document.getElementById('risk-indicator-subtitle');
    if (riskValue) riskValue.textContent = riskLevel;
    if (riskSubtitle) riskSubtitle.textContent = `${blockedTasks} blocked, ${delayedTasks} delayed tasks`;
    
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
        const isToday = date === new Date().toISOString().split('T')[0];
        const cellClasses = ['gantt-cell'];
        if (isWE || isHol) cellClasses.push('weekend');
        if (isToday) cellClasses.push('today');
        
        rowHtml += `<div class="${cellClasses.join(' ')}"></div>`;
    });
    
    rowHtml += '</div>';
    return rowHtml;
}

// =============================================
// MOBILE OPTIMIZATIONS
// =============================================

function initializeMobileOptimizations() {
    // Detect touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isTouchDevice) {
        // Show zoom controls on mobile
        const zoomControls = document.querySelector('.zoom-controls');
        if (zoomControls) {
            zoomControls.style.display = 'flex';
        }
        
        // Add zoom button event listeners
        const zoomInBtn = document.querySelector('.zoom-in');
        const zoomOutBtn = document.querySelector('.zoom-out');
        const zoomResetBtn = document.querySelector('.zoom-reset');
        
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoom(0.8));
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => handleZoom(1));
        
        // Add touch-specific event listeners
        initializeTouchGestures();
        
        // Optimize for mobile performance
        optimizeMobilePerformance();
    }
}

function initializeTouchGestures() {
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;
    
    let startX, startY, isScrolling = false;
    
    // Touch start
    ganttContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isScrolling = false;
    }, { passive: true });
    
    // Touch move
    ganttContainer.addEventListener('touchmove', (e) => {
        if (!startX || !startY) return;
        
        const deltaX = Math.abs(e.touches[0].clientX - startX);
        const deltaY = Math.abs(e.touches[0].clientY - startY);
        
        // Determine if scrolling horizontally or vertically
        if (deltaX > deltaY && deltaX > 10) {
            isScrolling = true;
            // Horizontal scroll for timeline
            e.preventDefault();
        }
    }, { passive: false });
    
    // Pinch to zoom (simplified)
    let initialDistance = 0;
    ganttContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
        }
    }, { passive: true });
    
    ganttContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const scale = currentDistance / initialDistance;
            if (scale > 1.2) {
                // Zoom in
                handleZoom(1.2);
            } else if (scale < 0.8) {
                // Zoom out
                handleZoom(0.8);
            }
        }
    }, { passive: true });
}

function handleZoom(scale) {
    const ganttContainer = document.querySelector('.gantt-container');
    if (!ganttContainer) return;
    
    // Handle reset case
    if (scale === 1) {
        ganttContainer.dataset.zoom = '1';
        ganttContainer.style.fontSize = '100%';
        
        // Reset cell widths
        const cells = ganttContainer.querySelectorAll('.gantt-cell');
        cells.forEach(cell => {
            cell.style.minWidth = '';
        });
        return;
    }
    
    // Handle zoom in/out
    const currentZoom = parseFloat(ganttContainer.dataset.zoom || '1');
    const newZoom = Math.max(0.5, Math.min(2, currentZoom * scale));
    
    ganttContainer.dataset.zoom = newZoom;
    ganttContainer.style.fontSize = `${newZoom * 100}%`;
    
    // Adjust cell widths
    const cells = ganttContainer.querySelectorAll('.gantt-cell');
    cells.forEach(cell => {
        const baseWidth = 30; // Base cell width
        cell.style.minWidth = `${baseWidth * newZoom}px`;
    });
}

function optimizeMobilePerformance() {
    // Reduce animations on mobile for better performance
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 768px) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Use passive listeners where possible
    const options = { passive: true, capture: false };
    
    // Add intersection observer for lazy loading
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Load content when visible
                    entry.target.classList.add('visible');
                }
            });
        }, { rootMargin: '50px' });
        
        // Observe sections
        document.querySelectorAll('.section').forEach(section => {
            observer.observe(section);
        });
    }
}

