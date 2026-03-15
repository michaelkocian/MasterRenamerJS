// ===== Theme Toggle =====

const STORAGE_KEY = 'master-renamer-theme';

export function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        applyTheme(saved);
    }
    updateButtonIcon();
}

export function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveThemePreference(next);
    updateButtonIcon();
}

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function saveThemePreference(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
}

function updateButtonIcon() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    btn.textContent = getCurrentTheme() === 'dark' ? '☀️' : '🌙';
}
