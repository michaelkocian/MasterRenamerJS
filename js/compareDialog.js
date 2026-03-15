// ===== Compare Dialog =====
import { getState, getChangedFiles } from './state.js';
import { computeCharDiff, renderDiffHtml } from './diffHighlight.js';

let dialogEl = null;
let contentEl = null;
let pathSelector = null;
let displaySelector = null;
let summaryEl = null;
let onSaveCallback = null;

export function initCompareDialog() {
    dialogEl = document.getElementById('compare-dialog');
    contentEl = document.getElementById('compare-content');
    pathSelector = document.getElementById('sel-compare-path');
    displaySelector = document.getElementById('sel-compare-display');
    summaryEl = document.getElementById('compare-summary');

    bindDialogEvents();
}

function bindDialogEvents() {
    document.getElementById('btn-close-dialog')
        .addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-cancel')
        .addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-save')
        .addEventListener('click', handleDialogSave);
    pathSelector.addEventListener('change', () => renderChanges());
    displaySelector.addEventListener('change', () => renderChanges());
}

export function openCompareDialog(saveCallback) {
    onSaveCallback = saveCallback;
    syncSelectorsFromState();
    renderChanges();
    dialogEl.classList.remove('hidden');
}

function syncSelectorsFromState() {
    const { pathMode, displayMode } = getState();
    pathSelector.value = pathMode;
    displaySelector.value = displayMode;
}

export function closeDialog() {
    dialogEl.classList.add('hidden');
    onSaveCallback = null;
}

function handleDialogSave() {
    if (onSaveCallback) {
        onSaveCallback();
    }
    closeDialog();
}

function renderChanges() {
    const changes = getChangedFiles();
    const pathMode = pathSelector.value;
    const displayMode = displaySelector.value;
    contentEl.innerHTML = '';

    if (changes.length === 0) {
        contentEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No changes to save</div>';
        summaryEl.textContent = '';
        return;
    }

    for (const change of changes) {
        const row = buildCompareRow(change, pathMode, displayMode);
        contentEl.appendChild(row);
    }

    summaryEl.textContent = `${changes.length} file${changes.length !== 1 ? 's' : ''} changed`;
}

function buildCompareRow(change, pathMode, displayMode) {
    const row = document.createElement('div');
    row.className = 'compare-row changed';

    const oldDisplay = formatChangeName(change, true, pathMode);
    const newDisplay = formatChangeName(change, false, pathMode);

    row.appendChild(createCell('compare-number', String(change.index + 1)));
    row.appendChild(createDiffCell('compare-old', oldDisplay, newDisplay, true, displayMode));
    row.appendChild(createCell('compare-arrow', '→'));
    row.appendChild(createDiffCell('compare-new', oldDisplay, newDisplay, false, displayMode));

    return row;
}

function formatChangeName(change, isOld, pathMode) {
    const name = isOld ? change.oldName : change.newName;
    if (pathMode === 'full') {
        return rebuildPathWithNewName(change.file.path, name);
    }
    if (pathMode === 'relative') {
        const { selectedTreeNode } = getState();
        const fullPath = rebuildPathWithNewName(change.file.path, name);
        if (selectedTreeNode) {
            return stripPrefix(fullPath, selectedTreeNode);
        }
        return fullPath;
    }
    return name;
}

function stripPrefix(path, folder) {
    if (path.startsWith(folder + '/')) {
        return path.substring(folder.length + 1);
    }
    return path;
}

function createCell(className, text) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
}

function createDiffCell(className, oldText, newText, isOld, displayMode) {
    const el = document.createElement('div');
    el.className = className;

    if (isOld) {
        el.textContent = oldText;
    } else {
        const segments = computeCharDiff(oldText, newText);
        el.innerHTML = renderDiffHtml(segments, displayMode);
    }

    return el;
}

function rebuildPathWithNewName(oldPath, newName) {
    const lastSlash = oldPath.lastIndexOf('/');
    if (lastSlash === -1) return newName;
    return oldPath.substring(0, lastSlash + 1) + newName;
}
