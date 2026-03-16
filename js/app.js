window.showToast = showToast;
import { showToast } from './toast.js';
// ===== Application Entry Point =====
import { installGlobalErrorHandlers } from './errorReporter.js';
import { initEditor, setupScrollSync } from './editor.js';
import { initFolderTree } from './folderTree.js';
import { initLoadingPanel } from './loadingPanel.js';
import { initTextFileEditor, openStandaloneTextEditor } from './textFileEditor.js';
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
    initTextFileEditor();
    initToolbar();
    initCompareDialog();
    initSplitter();
    setupScrollSync();
    initWelcomeModal();
}

function initWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    const openBtn = document.getElementById('btn-welcome-open');
    const openEditorBtn = document.getElementById('btn-welcome-editor');
    if (!modal || !openBtn || !openEditorBtn) return;

    openBtn.addEventListener('click', async () => {
        const handle = await openFolderPicker();
        if (handle) {
            modal.classList.add('hidden');
            showToast(`Loading: ${handle.name}`);
        }
    });

    openEditorBtn.addEventListener('click', async () => {
        modal.classList.add('hidden');
        await openStandaloneTextEditor();
    });

    document.addEventListener('paste', async event => {
        if (modal.classList.contains('hidden')) return;

        const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
        if (!text) return;

        event.preventDefault();
        modal.classList.add('hidden');
        await openStandaloneTextEditor(text, 'pasted-text.txt');
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
