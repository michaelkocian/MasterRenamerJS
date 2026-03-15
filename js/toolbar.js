// ===== Toolbar Module =====
import { getState, setShowFullPath, resetAllNames, getChangedFiles } from './state.js';
import { openFolderPicker } from './fileSystem.js';
import { applyRegexRename, isValidRegex } from './regexRename.js';
import { renderEditor } from './editor.js';
import { renderTree } from './folderTree.js';
import { openCompareDialog } from './compareDialog.js';
import { executeRenames } from './renamer.js';
import { toggleTheme } from './theme.js';

let findInput = null;
let replaceInput = null;
let regexModeCheckbox = null;
let caseSensitiveCheckbox = null;

export function initToolbar() {
    findInput = document.getElementById('regex-find');
    replaceInput = document.getElementById('regex-replace');
    regexModeCheckbox = document.getElementById('chk-regex-mode');
    caseSensitiveCheckbox = document.getElementById('chk-case-sensitive');

    bindToolbarButtons();
    bindRegexInputs();
}

function bindToolbarButtons() {
    document.getElementById('btn-open-folder')
        .addEventListener('click', handleOpenFolder);
    document.getElementById('chk-full-path')
        .addEventListener('change', handleFullPathToggle);
    document.getElementById('btn-apply-regex')
        .addEventListener('click', handleApplyRegex);
    document.getElementById('btn-clear-regex')
        .addEventListener('click', handleClearRegex);
    document.getElementById('btn-undo-all')
        .addEventListener('click', handleUndoAll);
    document.getElementById('btn-compare')
        .addEventListener('click', handleCompare);
    document.getElementById('btn-save')
        .addEventListener('click', handleSave);
    document.getElementById('btn-theme')
        .addEventListener('click', toggleTheme);
}

function bindRegexInputs() {
    findInput.addEventListener('input', validateAndPreview);
    replaceInput.addEventListener('input', validateAndPreview);
    regexModeCheckbox.addEventListener('change', validateAndPreview);
    caseSensitiveCheckbox.addEventListener('change', validateAndPreview);
}

async function handleOpenFolder() {
    setStatusMessage('Opening folder...');
    const handle = await openFolderPicker();
    if (handle) {
        renderTree();
        renderEditor();
        setStatusMessage(`Opened: ${handle.name}`);
    } else {
        setStatusMessage('Ready — Open a folder to begin');
    }
}

function handleFullPathToggle(e) {
    setShowFullPath(e.target.checked);
    renderEditor();
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
    const { allFiles } = getState();
    const state = getState();

    for (let i = 0; i < result.updatedNames.length; i++) {
        state.currentNames[i] = result.updatedNames[i];
    }

    renderEditor();
}

function handleClearRegex() {
    findInput.value = '';
    replaceInput.value = '';
    findInput.classList.remove('invalid');
    renderEditor();
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

function validateAndPreview() {
    const pattern = findInput.value;
    const isRegex = regexModeCheckbox.checked;

    if (isRegex && pattern && !isValidRegex(pattern)) {
        findInput.classList.add('invalid');
    } else {
        findInput.classList.remove('invalid');
    }
}

function setStatusMessage(msg) {
    document.getElementById('status-message').textContent = msg;
}
