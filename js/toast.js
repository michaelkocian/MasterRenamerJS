// toast.js - Toast notification logic
export function showToast(message, duration = 3000, className = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Remove any existing toasts
    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    if (className) toast.classList.add(className);
    toast.innerHTML = message;
    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Animate out after duration
    setTimeout(() => {
        toast.classList.remove('show');
        // Remove from DOM after fade out
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 500);
    }, duration);
}
