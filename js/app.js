window.showToast = showToast;
import { showToast } from './toast.js';
// ===== Application Entry Point =====
import { initEditor, setupScrollSync } from './editor.js';
import { initFolderTree } from './folderTree.js';
import { initToolbar } from './toolbar.js';
import { initCompareDialog } from './compareDialog.js';
import { initTheme } from './theme.js';
import { initSplitter } from './splitter.js';
import { openFolderPicker } from './fileSystem.js';
import { renderTree, refilterFiles } from './folderTree.js';
import { renderEditor } from './editor.js';

function bootstrap() {
    initTheme();
    initFolderTree();
    initEditor();
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
            renderTree();
            refilterFiles();
            renderEditor();
            showToast(`Opened: ${handle.name}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
