// =============================================
// FINDMYBANDWIDTH - CENTRALIZED CONSTANTS
// Single source of truth for all application configuration
// =============================================

/**
 * DATA CONTRACT - Canonical Schema
 * These are the ONLY fields the UI should reference.
 * Any field not in this contract should be rejected at normalization.
 */
const DATA_CONTRACT = {
    MEMBERS: {
        required: ['id', 'name'],
        optional: ['role', 'color_class', 'capacity', 'focus', 'bandwidth_hours'],
        defaults: {
            role: 'Team Member',
            color_class: 'primary',
            capacity: '100%',
            focus: 'Sprint work',
            bandwidth_hours: 40
        }
    },
    TASKS: {
        required: ['id', 'name', 'owner', 'start_date', 'end_date'],
        optional: ['jira_id', 'jira_url', 'bu', 'status', 'priority', 'type', 'blockers', 'notes', 'completed', 'estimated_hours'],
        defaults: {
            status: 'todo',
            priority: 'normal',
            completed: false,
            estimated_hours: 8
        }
    },
    MILESTONES: {
        required: ['id', 'date', 'title'],
        optional: ['assignee', 'status', 'description', 'progress'],
        defaults: {
            status: 'pending',
            progress: 0
        }
    },
    SPRINT_CONFIG: {
        required: ['name', 'start_date', 'end_date'],
        optional: ['prepared_by'],
        defaults: {
            prepared_by: 'Unknown'
        }
    }
};

/**
 * Valid Status Values - Whitelist for XSS prevention
 */
const TASK_STATUSES = Object.freeze({
    IN_PROGRESS: 'in-progress',
    TODO: 'todo',
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    REVIEW: 'review',
    PENDING: 'pending'
});

const MILESTONE_STATUSES = Object.freeze({
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    BLOCKED: 'blocked'
});

const PRIORITY_LEVELS = Object.freeze({
    URGENT: 'urgent',
    NORMAL: 'normal',
    LOW: 'low'
});

const VALID_TASK_STATUS_LIST = Object.values(TASK_STATUSES);
const VALID_MILESTONE_STATUS_LIST = Object.values(MILESTONE_STATUSES);
const VALID_PRIORITY_LIST = Object.values(PRIORITY_LEVELS);

/**
 * UI Configuration
 */
const UI_CONFIG = Object.freeze({
    // Responsive breakpoint - single source of truth
    MOBILE_BREAKPOINT: 768,
    
    // Animation durations (ms)
    ANIMATION_FAST: 150,
    ANIMATION_NORMAL: 300,
    ANIMATION_SLOW: 500,
    
    // Debounce delays (ms)
    DEBOUNCE_SEARCH: 200,
    DEBOUNCE_FILTER: 300,
    
    // Limits
    MAX_TASKS_PER_STATUS_MOBILE: 5,
    MAX_SEARCH_RESULTS: 20,
    MAX_TEXT_LENGTH: 500,
    
    // Work week
    HOURS_PER_WEEK: 40,
    WORK_DAYS_PER_WEEK: 5
});

/**
 * Color Classes - Valid CSS color class names
 */
const COLOR_CLASSES = Object.freeze(['primary', 'success', 'warning', 'info', 'danger']);

/**
 * SVG Icons - Accessible icon definitions
 * Each icon includes viewBox and path for consistent rendering
 */
const SVG_ICONS = Object.freeze({
    dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    team: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
    tasks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
    milestone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    blocked: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`,
    external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`
});

/**
 * Status Display Configuration
 */
const STATUS_CONFIG = Object.freeze({
    'in-progress': { label: 'On the Hunt', color: '#3a86a8', icon: 'clock' },
    'todo': { label: 'Awaiting', color: '#8d7660', icon: 'tasks' },
    'completed': { label: 'Conquered', color: '#2d6a4f', icon: 'check' },
    'blocked': { label: 'Trapped', color: '#c1440e', icon: 'blocked' },
    'review': { label: 'Under Watch', color: '#8d6e63', icon: 'search' },
    'pending': { label: 'Resting', color: '#e6a817', icon: 'clock' }
});

/**
 * Priority Display Configuration
 */
const PRIORITY_CONFIG = Object.freeze({
    'urgent': { label: 'Critical', color: '#c1440e', weight: 3 },
    'normal': { label: 'Steady', color: '#3a86a8', weight: 2 },
    'low': { label: 'Patrol', color: '#8d7660', weight: 1 }
});

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DATA_CONTRACT,
        TASK_STATUSES,
        MILESTONE_STATUSES,
        PRIORITY_LEVELS,
        VALID_TASK_STATUS_LIST,
        VALID_MILESTONE_STATUS_LIST,
        VALID_PRIORITY_LIST,
        UI_CONFIG,
        COLOR_CLASSES,
        SVG_ICONS,
        STATUS_CONFIG,
        PRIORITY_CONFIG
    };
}
