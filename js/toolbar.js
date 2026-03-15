// ===== Toolbar Module =====
import { getState, setPathMode, setDisplayMode, setFileScope, setSortOrder, resetAllNames, getChangedFiles } from './state.js';
import { openFolderPicker } from './fileSystem.js';
import { applyRegexRename, isValidRegex } from './regexRename.js';
import { renderEditor, setSearchHighlight, getSearchMatchCount } from './editor.js';
import { renderTree, refilterFiles } from './folderTree.js';
import { openCompareDialog } from './compareDialog.js';
import { executeRenames } from './renamer.js';
import { toggleTheme } from './theme.js';

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
    showStatusToast('Opening folder...');
    const handle = await openFolderPicker();
    if (handle) {
        const welcomeModal = document.getElementById('welcome-modal');
        if (welcomeModal) welcomeModal.classList.add('hidden');
        renderTree();
        refilterFiles();
        renderEditor();
        showStatusToast(`Opened: ${handle.name}`);
    } else {
        showStatusToast('Ready — Open a folder to begin');
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

    const duplicates = findDuplicatePaths();
    if (duplicates.length > 0) {
        const names = duplicates.map(d => d.path).join('\n');
        showStatusToast(
            `Cannot save — the following paths would conflict:<br><span style='font-size:0.95em;white-space:pre-line;'>${names}</span>`,
            6000,
            'toast-error'
        );
        return;
    }

    openCompareDialog(() => performSave());
}

function findDuplicatePaths() {
    const state = getState();
    const seen = new Map();
    const duplicates = [];

    for (let i = 0; i < state.allFiles.length; i++) {
        const file = state.allFiles[i];
        const currentName = state.currentNames[i];
        const lastSlash = file.path.lastIndexOf('/');
        const fullPath = lastSlash === -1
            ? currentName
            : file.path.substring(0, lastSlash + 1) + currentName;

        if (seen.has(fullPath)) {
            duplicates.push({ path: fullPath, indices: [seen.get(fullPath), i] });
        } else {
            seen.set(fullPath, i);
        }
    }

    return duplicates;
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
