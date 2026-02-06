// =============================================
// UTILITY FUNCTIONS
// =============================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysBetween(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate - startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

function getWorkingDays(start, end) {
    let count = 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) { // Not Sunday or Saturday
            count++;
        }
    }
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

function filterSearch(value) {
    filters.search = value;
    renderGanttChart();
    renderAllTaskCards();
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
    const ganttChart = document.querySelector('.gantt-chart');
    if (!ganttChart) return;
    
    // Calculate dynamic column count
    const dateCount = dates.length;
    
    // Render header
    let headerHTML = `<div class="gantt-header" style="grid-template-columns: 200px repeat(${dateCount}, 1fr);">
        <div class="gantt-header-task">Task</div>`;
    
    dates.forEach(date => {
        const day = new Date(date).getDate();
        const isWE = isWeekend(date);
        const isHol = isHoliday(date);
        headerHTML += `<div class="gantt-header-day ${isWE || isHol ? 'weekend' : ''}">${day}</div>`;
    });
    headerHTML += `</div>`;
    
    // Render task rows
    const filteredTasks = getFilteredTasks();
    let rowsHTML = '';
    
    filteredTasks.forEach(task => {
        const member = getTeamMember(task.owner);
        const ownerName = task.owner === 'both' ? 'Both' : (member ? member.name : task.owner);
        const dateInfo = `${formatDate(task.startDate)}${task.startDate !== task.endDate ? ' - ' + formatDate(task.endDate) : ''}`;
        
        rowsHTML += `<div class="gantt-row" style="grid-template-columns: 200px repeat(${dateCount}, 1fr);">
            <div class="gantt-task-name">
                ${task.name}
                <span class="gantt-task-owner">${ownerName} | ${dateInfo}</span>
            </div>`;
        
        // Calculate bar position and width
        dates.forEach(date => {
            const isWE = isWeekend(date);
            const isHol = isHoliday(date);
            let cellHTML = `<div class="gantt-cell ${isWE || isHol ? 'weekend' : ''}">`;
            
            // Check if task bar should appear in this cell
            if (date === task.startDate) {
                const duration = getDaysBetween(task.startDate, task.endDate);
                const barClass = task.priority === 'urgent' ? 'bar-urgent' : 
                               task.priority === 'pending' ? 'bar-pending' :
                               member ? `bar-${member.colorClass}` : 'bar-primary';
                
                const workingDays = getWorkingDays(task.startDate, task.endDate);
                const opacity = task.owner === 'both' ? 'opacity:0.5;' : '';
                
                cellHTML += `<div class="gantt-bar ${barClass}" style="left:2px;width:calc(${duration * 100}% - 4px);${opacity}">
                    ${dateInfo} ${workingDays > 1 ? `(${workingDays} days)` : ''}
                </div>`;
            }
            
            cellHTML += `</div>`;
            rowsHTML += cellHTML;
        });
        
        rowsHTML += `</div>`;
    });
    
    ganttChart.innerHTML = headerHTML + rowsHTML;
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
    
    const grid = document.querySelector('.milestones-grid');
    if (!grid) return;
    
    grid.innerHTML = appData.milestones.map(m => `
        <div class="milestone-item">
            <div class="milestone-date">${formatDate(m.date)}</div>
            <div class="milestone-details">
                <h4>${m.title}</h4>
                <span>${m.assignee}</span>
            </div>
        </div>
    `).join('');
}

function renderAll() {
    if (!appData.loaded) {
        console.warn('Data not loaded yet');
        return;
    }
    
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
    const gradients = {
        'primary': 'linear-gradient(135deg,#4361ee,#7c3aed)',
        'success': 'linear-gradient(135deg,#10b981,#059669)',
        'warning': 'linear-gradient(135deg,#f59e0b,#d97706)',
        'danger': 'linear-gradient(135deg,#ef4444,#dc2626)',
        'info': 'linear-gradient(135deg,#06b6d4,#0891b2)'
    };
    return gradients[colorClass] || gradients.primary;
}

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for data to load (loaded by dataLoader.js)
    let retries = 0;
    const maxRetries = 50; // 5 seconds max wait
    
    while (!appData.loaded && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!appData.loaded) {
        console.error('Failed to load data within timeout');
        return;
    }
    
    renderAll();
    setupDynamicSections();
    addToolbar();
});

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
        <div id="toolbar" style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <button onclick="refreshData()" style="padding:6px 12px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔄 Refresh Data</button>
            <button onclick="exportData()" style="padding:6px 12px;background:#4361ee;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;">📥 Export JSON</button>
            <input type="text" placeholder="Search tasks..." onkeyup="filterSearch(this.value)" style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.8rem;flex:1;min-width:200px;">
            <select onchange="filterOwner(this.value)" style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.8rem;">
                <option value="all">All Owners</option>
                ${ownerOptions}
                <option value="both">Both</option>
            </select>
            <select onchange="filterPriority(this.value)" style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;font-size:0.8rem;">
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="pending">Pending</option>
            </select>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;">
                <input type="checkbox" onchange="filterCompleted(this.checked)"> Hide Completed
            </label>
        </div>
    `);
}

