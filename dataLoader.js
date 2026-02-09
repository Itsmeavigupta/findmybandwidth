// =============================================
// GOOGLE SHEETS DATA LOADER (Real-Time Collaboration)
// No login required! Just share your Google Sheet
// =============================================

/**
 * Configuration - Your Google Sheet
 * 
 * SETUP:
 * 1. Create Google Sheet with 4 tabs: SPRINT_CONFIG, MEMBERS, TASKS, MILESTONES
 * 2. Share → Anyone with link can VIEW
 * 3. Copy the Sheet ID from URL
 * 4. Paste below
 */
const GOOGLE_SHEETS_CONFIG = {
    // Google Sheets gviz/tq endpoint returns CSV data without download
    // Using the original sheet ID with gviz API
    sheetId: '1_ZHZV-9X_CZ4GhrFUaon1Xv-f4JHnd1_NfSKLuclBQc',
    
    // GID for each sheet (from the URL #gid=...)
    gids: {
        SPRINT_CONFIG: '0',
        MEMBERS: '2073523473',
        TASKS: '1579655569',
        MILESTONES: '1458173099'
    }
};

/**
 * Global data store
 */
let appData = {
    project: null,
    teamMembers: [],
    tasks: [],
    milestones: [],
    holidays: [],
    loaded: false,
    error: null,
    source: 'excel-web-viewer'
};

/**
 * Load data from Google Sheets using public CSV export
 * Works without authentication when sheet is shared publicly
 */
async function loadFromGoogleSheets() {
    try {
        console.log('🔄 Loading from Google Sheets...');
        
        // Load all sheets in parallel using gviz API with gid
        const results = await Promise.allSettled([
            fetchGoogleSheet('SPRINT_CONFIG', GOOGLE_SHEETS_CONFIG.gids.SPRINT_CONFIG),
            fetchGoogleSheet('MEMBERS', GOOGLE_SHEETS_CONFIG.gids.MEMBERS),
            fetchGoogleSheet('TASKS', GOOGLE_SHEETS_CONFIG.gids.TASKS),
            fetchGoogleSheet('MILESTONES', GOOGLE_SHEETS_CONFIG.gids.MILESTONES)
        ]);
        
        // Handle partial failures gracefully
        const errors = [];
        const [configResult, membersResult, tasksResult, milestonesResult] = results;
        
        if (configResult.status === 'rejected') {
            errors.push(`SPRINT_CONFIG: ${configResult.reason}`);
        }
        if (membersResult.status === 'rejected') {
            errors.push(`MEMBERS: ${membersResult.reason}`);
        }
        if (tasksResult.status === 'rejected') {
            errors.push(`TASKS: ${tasksResult.reason}`);
        }
        // Milestones are optional
        
        if (errors.length > 0) {
            throw new Error(`Failed to load required sheets:\n${errors.join('\n')}`);
        }
        
        // Normalize data with error handling
        try {
            appData.project = normalizeSprintConfig(configResult.value);
        } catch (err) {
            console.error('Error normalizing SPRINT_CONFIG:', err);
            throw new Error('Invalid SPRINT_CONFIG data structure');
        }
        
        try {
            appData.teamMembers = normalizeMembers(membersResult.value);
        } catch (err) {
            console.error('Error normalizing MEMBERS:', err);
            throw new Error('Invalid MEMBERS data structure');
        }
        
        try {
            appData.tasks = normalizeTasks(tasksResult.value);
        } catch (err) {
            console.error('Error normalizing TASKS:', err);
            throw new Error('Invalid TASKS data structure');
        }
        
        try {
            appData.milestones = milestonesResult.status === 'fulfilled' 
                ? normalizeMilestones(milestonesResult.value) 
                : [];
        } catch (err) {
            console.warn('Error normalizing MILESTONES (optional):', err);
            appData.milestones = [];
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error loading from Google Sheets:', error);
        throw error;
    }
}

/**
 * Fetch a specific sheet from Google Sheets as CSV
 * Uses gviz/tq API endpoint - works on GitHub Pages without CORS proxy
 */
async function fetchGoogleSheet(sheetName, gid) {
    // Cache-busting: append timestamp to prevent stale data
    const cacheBuster = Date.now();
    const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_CONFIG.sheetId}/gviz/tq?tqx=out:csv&gid=${gid}&_=${cacheBuster}`;
    
    try {
        console.log(`📥 Fetching ${sheetName}... (cache-bust: ${cacheBuster})`);
        
        let response;
        let fetchMethod = 'direct';
        
        // Use cache: 'no-store' to bypass browser cache
        // Avoid custom headers that could trigger CORS preflight
        const fetchOptions = {
            method: 'GET',
            cache: 'no-store'
        };
        
        // Strategy: Try direct fetch first (works from GitHub Pages & most hosted origins).
        // Only fall back to CORS proxies when direct fails (e.g. localhost development).
        try {
            response = await fetch(csvUrl, fetchOptions);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            fetchMethod = 'direct';
        } catch (directError) {
            console.log(`   ⚠️ Direct fetch failed (${directError.message}), trying CORS proxies...`);
            
            // List of CORS proxy fallbacks — tried in order
            const proxies = [
                (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
                (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                (url) => `https://cors-anywhere.herokuapp.com/${url}`
            ];
            
            let proxySuccess = false;
            for (const buildProxyUrl of proxies) {
                try {
                    const proxyUrl = buildProxyUrl(csvUrl);
                    response = await fetch(proxyUrl, fetchOptions);
                    if (response.ok) {
                        fetchMethod = 'proxy';
                        proxySuccess = true;
                        break;
                    }
                } catch (_) { /* try next proxy */ }
            }
            
            if (!proxySuccess) {
                throw new Error(`All fetch methods failed for ${sheetName}. Ensure sheet is shared publicly (Anyone with link → Viewer).`);
            }
        }
        
        const csvText = await response.text();
        console.log(`   ✅ ${sheetName}: ${csvText.length} chars via ${fetchMethod}`);
        
        const data = parseCSV(csvText);
        console.log(`   📊 ${sheetName}: ${data.length} rows parsed`);
        
        return data;
        
    } catch (error) {
        console.error(`❌ Failed to load ${sheetName}:`, error);
        throw new Error(`Cannot load ${sheetName}: ${error.message}`);
    }
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    // Parse headers
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0 || values.every(v => !v)) continue;
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return data;
}

/**
 * Parse a single CSV line (handles quoted values with commas)
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}

/**
 * Normalize SPRINT_CONFIG data
 */
function normalizeSprintConfig(rawData) {
    console.log('🔧 normalizeSprintConfig input:', rawData);
    const config = {};
    
    rawData.forEach((row, index) => {
        // CSV headers are "key" and "value", so each row is {key: "...", value: "..."}
        const columns = Object.keys(row);
        if (columns.length < 2) {
            console.log(`   ⚠️ Row ${index}: skipping — not enough columns`);
            return;
        }
        
        // Read cell values (not header names)
        let cellKey = (row[columns[0]] || '').trim();
        let cellValue = (row[columns[1]] || '').trim();
        
        if (!cellKey) return;
        
        // Strip "key " prefix from the key cell (e.g. "key sprint_name" → "sprint_name")
        if (cellKey.toLowerCase().startsWith('key ')) {
            cellKey = cellKey.replace(/^key\s+/i, '').trim();
        }
        
        // Strip "value " prefix from the value cell (e.g. "value Jan-Feb 2026" → "Jan-Feb 2026")
        if (cellValue.toLowerCase().startsWith('value ')) {
            cellValue = cellValue.replace(/^value\s+/i, '').trim();
        }
        
        if (cellKey && cellValue) {
            config[cellKey] = cellValue;
            console.log(`   ✅ config[${cellKey}] = "${cellValue}"`);
        }
    });
    
    console.log('📋 Sprint Config parsed:', config);
    
    // Calculate default date range (current month if not specified)
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    
    return {
        name: config.sprint_name,
        startDate: config.start_date || defaultStart,
        endDate: config.end_date || defaultEnd,
        preparedBy: config.prepared_by || config.preparedBy || 'Unknown'
    };
}

/**
 * Normalize MEMBERS data
 * DATA CONTRACT: MEMBERS sheet should have:
 *   - id (required): Unique identifier
 *   - name (required): Display name
 *   - role (optional): Job title, defaults to "Team Member"
 *   - color_class (optional): primary|success|warning|info|danger
 *   - capacity (optional): Capacity percentage string
 *   - focus (optional): Current focus area
 *   - bandwidth_hours (optional): Available hours per week (NUMBER), defaults to 40
 */
function normalizeMembers(rawData) {
    if (!Array.isArray(rawData)) {
        throw new Error('MEMBERS data must be an array');
    }
    
    return rawData.map((row, index) => {
        // Sanitize and validate inputs
        const id = sanitizeId(row.id || row.Id || row.ID || `member-${index}`);
        const name = sanitizeText(row.name || row.Name || row.NAME || `Member ${index + 1}`);
        const colorClass = sanitizeColorClass(row.color_class || row['color class'] || row.ColorClass || getDefaultColorClass(id));
        
        // Parse bandwidth_hours as explicit number - NO INFERENCE
        const bandwidthHours = parseNumericField(
            row.bandwidth_hours || row['bandwidth hours'] || row.bandwidthHours,
            40 // Default: 40 hours/week
        );
        
        return {
            id,
            name,
            role: sanitizeText(row.role || row.Role || row.ROLE || 'Team Member'),
            colorClass,
            capacity: sanitizeText(row.capacity || row.Capacity || '100%'),
            focus: sanitizeText(row.focus || row.Focus || 'Sprint work'),
            bandwidthHours // EXPLICIT numeric field - no parsing from text
        };
    }).filter(member => member.id && member.name && member.id !== 'member-0');
}

/**
 * Parse numeric field with default fallback
 */
function parseNumericField(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Input sanitization helpers
 */
function sanitizeText(text) {
    if (typeof text !== 'string') text = String(text || '');
    return text.trim().substring(0, 500); // Limit length to prevent DoS
}

function sanitizeId(id) {
    if (typeof id !== 'string') id = String(id || '');
    return id.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').substring(0, 50);
}

function sanitizeColorClass(colorClass) {
    const validColors = ['primary', 'success', 'warning', 'info', 'danger'];
    const cleaned = colorClass.trim().toLowerCase();
    return validColors.includes(cleaned) ? cleaned : 'primary';
}

/**
 * Get default color class based on ID hash
 */
function getDefaultColorClass(id) {
    const colors = ['primary', 'success', 'warning', 'info', 'danger'];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

/**
 * Normalize TASKS data
 * DATA CONTRACT: TASKS sheet should have:
 *   - id (required): Unique identifier
 *   - name/title (required): Task name
 *   - owner (required): Member ID who owns this task
 *   - start_date (required): Task start date
 *   - end_date (required): Task end date
 *   - status (optional): in-progress|todo|completed|blocked|review|pending
 *   - priority (optional): urgent|normal|low
 *   - jira_id (optional): Jira ticket ID
 *   - jira_url (optional): Link to Jira ticket
 *   - estimated_hours (optional): Estimated hours (NUMBER), defaults to 8
 *   - bu (optional): Business unit
 *   - type (optional): Task type
 *   - blockers (optional): Blocker description
 *   - notes (optional): Additional notes
 */
function normalizeTasks(rawData) {
    if (!Array.isArray(rawData)) {
        throw new Error('TASKS data must be an array');
    }
    
    return rawData.map((row, index) => {
        const id = sanitizeId(row.id || row.Id || row.ID || `T-${index + 1}`);
        const title = sanitizeText(row.title || row.Title || row.task || row.name || `Task ${index + 1}`);
        const owner = sanitizeId(row.owner || row.Owner || 'unassigned');
        const priority = sanitizePriority(row.priority || row.Priority || 'normal');
        const completed = sanitizeBoolean(row.completed || row.Completed);
        
        // Validate dates
        const startDate = sanitizeDate(row.start_date || row['start date'] || row.StartDate);
        const endDate = sanitizeDate(row.end_date || row['end date'] || row.EndDate);
        
        // Parse estimated_hours as explicit number - NO INFERENCE
        const estimatedHours = parseNumericField(
            row.estimated_hours || row['estimated hours'] || row.estimatedHours,
            8 // Default: 8 hours per task
        );
        
        return {
            id,
            name: title,
            jiraId: sanitizeText(row.jira || row.Jira || row.jira_id || row['jira id'] || ''),
            jiraUrl: sanitizeUrl(row.jira_url || row['jira url'] || row.jira_link || ''),
            owner,
            bu: sanitizeText(row.bu || row.BU || ''),
            status: sanitizeTaskStatus(row.status || row.Status || 'todo'),
            priority,
            startDate,
            endDate,
            type: sanitizeText(row.type || row.Type || ''),
            blockers: sanitizeText(row.blocker || row.blockers || row.Blocker || ''),
            notes: sanitizeText(row.notes || row.Notes || ''),
            completed,
            estimatedHours // EXPLICIT numeric field
        };
    }).filter(task => task.name && isValidDateRange(task.startDate, task.endDate));
}

/**
 * Sanitize task status to valid enum value
 */
function sanitizeTaskStatus(status) {
    const validStatuses = ['in-progress', 'todo', 'completed', 'blocked', 'review', 'pending'];
    const cleaned = String(status).toLowerCase().trim().replace(/\s+/g, '-');
    // Map common variations
    const statusMap = {
        'not-started': 'todo',
        'notstarted': 'todo',
        'in progress': 'in-progress',
        'inprogress': 'in-progress',
        'done': 'completed',
        'complete': 'completed',
        'in-review': 'review',
        'reviewing': 'review'
    };
    const mapped = statusMap[cleaned] || cleaned;
    return validStatuses.includes(mapped) ? mapped : 'todo';
}

/**
 * Additional sanitization helpers
 */
function sanitizePriority(priority) {
    const valid = ['urgent', 'normal', 'low'];
    const cleaned = String(priority).toLowerCase().trim();
    // Map common variations
    const priorityMap = {
        'high': 'urgent',
        'critical': 'urgent',
        'medium': 'normal',
        'pending': 'low'
    };
    const mapped = priorityMap[cleaned] || cleaned;
    return valid.includes(mapped) ? mapped : 'normal';
}

function sanitizeBoolean(value) {
    return String(value).toLowerCase().trim() === 'true';
}

function sanitizeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
}

function sanitizeUrl(url) {
    if (!url) return '';
    const cleaned = sanitizeText(url);
    // Basic URL validation
    try {
        if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('#')) {
            return cleaned;
        }
    } catch (e) {
        console.warn('Invalid URL:', url);
    }
    return '';
}

function isValidDateRange(startDate, endDate) {
    // Allow tasks without dates (they'll show as status-only in timeline)
    if (!startDate || !endDate) return true;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start <= end;
}

/**
 * Normalize MILESTONES data
 * DATA CONTRACT: MILESTONES sheet should have:
 *   - id (optional): Unique identifier, auto-generated if missing
 *   - date (required): Milestone target date
 *   - title (required): Milestone name
 *   - assignee (optional): Person responsible
 *   - status (optional): pending|in-progress|completed|blocked, defaults to 'pending'
 *   - description (optional): Milestone description
 *   - progress (optional): Completion percentage (NUMBER 0-100), defaults to 0
 */
function normalizeMilestones(rawData) {
    return rawData.map((row, index) => {
        const status = sanitizeMilestoneStatus(row.status || row.Status || 'pending');
        const progress = Math.min(100, Math.max(0, parseNumericField(
            row.progress || row.Progress,
            status === 'completed' ? 100 : 0 // Default: 100 if completed, 0 otherwise
        )));
        
        return {
            id: sanitizeId(row.id || row.Id || `milestone-${index}`),
            date: sanitizeDate(row.date || row.Date || ''),
            title: sanitizeText(row.title || row.Title || row.milestone || `Milestone ${index + 1}`),
            assignee: sanitizeText(row.owner || row.Owner || row.assignee || row.Assignee || ''),
            status, // EXPLICIT status field from sheet
            description: sanitizeText(row.description || row.Description || ''),
            progress // EXPLICIT progress field from sheet
        };
    }).filter(milestone => milestone.date && milestone.title);
}

/**
 * Sanitize milestone status to valid enum value
 */
function sanitizeMilestoneStatus(status) {
    const validStatuses = ['pending', 'in-progress', 'completed', 'blocked'];
    const cleaned = String(status).toLowerCase().trim().replace(/\s+/g, '-');
    // Map common variations
    const statusMap = {
        'not-started': 'pending',
        'notstarted': 'pending',
        'in progress': 'in-progress',
        'inprogress': 'in-progress',
        'done': 'completed',
        'complete': 'completed',
        'upcoming': 'pending'
    };
    const mapped = statusMap[cleaned] || cleaned;
    return validStatuses.includes(mapped) ? mapped : 'pending';
}

/**
 * Main data loading function
 */
async function loadAllData() {
    try {
        console.log('🚀 Starting data load...');
        // Load from Google Sheets (real-time collaboration!)
        await loadFromGoogleSheets();
        
        console.log('✅ Data loaded from sheets:', {
            project: appData.project,
            teamMembers: appData.teamMembers?.length,
            tasks: appData.tasks?.length,
            milestones: appData.milestones?.length
        });
        
        validateData();
        
        appData.loaded = true;
        appData.error = null;
        
        console.log('✅ Data loaded successfully:', appData);
        return true;
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        appData.error = error.message;
        appData.loaded = false;
        
        // Show error to user
        showError(error.message);
        
        // Load fallback demo data
        loadFallbackData();
        
        // Still try to render with fallback data
        if (typeof renderAll === 'function') {
            renderAll();
        }
        
        return false;
    }
}

/**
 * Validate loaded data against DATA_CONTRACT
 * Surfaces user-visible errors via toast notifications for missing required fields
 */
function validateData() {
    const errors = [];
    const warnings = [];
    
    // SPRINT_CONFIG validation
    if (!appData.project || !appData.project.name) {
        errors.push('Missing sprint_name in SPRINT_CONFIG sheet');
    }
    if (!appData.project || !appData.project.startDate || !appData.project.endDate) {
        errors.push('Missing start_date or end_date in SPRINT_CONFIG sheet');
    }
    
    // MEMBERS validation - check required fields per DATA_CONTRACT
    if (!appData.teamMembers || appData.teamMembers.length === 0) {
        errors.push('No team members found in MEMBERS sheet');
    } else {
        appData.teamMembers.forEach((member, index) => {
            if (!member.id) {
                warnings.push(`Member #${index + 1} missing required field: id`);
            }
            if (!member.name) {
                errors.push(`Member #${index + 1} missing required field: name`);
            }
        });
    }
    
    // TASKS validation - check required fields per DATA_CONTRACT
    if (!appData.tasks || appData.tasks.length === 0) {
        warnings.push('No tasks found in TASKS sheet');
    } else {
        appData.tasks.forEach((task, index) => {
            if (!task.id) {
                warnings.push(`Task #${index + 1} missing required field: id`);
            }
            if (!task.name) {
                errors.push(`Task #${index + 1} missing required field: name`);
            }
            if (!task.owner) {
                warnings.push(`Task "${task.name || index + 1}" missing required field: owner`);
            }
            // start_date and end_date are already validated in normalizeTasks
        });
    }
    
    // MILESTONES validation - check required fields per DATA_CONTRACT
    if (appData.milestones && appData.milestones.length > 0) {
        appData.milestones.forEach((milestone, index) => {
            if (!milestone.date) {
                warnings.push(`Milestone "${milestone.title || index + 1}" missing required field: date`);
            }
            if (!milestone.title) {
                warnings.push(`Milestone #${index + 1} missing required field: title`);
            }
        });
    }
    
    // Surface warnings via toast (non-blocking)
    if (warnings.length > 0 && typeof showToast === 'function') {
        showToast(`Warning: ${warnings.length} data warning(s) detected. Check console for details.`, 'warning', 5000);
        console.warn('Data validation warnings:\n• ' + warnings.join('\n• '));
    }
    
    // Throw error for critical issues
    if (errors.length > 0) {
        throw new Error('Data validation failed:\n❌ ' + errors.join('\n❌ '));
    }
}

/**
 * Load fallback demo data
 * Uses ONLY fields defined in DATA_CONTRACT - no inferred data
 */
function loadFallbackData() {
    console.warn('⚠️ Using fallback demo data. Configure your Google Sheet!');
    
    // Use current month as default range
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    appData.project = {
        name: "Demo Sprint (Setup Required)",
        startDate: startOfMonth.toISOString().split('T')[0],
        endDate: endOfMonth.toISOString().split('T')[0],
        preparedBy: "System"
    };
    
    console.log('📅 Date range:', appData.project.startDate, 'to', appData.project.endDate);
    
    // MEMBERS - using ONLY fields from DATA_CONTRACT
    appData.teamMembers = [
        {
            id: "avi",
            name: "Avi Gupta",
            role: "Software Engineer",
            colorClass: "primary",
            capacity: "100%",
            focus: "Setup Google Sheets",
            bandwidthHours: 40 // EXPLICIT field from DATA_CONTRACT
        }
    ];
    
    // Generate demo tasks with dates spread across the month
    const monthStart = new Date(appData.project.startDate);
    const getDemoDate = (dayOffset) => {
        const date = new Date(monthStart);
        date.setDate(date.getDate() + dayOffset);
        return date.toISOString().split('T')[0];
    };
    
    appData.tasks = [
        {
            id: "setup-1",
            name: "Create Google Sheet with 4 tabs",
            jiraId: "",
            jiraUrl: "",
            owner: "avi",
            bu: "Setup",
            status: "Pending",
            priority: "urgent",
            startDate: getDemoDate(0),
            endDate: getDemoDate(2),
            type: "Configuration",
            blockers: "",
            notes: "Create tabs: SPRINT_CONFIG, MEMBERS, TASKS, MILESTONES",
            completed: false
        },
        {
            id: "setup-2",
            name: "Share Google Sheet publicly",
            jiraId: "",
            jiraUrl: "",
            owner: "avi",
            bu: "Setup",
            status: "Pending",
            priority: "urgent",
            startDate: getDemoDate(3),
            endDate: getDemoDate(5),
            type: "Configuration",
            blockers: "",
            notes: "Share → Anyone with link can VIEW",
            completed: false
        },
        {
            id: "setup-3",
            name: "Add Google Sheet ID to dataLoader.js",
            jiraId: "",
            jiraUrl: "",
            owner: "avi",
            bu: "Setup",
            status: "Pending",
            priority: "urgent",
            startDate: getDemoDate(6),
            endDate: getDemoDate(10),
            type: "Configuration",
            blockers: "",
            notes: "Copy Sheet ID from URL and paste in config",
            completed: false
        },
        {
            id: "demo-4",
            name: "Example Task - Development Phase",
            jiraId: "DEMO-101",
            jiraUrl: "#",
            owner: "neha",
            bu: "Development",
            status: "In Progress",
            priority: "normal",
            startDate: getDemoDate(7),
            endDate: getDemoDate(14),
            type: "Development",
            blockers: "",
            notes: "Sample multi-day task spanning 2 weeks",
            completed: false
        },
        {
            id: "demo-5",
            name: "Example Task - Review & Testing",
            jiraId: "DEMO-102",
            jiraUrl: "#",
            owner: "both",
            bu: "QA",
            status: "Pending",
            priority: "normal",
            startDate: getDemoDate(15),
            endDate: getDemoDate(20),
            type: "Testing",
            blockers: "",
            notes: "Cross-team collaboration task",
            completed: false
        }
    ];
    
    appData.milestones = [
        {
            id: "setup-m1",
            date: getDemoDate(0),
            title: "Sprint Kickoff",
            assignee: "Team"
        },
        {
            id: "demo-m2",
            date: getDemoDate(7),
            title: "Mid-Sprint Review",
            assignee: "PM"
        },
        {
            id: "demo-m3",
            date: getDemoDate(14),
            title: "Development Complete",
            assignee: "Dev Team"
        },
        {
            id: "demo-m4",
            date: getDemoDate(20),
            title: "QA Sign-off",
            assignee: "QA Team"
        },
        {
            id: "demo-m5",
            date: endOfMonth.toISOString().split('T')[0],
            title: "Sprint End & Demo",
            assignee: "All"
        }
    ];
    
    appData.loaded = true;
}

/**
 * Refresh data
 */
async function refreshData() {
    showLoadingIndicator();
    const success = await loadAllData();
    
    if (success && typeof renderAll === 'function') {
        renderAll();
    }
    
    // Hide loading indicator after rendering completes
    setTimeout(() => {
        hideLoadingIndicator();
    }, 300);
    
    return success;
}

/**
 * Get filtered tasks
 */
function getFilteredTasks() {
    if (typeof filters !== 'undefined') {
        return appData.tasks.filter(task => {
            if (filters.hideCompleted && task.completed) return false;
            if (filters.owner !== 'all' && task.owner !== filters.owner && task.owner !== 'both') return false;
            if (filters.status !== 'all' && !task.status.toLowerCase().includes(filters.status.toLowerCase())) return false;
            if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
            if (filters.search && !task.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
            return true;
        });
    }
    return appData.tasks;
}

/**
 * Get team member by ID
 */
function getTeamMember(id) {
    return appData.teamMembers.find(m => m.id === id);
}

/**
 * Export current data as JSON
 */
function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sprint-tracker-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

/**
 * Show loading indicator
 */
function showLoadingIndicator() {
    const container = document.querySelector('.container');
    if (container && !document.getElementById('loading-indicator')) {
        container.insertAdjacentHTML('afterbegin', `
            <div id="loading-indicator" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;">
                <div style="background:white;padding:30px;border-radius:12px;text-align:center;max-width:400px;">
                    <div style="font-size:3rem;margin-bottom:15px;">📊</div>
                    <h2 style="margin-bottom:10px;color:#1e293b;">Loading from Google Sheets</h2>
                    <p style="color:#64748b;margin-bottom:20px;">Fetching latest sprint data...</p>
                    <div style="width:100%;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;">
                        <div style="width:60%;height:100%;background:linear-gradient(90deg,#10b981,#059669);animation:loading 1.5s infinite;"></div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(250%); }
                }
            </style>
        `);
    }
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.remove();
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.querySelector('.container');
    if (container) {
        const existingError = document.getElementById('data-error');
        if (existingError) existingError.remove();
        
        container.insertAdjacentHTML('afterbegin', `
            <div id="data-error" style="background:#fef3c7;border-left:4px solid #f59e0b;padding:20px;margin:20px 30px;border-radius:8px;">
                <h3 style="color:#92400e;margin-bottom:12px;">☁️ Google Sheets Setup Required</h3>
                <p style="color:#78350f;margin-bottom:12px;line-height:1.6;">${message}</p>
                <div style="background:white;padding:15px;border-radius:6px;margin:15px 0;">
                    <p style="color:#1e293b;font-weight:600;margin-bottom:10px;">📋 Quick Setup (No Login Required!):</p>
                    <ol style="color:#475569;margin-left:20px;line-height:1.8;">
                        <li>Create a Google Sheet</li>
                        <li>Add 4 tabs: <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">SPRINT_CONFIG</code>, <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">MEMBERS</code>, <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">TASKS</code>, <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">MILESTONES</code></li>
                        <li>Click <strong>Share</strong> → Change to "Anyone with the link" → <strong>Viewer</strong></li>
                        <li>Copy Sheet ID from URL: <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit</code></li>
                        <li>Add to <code style="background:#f1f5f9;padding:2px 4px;border-radius:3px;">dataLoader.js</code> line 18</li>
                    </ol>
                </div>
                <p style="color:#78350f;font-size:0.9rem;margin-top:12px;">
                    📚 <strong>Need help?</strong> See <code style="background:#f59e0b;color:white;padding:2px 6px;border-radius:3px;">README.md</code> for detailed guide
                </p>
                <button onclick="refreshData()" style="margin-top:15px;padding:10px 20px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
                    🔄 Retry After Setup
                </button>
            </div>
        `);
    }
}

// =============================================
// AUTO-INITIALIZE ON PAGE LOAD
// =============================================
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        showLoadingIndicator();
        const success = await loadAllData();
        
        // Render the UI after data loads
        if (success && typeof renderAll === 'function') {
            renderAll();
        }
        
        // Hide loading indicator after rendering completes
        // Small delay to ensure DOM updates are visible
        setTimeout(() => {
            hideLoadingIndicator();
        }, 300);
    });
    
    // Expose functions globally for HTML button access
    window.refreshData = refreshData;
    window.exportData = exportData;
}
