// ===== Splitter (Resizable Panel) =====

export function initSplitter() {
    const splitter = document.getElementById('splitter');
    const treePanel = document.getElementById('folder-tree');
    let isResizing = false;

    splitter.addEventListener('mousedown', (e) => {
        isResizing = true;
        splitter.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(150, Math.min(600, e.clientX));
        treePanel.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        splitter.classList.remove('active');
    });
}
