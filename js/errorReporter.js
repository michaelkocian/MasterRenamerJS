// ===== Error Reporting =====
const recentToastTimestamps = new Map();
const TOAST_DEDUPE_MS = 2500;

export function installGlobalErrorHandlers() {
    window.addEventListener('error', event => {
        if (!event.message) return;
        reportError(event.message, event.error, { consoleOnlyIfDuplicate: true });
    });

    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        const message = reason instanceof Error
            ? reason.message
            : String(reason || 'Unhandled promise rejection');
        reportError(message, reason, { consoleOnlyIfDuplicate: true });
    });
}

export function reportError(message, error, options = {}) {
    const shouldToast = shouldShowToast(message);
    if (shouldToast) {
        showToastMessage(message, 6000, 'toast-error');
    }

    if (!options.consoleOnlyIfDuplicate || !shouldToast) {
        console.error(message, error || '');
    }
}

export function reportWarning(message, error, options = {}) {
    const shouldToast = shouldShowToast(message);
    if (shouldToast) {
        showToastMessage(message, options.duration || 5000, 'toast-warning');
    }

    if (!options.consoleOnlyIfDuplicate || !shouldToast) {
        console.warn(message, error || '');
    }
}

function shouldShowToast(message) {
    const now = Date.now();
    const previous = recentToastTimestamps.get(message) || 0;
    recentToastTimestamps.set(message, now);
    return now - previous > TOAST_DEDUPE_MS;
}

function showToastMessage(message, duration, className) {
    if (window.showToast) {
        window.showToast(escapeHtml(message), duration, className);
    }
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}