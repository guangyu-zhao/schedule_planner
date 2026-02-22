export const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#DDA0DD', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#6DBAAF', '#E8836B', '#7FB3D8',
    '#E056A0', '#00CEC9', '#FD79A8', '#55E6C1',
    '#FDA7DF', '#74B9FF', '#A3CB38', '#D980FA',
];

export const CATEGORY_ICONS = { '工作': '💼', '学习': '📚', '个人': '👤', '运动': '🏃', '其他': '📌' };
export const CATEGORY_COLORS = { '工作': '#6c5ce7', '学习': '#00b894', '个人': '#0984e3', '运动': '#e17055', '其他': '#b2bec3' };
export const PRIORITY_COLORS = { 1: '#e74c3c', 2: '#fdcb6e', 3: '#00b894' };
export const SLOT_HEIGHT = 28;
export const TOTAL_SLOTS = 48;
export const RING_CIRCUMFERENCE = 2 * Math.PI * 126;
export const MIN_EVENT_SLOTS = 1;

export function getCategoryLabel(dbValue) {
    const map = { '工作': 'category.work', '学习': 'category.study', '个人': 'category.personal', '运动': 'category.exercise', '其他': 'category.other' };
    return window.I18n && window.I18n.t ? window.I18n.t(map[dbValue] || 'category.other') : dbValue;
}

export function getPriorityLabel(p) {
    const map = { 1: 'priority.high', 2: 'priority.medium', 3: 'priority.low' };
    return window.I18n && window.I18n.t ? window.I18n.t(map[p] || 'priority.medium') : String(p);
}
