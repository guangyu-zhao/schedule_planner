import { PlannerApp } from './planner.js';
import { TimerManager } from './timer.js';
import { StatisticsManager } from './stats.js';

function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.page + 'Page').classList.add('active');
            if (tab.dataset.page === 'stats' && window.stats) window.stats.onTabActive();
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    window.planner = new PlannerApp();
    window.timer = new TimerManager();
    window.stats = new StatisticsManager();
});
