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

    if (window.I18n) {
        if (window.I18n.applyTranslations) window.I18n.applyTranslations();
        if (window.I18n.t) {
            document.title = window.I18n.t('app.title');
            if (window.timer) window.timer.originalTitle = document.title;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;
        const id = activePage.id;
        if (id === 'schedulePage' && window.planner) {
            window.planner.fetchEvents();
        } else if (id === 'timerPage' && window.timer) {
            window.timer.fetchRecords();
            window.timer.fetchStats();
        } else if (id === 'statsPage' && window.stats) {
            window.stats.loadData();
        }
    });

    window.addEventListener('online', () => {
        document.getElementById('offlineBanner')?.classList.remove('active');
        if (window.planner) window.planner.fetchEvents();
    });
    window.addEventListener('offline', () => {
        document.getElementById('offlineBanner')?.classList.add('active');
    });
});
