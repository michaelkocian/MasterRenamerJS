window.showToast = showToast;
import { showToast } from './toast.js';
// ===== Application Entry Point =====
import { installGlobalErrorHandlers } from './errorReporter.js';
import { initEditor, setupScrollSync } from './editor.js';
import { initFolderTree } from './folderTree.js';
import { initLoadingPanel } from './loadingPanel.js';
import { initToolbar } from './toolbar.js';
import { initCompareDialog } from './compareDialog.js';
import { initTheme } from './theme.js';
import { initSplitter } from './splitter.js';
import { openFolderPicker } from './fileSystem.js';

function bootstrap() {
    installGlobalErrorHandlers();
    initTheme();
    initFolderTree();
    initEditor();
    initLoadingPanel();
    initToolbar();
    initCompareDialog();
    initSplitter();
    setupScrollSync();
    initWelcomeModal();
}

function initWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    const openBtn = document.getElementById('btn-welcome-open');
    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', async () => {
        const handle = await openFolderPicker();
        if (handle) {
            modal.classList.add('hidden');
            showToast(`Loading: ${handle.name}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
