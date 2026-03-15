// ===== Compare Dialog =====
import { getState, getChangedFiles } from './state.js';
import { computeCharDiff, renderDiffHtml } from './diffHighlight.js';

let dialogEl = null;
let contentEl = null;
let showPathCheckbox = null;
let onSaveCallback = null;

export function initCompareDialog() {
    dialogEl = document.getElementById('compare-dialog');
    contentEl = document.getElementById('compare-content');
    showPathCheckbox = document.getElementById('chk-compare-path');

    bindDialogEvents();
}

function bindDialogEvents() {
    document.getElementById('btn-close-dialog')
        .addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-cancel')
        .addEventListener('click', closeDialog);
    document.getElementById('btn-dialog-save')
        .addEventListener('click', handleDialogSave);
    showPathCheckbox
        .addEventListener('change', () => renderChanges());
}

export function openCompareDialog(saveCallback) {
    onSaveCallback = saveCallback;
    renderChanges();
    dialogEl.classList.remove('hidden');
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
    const showPath = showPathCheckbox.checked;
    contentEl.innerHTML = '';

    if (changes.length === 0) {
        contentEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No changes to save</div>';
        return;
    }

    for (const change of changes) {
        const row = buildCompareRow(change, showPath);
        contentEl.appendChild(row);
    }
}

function buildCompareRow(change, showPath) {
    const row = document.createElement('div');
    row.className = 'compare-row changed';

    const oldDisplay = showPath ? change.file.path : change.oldName;
    const newDisplay = showPath
        ? rebuildPathWithNewName(change.file.path, change.newName)
        : change.newName;

    row.appendChild(createCell('compare-number', String(change.index + 1)));
    row.appendChild(createDiffCell('compare-old', oldDisplay, newDisplay, true));
    row.appendChild(createCell('compare-arrow', '→'));
    row.appendChild(createDiffCell('compare-new', oldDisplay, newDisplay, false));

    return row;
}

function createCell(className, text) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
}

function createDiffCell(className, oldText, newText, isOld) {
    const el = document.createElement('div');
    el.className = className;

    const segments = computeCharDiff(oldText, newText);
    if (isOld) {
        el.textContent = oldText;
    } else {
        el.innerHTML = renderDiffHtml(segments);
    }

    return el;
}

function rebuildPathWithNewName(oldPath, newName) {
    const lastSlash = oldPath.lastIndexOf('/');
    if (lastSlash === -1) return newName;
    return oldPath.substring(0, lastSlash + 1) + newName;
}
