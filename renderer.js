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
        const isWE = isWeekend(date);
        const isHol = isHoliday(date);
        const isToday = date === today;
        ganttParts.push(`<div class="gantt-header-day ${isWE || isHol ? 'weekend' : ''} ${isToday ? 'today' : ''}" title="${formatDate(date)}">${day}</div>`);
    });
    ganttParts.push('</div>');
    
    // Task rows - optimized with reduced DOM queries
    filteredTasks.forEach(task => {
        const member = getTeamMember(task.owner);
        const ownerName = task.owner === 'both' ? 'Both' : (member ? member.name : task.owner);
        const startDateFormatted = formatDate(task.startDate);
        const endDateFormatted = formatDate(task.endDate);
        const dateInfo = startDateFormatted === endDateFormatted ? startDateFormatted : `${startDateFormatted} - ${endDateFormatted}`;
        
        ganttParts.push(`<div class="gantt-row" style="grid-template-columns: 220px repeat(${dateCount}, minmax(30px, 1fr));">
            <div class="gantt-task-name">
                <span class="gantt-task-title">${escapeHtml(task.name)}</span>
                <span class="gantt-task-owner">${escapeHtml(ownerName)} • ${dateInfo}</span>
            </div>`);
        
        // Create cells for each date
        let taskStartIndex = dates.indexOf(task.startDate);
        let taskEndIndex = dates.indexOf(task.endDate);
        
        dates.forEach((date, index) => {
            const isWE = isWeekend(date);
            const isHol = isHoliday(date);
            const isToday = date === today;
            const cellClasses = ['gantt-cell'];
            if (isWE || isHol) cellClasses.push('weekend');
            if (isToday) cellClasses.push('today');
            
            ganttParts.push(`<div class="${cellClasses.join(' ')}">`);
            
            // Render task bar on start date cell
            if (index === taskStartIndex && taskEndIndex >= taskStartIndex) {
                const duration = taskEndIndex - taskStartIndex + 1;
                const barClass = task.priority === 'urgent' ? 'bar-urgent' : 
                               task.priority === 'pending' ? 'bar-pending' :
                               member ? `bar-${member.colorClass}` : 'bar-primary';
                
                const workingDays = getWorkingDays(task.startDate, task.endDate);
                const barWidth = `calc(${duration * 100}% - 4px)`;
                const barLabel = workingDays > 0 ? `${workingDays}d` : '1d';
                
                ganttParts.push(`<div class="gantt-bar ${barClass}" style="left: 2px; width: ${barWidth};" title="${escapeHtml(task.name)}: ${dateInfo} (${workingDays} working days)" role="img" aria-label="Task duration: ${workingDays} working days">
                    <span class="gantt-bar-label">${barLabel}</span>
                </div>`);
            }
            
            ganttParts.push('</div>');
        });
        
        ganttParts.push('</div>');
    });
    
    ganttParts.push('</div>');
    
    // Single DOM update for better performance
    ganttContainer.innerHTML = ganttParts.join('');
}

// XSS protection helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        const urgencyClass = task.priority === 'urgent' ? 'urgent' : 
                           task.priority === 'pending' ? 'pending' : '';
        
        const badgeClass = task.priority === 'urgent' ? 'badge-danger' :
                          task.priority === 'pending' ? 'badge-warning' :
                          task.status.toLowerCase().includes('complete') || task.completed ? 'badge-success' : 'badge-info';
        
        const badgeIcon = task.priority === 'urgent' ? '🔴' :
                         task.priority === 'pending' ? '⏳' :
                         task.status.toLowerCase().includes('complete') || task.completed ? '✅' : '📋';
        
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
    
    // Then render all content
    renderHeader();
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

