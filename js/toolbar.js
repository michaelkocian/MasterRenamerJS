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

export function initToolbar() {
    cacheElements();
    bindToolbarButtons();
    bindSearchPanel();
    bindSelectors();
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
    document.getElementById('btn-compare')
        .addEventListener('click', handleCompare);
    document.getElementById('btn-save')
        .addEventListener('click', handleSave);
    document.getElementById('btn-theme')
        .addEventListener('click', toggleTheme);
}

function bindSearchPanel() {
    findInput.addEventListener('input', handleSearchInput);
    replaceInput.addEventListener('input', handleSearchInput);
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

async function handleOpenFolder() {
    setStatusMessage('Opening folder...');
    const handle = await openFolderPicker();
    if (handle) {
        renderTree();
        refilterFiles();
        renderEditor();
        setStatusMessage(`Opened: ${handle.name}`);
    } else {
        setStatusMessage('Ready — Open a folder to begin');
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
        setStatusMessage('Invalid regex pattern');
        return;
    }

    applyRegexResults(result);
    setStatusMessage(`Regex applied: ${result.matchCount} file(s) matched`);
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
    setStatusMessage('All changes undone');
}

function handleCompare() {
    const changes = getChangedFiles();
    if (changes.length === 0) {
        setStatusMessage('No changes to compare');
        return;
    }
    openCompareDialog(() => performSave());
}

async function handleSave() {
    const changes = getChangedFiles();
    if (changes.length === 0) {
        setStatusMessage('No changes to save');
        return;
    }
    openCompareDialog(() => performSave());
}

async function performSave() {
    setStatusMessage('Renaming files...');

    const result = await executeRenames((current, total, change, ok) => {
        const status = ok ? '✓' : '✗';
        setStatusMessage(`${status} ${current}/${total}: ${change.oldName} → ${change.newName}`);
    });

    renderEditor();
    const msg = `Done: ${result.success} renamed, ${result.failed} failed`;
    setStatusMessage(msg);
}

function setStatusMessage(msg) {
    document.getElementById('status-message').textContent = msg;
}
