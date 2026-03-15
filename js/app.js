// ===== Application Entry Point =====
import { initEditor, setupScrollSync } from './editor.js';
import { initFolderTree } from './folderTree.js';
import { initToolbar } from './toolbar.js';
import { initCompareDialog } from './compareDialog.js';
import { initTheme } from './theme.js';
import { initSplitter } from './splitter.js';

function bootstrap() {
    initTheme();
    initFolderTree();
    initEditor();
    initToolbar();
    initCompareDialog();
    initSplitter();
    setupScrollSync();
}

document.addEventListener('DOMContentLoaded', bootstrap);
