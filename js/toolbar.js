// ===== Toolbar Module =====
import { getState, setPathMode, setDisplayMode, setFileScope, setSortOrder, resetAllNames, getChangedFiles, saveHistorySnapshot } from './state.js';
import { openFolderPicker } from './fileSystem.js';
import { applyRegexRename, isValidRegex } from './regexRename.js';
import { renderEditor, setSearchHighlight, getSearchMatchCount } from './editor.js';
import { refilterFiles } from './folderTree.js';
import { openCompareDialog } from './compareDialog.js';
import { executeRenames } from './renamer.js';
import { openActiveTextFileFromRenameEditor, isTextEditorOpen } from './textFileEditor.js';
import { toggleTheme } from './theme.js';
import { getBlockingRenameIssues } from './renameDiagnostics.js';

let findInput = null;
let replaceInput = null;
let regexModeCheckbox = null;
let caseSensitiveCheckbox = null;
let searchMatchInfo = null;
let searchPanel = null;
// Alt key quick switch for sel-display-mode
let prevDisplayMode = null;
let altPressed = false;
let displayModeSelect = null;

export function initToolbar() {
    cacheElements();
    bindToolbarButtons();
    bindSearchPanel();
    bindSelectors();
    bindAltDisplayModeSwitch();
}

function bindAltDisplayModeSwitch() {
    displayModeSelect = document.getElementById('sel-display-mode');
    window.addEventListener('keydown', handleAltDisplayModeKeyDown);
    window.addEventListener('keyup', handleAltDisplayModeKeyUp);
}


function cacheElements() {
    findInput = document.getElementById('regex-find');
    replaceInput = document.getElementById('regex-replace');
    regexModeCheckbox = document.getElementById('chk-regex-mode');
    caseSensitiveCheckbox = document.getElementById('chk-case-sensitive');
    searchMatchInfo = document.getElementById('search-match-info');
    searchPanel = document.getElementById('search-panel');
}

function bindToolbarButtons() {
    document.getElementById('btn-open-folder')
        .addEventListener('click', handleOpenFolder);
    document.getElementById('btn-search-toggle')
        .addEventListener('click', toggleSearchPanel);
    document.getElementById('btn-open-text-editor')
        .addEventListener('click', openActiveTextFileFromRenameEditor);
    document.getElementById('btn-undo-all')
        .addEventListener('click', handleUndoAll);
    document.getElementById('btn-save')
        .addEventListener('click', handleSave);
    document.getElementById('btn-theme')
        .addEventListener('click', toggleTheme);
}

function bindSearchPanel() {
    findInput.addEventListener('input', handleSearchInput);
    findInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    replaceInput.addEventListener('input', handleSearchInput);
    replaceInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    regexModeCheckbox.addEventListener('change', handleSearchInput);
    caseSensitiveCheckbox.addEventListener('change', handleSearchInput);

    document.getElementById('btn-apply-regex')
        .addEventListener('click', handleApplyRegex);
    document.getElementById('btn-clear-regex')
        .addEventListener('click', handleClearSearch);
}

function bindSelectors() {
    document.getElementById('sel-path-mode')
        .addEventListener('change', e => handlePathModeChange(e.target.value));
    document.getElementById('sel-display-mode')
        .addEventListener('change', e => handleDisplayModeChange(e.target.value));
    document.getElementById('sel-file-scope')
        .addEventListener('change', e => handleFileScopeChange(e.target.value));
    document.getElementById('sel-sort-order')
        .addEventListener('change', e => handleSortOrderChange(e.target.value));
}

// ===== Handlers =====

function handleAltDisplayModeKeyDown(e) {
    if (isTextEditorOpen()) return;
    if (e.altKey && !altPressed) {
        e.preventDefault();
        altPressed = true;
        prevDisplayMode = displayModeSelect.value;
        if (prevDisplayMode !== 'old') {
            displayModeSelect.value = 'old';
            displayModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

function handleAltDisplayModeKeyUp(e) {
    if (isTextEditorOpen()) return;
    if (!e.altKey && altPressed) {
        e.preventDefault();
        altPressed = false;
        if (prevDisplayMode && displayModeSelect.value === 'old') {
            displayModeSelect.value = prevDisplayMode;
            displayModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        prevDisplayMode = null;
    }
}

async function handleOpenFolder() {
    const handle = await openFolderPicker();
    if (handle) {
        const welcomeModal = document.getElementById('welcome-modal');
        if (welcomeModal) welcomeModal.classList.add('hidden');
        showStatusToast(`Loading: ${handle.name}`);
    }
}

function toggleSearchPanel() {
    searchPanel.classList.toggle('hidden');
    if (!searchPanel.classList.contains('hidden')) {
        findInput.focus();
    } else {
        clearSearchHighlight();
    }
}

function handlePathModeChange(mode) {
    setPathMode(mode);
    renderEditor();
}

function handleDisplayModeChange(mode) {
    setDisplayMode(mode);
    renderEditor();
}

function handleFileScopeChange(scope) {
    setFileScope(scope);
    refilterFiles();
    renderEditor();
}

function handleSortOrderChange(order) {
    setSortOrder(order);
    refilterFiles();
    renderEditor();
}

function handleSearchInput() {
    const pattern = findInput.value;
    const isRegex = regexModeCheckbox.checked;
    const caseSensitive = caseSensitiveCheckbox.checked;

    if (!pattern) {
        clearSearchHighlight();
        return;
    }

    if (isRegex && !isValidRegex(pattern)) {
        findInput.classList.add('invalid');
        searchMatchInfo.textContent = 'Invalid regex';
        return;
    }

    findInput.classList.remove('invalid');
    updateSearchHighlight(pattern, isRegex, caseSensitive);
}

function updateSearchHighlight(pattern, isRegex, caseSensitive) {
    try {
        const flags = caseSensitive ? 'g' : 'gi';
        const escaped = isRegex ? pattern : escapeRegex(pattern);
        const regex = new RegExp(escaped, flags);

        setSearchHighlight(regex);
        renderEditor();
        const count = getSearchMatchCount();
        searchMatchInfo.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
    } catch {
        findInput.classList.add('invalid');
    }
}

function clearSearchHighlight() {
    setSearchHighlight(null);
    searchMatchInfo.textContent = '';
    findInput.classList.remove('invalid');
    renderEditor();
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handleApplyRegex() {
    const pattern = findInput.value;
    const replacement = replaceInput.value;
    const isRegex = regexModeCheckbox.checked;
    const caseSensitive = caseSensitiveCheckbox.checked;

    if (!pattern) return;

    const result = applyRegexRename(pattern, replacement, isRegex, caseSensitive);
    if (!result) {
        showStatusToast('Invalid regex pattern', 3000, 'toast-error');
        return;
    }

    applyRegexResults(result);
    showStatusToast(`Regex applied: ${result.matchCount} file(s) matched`);
}

function applyRegexResults(result) {
    const state = getState();
    const changed = result.updatedNames.some((name, index) => name !== state.currentNames[index]);
    if (!changed) return;

    saveHistorySnapshot();
    for (let i = 0; i < result.updatedNames.length; i++) {
        state.currentNames[i] = result.updatedNames[i];
    }
    renderEditor();
}

function handleClearSearch() {
    findInput.value = '';
    replaceInput.value = '';
    clearSearchHighlight();
}

function handleUndoAll() {
    resetAllNames();
    renderEditor();
    showStatusToast('All changes undone');
}

async function handleSave() {
    const changes = getChangedFiles();
    if (changes.length === 0) {
        showStatusToast('No changes to save', 3000, 'toast-error');
        return;
    }

    const blockingIssues = getBlockingRenameIssues();
    if (blockingIssues.length > 0) {
        const names = blockingIssues.map(issue => `${issue.targetPath} - ${issue.problems.join(', ')}`).join('\n');
        showStatusToast(
            `Cannot save - fix these target names first:<br><span style='font-size:0.95em;white-space:pre-line;'>${names}</span>`,
            6000,
            'toast-error'
        );
        return;
    }

    openCompareDialog(() => performSave());
}

async function performSave() {
    showStatusToast('Renaming files...');

    const result = await executeRenames((current, total, change, ok) => {
        const status = ok ? '✓' : '✗';
        showStatusToast(`${status} ${current}/${total}: ${change.oldName} → ${change.newName}`);
    });

    renderEditor();
    const msg = `Done: ${result.success} renamed, ${result.failed} failed`;
    showStatusToast(msg);
}
function showStatusToast(msg, duration = 3000, className = '') {
    if (window.showToast) 
    {
        window.showToast(msg, duration, className);
    }
}
