// ===== Editor Module =====
import { getState, updateFileName, onStateChange } from './state.js';
import { BlockSelection, pixelToRowCol } from './blockSelection.js';
import { readClipboardText, writeClipboardText, splitClipboardLines, buildPasteLines } from './clipboard.js';
import { computeCharDiff, renderDiffHtml } from './diffHighlight.js';

let editorEl = null;
let lineNumbersEl = null;
let fileCountEl = null;
let selectionInfoEl = null;
let hiddenInput = null;

const selection = new BlockSelection();
let caretRow = 0;
let caretCol = 0;
let isDragging = false;

export function initEditor() {
    editorEl = document.getElementById('editor');
    lineNumbersEl = document.getElementById('line-numbers');
    fileCountEl = document.getElementById('editor-file-count');
    selectionInfoEl = document.getElementById('editor-selection-info');

    createHiddenInput();
    measureCharWidth();
    bindEditorEvents();
    bindStateEvents();
}

function createHiddenInput() {
    hiddenInput = document.createElement('textarea');
    hiddenInput.className = 'editor-hidden-input';
    hiddenInput.setAttribute('autocomplete', 'off');
    hiddenInput.setAttribute('autocorrect', 'off');
    hiddenInput.setAttribute('spellcheck', 'false');
    editorEl.appendChild(hiddenInput);
}

function measureCharWidth() {
    const probe = document.createElement('span');
    probe.style.cssText = `
        position:absolute;visibility:hidden;
        font-family:'Consolas','Courier New',monospace;
        font-size:13px;white-space:pre;
    `;
    probe.textContent = 'X';
    document.body.appendChild(probe);

    const width = probe.offsetWidth;
    getState().charWidth = width;
    document.body.removeChild(probe);
}

// ===== Event Binding =====

function bindEditorEvents() {
    editorEl.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    hiddenInput.addEventListener('input', handleInput);
    hiddenInput.addEventListener('keydown', handleKeyDown);
    editorEl.addEventListener('focus', () => hiddenInput.focus());
}

function bindStateEvents() {
    onStateChange('visible-files-changed', renderEditor);
    onStateChange('display-mode-changed', renderEditor);
    onStateChange('names-reset', renderEditor);
    onStateChange('names-committed', renderEditor);
}

// ===== Rendering =====

export function renderEditor() {
    const lines = getCurrentDisplayLines();
    renderLineNumbers(lines.length);
    renderEditorLines(lines);
    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function getCurrentDisplayLines() {
    const { visibleFiles, allFiles, currentNames, showFullPath } = getState();
    return visibleFiles.map(f => {
        const idx = allFiles.indexOf(f);
        const name = currentNames[idx] || f.name;
        return showFullPath ? rebuildPath(f.path, name) : name;
    });
}

function rebuildPath(originalPath, currentName) {
    const lastSlash = originalPath.lastIndexOf('/');
    if (lastSlash === -1) return currentName;
    return originalPath.substring(0, lastSlash + 1) + currentName;
}

function getOriginalDisplayLines() {
    const { visibleFiles, allFiles, originalNames, showFullPath } = getState();
    return visibleFiles.map(f => {
        const idx = allFiles.indexOf(f);
        const name = originalNames[idx] || f.name;
        return showFullPath ? f.path : name;
    });
}

function renderLineNumbers(count) {
    lineNumbersEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'line-number';
        div.textContent = i + 1;
        lineNumbersEl.appendChild(div);
    }
}

function renderEditorLines(lines) {
    const originals = getOriginalDisplayLines();
    const editorChildren = Array.from(editorEl.querySelectorAll('.editor-line'));

    removeExtraLines(editorChildren, lines.length);
    
    for (let i = 0; i < lines.length; i++) {
        const lineEl = editorChildren[i] || createLineElement();
        updateLineContent(lineEl, lines[i], originals[i], i);
        if (!lineEl.parentNode || lineEl.parentNode !== editorEl) {
            editorEl.insertBefore(lineEl, hiddenInput);
        }
    }
}

function createLineElement() {
    const div = document.createElement('div');
    div.className = 'editor-line';
    return div;
}

function removeExtraLines(lineElements, needed) {
    while (lineElements.length > needed) {
        lineElements.pop().remove();
    }
}

function updateLineContent(lineEl, text, originalText, index) {
    const isModified = text !== originalText;
    lineEl.classList.toggle('modified', isModified);
    lineEl.dataset.row = index;

    if (isModified) {
        const segments = computeCharDiff(originalText, text);
        lineEl.innerHTML = renderDiffHtml(segments);
    } else {
        lineEl.textContent = text;
    }
}

function updateStatusInfo(count) {
    fileCountEl.textContent = `${count} file${count !== 1 ? 's' : ''}`;

    if (selection.active && !selection.isCollapsed()) {
        const rows = selection.rowCount;
        const cols = selection.colSpan;
        selectionInfoEl.textContent = `Sel: ${rows}×${cols}`;
    } else {
        selectionInfoEl.textContent = `Ln ${caretRow + 1}, Col ${caretCol + 1}`;
    }
}

// ===== Selection Overlays =====

function renderSelectionOverlays() {
    clearOverlays();

    if (!selection.active || selection.isCollapsed()) {
        renderCaret();
        return;
    }

    const { charWidth } = getState();
    const minRow = selection.minRow;
    const maxRow = selection.maxRow;
    const minCol = selection.minCol;
    const maxCol = selection.maxCol;

    for (let r = minRow; r <= maxRow; r++) {
        const highlight = document.createElement('div');
        highlight.className = 'block-selection-highlight';
        highlight.style.top = `${r * 20 + 4}px`;
        highlight.style.left = `${minCol * charWidth + 8}px`;
        highlight.style.width = `${(maxCol - minCol) * charWidth}px`;
        highlight.style.height = '20px';
        editorEl.appendChild(highlight);
    }

    renderCaret();
}

function renderCaret() {
    const { charWidth } = getState();
    const caret = document.createElement('div');
    caret.className = 'editor-caret';
    caret.style.top = `${caretRow * 20 + 4}px`;
    caret.style.left = `${caretCol * charWidth + 8}px`;
    editorEl.appendChild(caret);
}

function clearOverlays() {
    editorEl.querySelectorAll('.block-selection-highlight, .editor-caret')
        .forEach(el => el.remove());
}

// ===== Mouse Handling =====

function handleMouseDown(e) {
    if (e.target === hiddenInput) return;
    e.preventDefault();
    hiddenInput.focus();

    const lines = getCurrentDisplayLines();
    if (lines.length === 0) return;

    const { row, col } = pixelToRowCol(editorEl, e.clientX, e.clientY, getState().charWidth);
    const clampedRow = clampRowIndex(row, lines.length);

    startBlockSelection(clampedRow, col);
    isDragging = true;
    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function clampRowIndex(row, lineCount) {
    return Math.max(0, Math.min(row, lineCount - 1));
}

function handleMouseMove(e) {
    if (!isDragging) return;

    const lines = getCurrentDisplayLines();
    if (lines.length === 0) return;

    const { row, col } = pixelToRowCol(editorEl, e.clientX, e.clientY, getState().charWidth);
    const clampedRow = clampRowIndex(row, lines.length);

    selection.moveTo(clampedRow, col);
    caretRow = clampedRow;
    caretCol = col;

    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function handleMouseUp() {
    isDragging = false;
}

function startBlockSelection(row, col) {
    selection.begin(row, col);
    caretRow = row;
    caretCol = col;
}

// ===== Keyboard Handling =====

function handleKeyDown(e) {
    const lines = getCurrentDisplayLines();
    if (lines.length === 0) return;

    if (handleNavigationKeys(e, lines)) return;
    if (handleEditingKeys(e, lines)) return;
    if (handleClipboardKeys(e, lines)) return;
    if (handleSelectAllKey(e, lines)) return;
}

function handleNavigationKeys(e, lines) {
    const isShift = e.shiftKey;
    const arrowHandlers = {
        'ArrowLeft': () => moveCaret(0, -1, isShift, lines),
        'ArrowRight': () => moveCaret(0, 1, isShift, lines),
        'ArrowUp': () => moveCaret(-1, 0, isShift, lines),
        'ArrowDown': () => moveCaret(1, 0, isShift, lines),
        'Home': () => moveToLineStart(isShift, lines),
        'End': () => moveToLineEnd(isShift, lines),
    };

    const handler = arrowHandlers[e.key];
    if (handler) {
        e.preventDefault();
        handler();
        return true;
    }
    return false;
}

function moveToLineStart(extendSelection, lines) {
    caretCol = 0;
    if (!extendSelection) selection.clear();
    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function moveToLineEnd(extendSelection, lines) {
    caretCol = (lines[caretRow] || '').length;
    if (!extendSelection) selection.clear();
    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function handleEditingKeys(e, lines) {
    if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace(lines);
        return true;
    }
    if (e.key === 'Delete') {
        e.preventDefault();
        handleDelete(lines);
        return true;
    }
    return false;
}

function handleClipboardKeys(e, lines) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy(lines);
        return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        e.preventDefault();
        handleCut(lines);
        return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste(lines);
        return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        return true;
    }
    return false;
}

function handleSelectAllKey(e, lines) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll(lines);
        return true;
    }
    return false;
}

// ===== Caret Movement =====

function moveCaret(rowDelta, colDelta, extendSelection, lines) {
    const newRow = Math.max(0, Math.min(caretRow + rowDelta, lines.length - 1));
    const newCol = Math.max(0, caretCol + colDelta);

    if (extendSelection) {
        if (!selection.active) {
            selection.begin(caretRow, caretCol);
        }
        selection.moveTo(newRow, newCol);
    } else {
        selection.clear();
    }

    caretRow = newRow;
    caretCol = newCol;

    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

function selectAll(lines) {
    if (lines.length === 0) return;
    const maxCol = Math.max(...lines.map(l => l.length));
    selection.begin(0, 0);
    selection.moveTo(lines.length - 1, maxCol);
    caretRow = lines.length - 1;
    caretCol = maxCol;
    renderSelectionOverlays();
    updateStatusInfo(lines.length);
}

// ===== Text Input =====

function handleInput() {
    const text = hiddenInput.value;
    hiddenInput.value = '';
    if (!text) return;

    const lines = getCurrentDisplayLines();
    if (lines.length === 0) return;

    if (selection.active && !selection.isCollapsed()) {
        replaceSelectionWithText(lines, text);
    } else if (selection.active && selection.rowCount > 1) {
        insertTextOnMultipleRows(lines, text);
    } else {
        insertTextAtCaret(lines, text);
    }
}

function insertTextAtCaret(lines, text) {
    const row = Math.min(caretRow, lines.length - 1);
    const line = lines[row] || '';
    const paddedLine = line.padEnd(caretCol, ' ');
    const newLine = paddedLine.substring(0, caretCol) + text + paddedLine.substring(caretCol);

    applyLineChange(row, newLine);
    caretCol += text.length;
    selection.clear();
    renderEditor();
}

function insertTextOnMultipleRows(lines, text) {
    const newLines = [...lines];
    for (let r = selection.minRow; r <= selection.maxRow; r++) {
        const line = newLines[r] || '';
        const padded = line.padEnd(caretCol, ' ');
        newLines[r] = padded.substring(0, caretCol) + text + padded.substring(caretCol);
    }

    applyMultipleLineChanges(newLines);
    caretCol += text.length;
    selection.begin(selection.minRow, caretCol);
    selection.moveTo(selection.maxRow, caretCol);
    renderEditor();
}

function replaceSelectionWithText(lines, text) {
    const textLines = text.split('\n').map(l => l.replace(/\r$/, ''));
    const pasteLines = buildPasteLines(textLines, selection.rowCount);

    applyBlockReplace(lines, pasteLines);
    caretCol = selection.minCol + (pasteLines[0] || '').length;
    caretRow = selection.minRow;
    selection.clear();
    renderEditor();
}

// ===== Copy / Cut / Paste =====

function handleCopy(lines) {
    if (!selection.active || selection.isCollapsed()) return;
    const text = selection.extractTextFromLines(lines);
    writeClipboardText(text);
}

async function handleCut(lines) {
    if (!selection.active || selection.isCollapsed()) return;
    const text = selection.extractTextFromLines(lines);
    await writeClipboardText(text);
    deleteSelectedBlock(lines);
}

async function handlePaste(lines) {
    const text = await readClipboardText();
    if (!text) return;

    const clipLines = splitClipboardLines(text);

    if (selection.active && !selection.isCollapsed()) {
        pasteIntoBlockSelection(lines, clipLines);
    } else if (selection.active && selection.rowCount > 1) {
        pasteOntoMultipleCursors(lines, clipLines);
    } else {
        insertTextAtCaret(lines, clipLines[0] || '');
    }

    renderEditor();
}

function pasteIntoBlockSelection(lines, clipLines) {
    const pasteLines = buildPasteLines(clipLines, selection.rowCount);
    applyBlockReplace(lines, pasteLines);
    caretCol = selection.minCol + (pasteLines[0] || '').length;
    caretRow = selection.minRow;
    selection.clear();
}

function pasteOntoMultipleCursors(lines, clipLines) {
    const rowCount = selection.maxRow - selection.minRow + 1;
    const pasteLines = buildPasteLines(clipLines, rowCount);
    const newLines = [...lines];

    for (let r = selection.minRow; r <= selection.maxRow; r++) {
        const lineIdx = r - selection.minRow;
        const line = newLines[r] || '';
        const padded = line.padEnd(caretCol, ' ');
        const insert = pasteLines[lineIdx] || '';
        newLines[r] = padded.substring(0, caretCol) + insert + padded.substring(caretCol);
    }

    applyMultipleLineChanges(newLines);
    caretCol += (pasteLines[0] || '').length;
}

// ===== Backspace / Delete =====

function handleBackspace(lines) {
    if (selection.active && !selection.isCollapsed()) {
        deleteSelectedBlock(lines);
        return;
    }

    if (caretCol === 0) return;

    if (selection.active && selection.rowCount > 1) {
        backspaceOnMultipleRows(lines);
        return;
    }

    const row = Math.min(caretRow, lines.length - 1);
    const line = lines[row] || '';
    const newLine = line.substring(0, caretCol - 1) + line.substring(caretCol);

    applyLineChange(row, newLine);
    caretCol = Math.max(0, caretCol - 1);
    renderEditor();
}

function backspaceOnMultipleRows(lines) {
    const newLines = [...lines];
    for (let r = selection.minRow; r <= selection.maxRow; r++) {
        const line = newLines[r] || '';
        if (caretCol > 0 && caretCol <= line.length) {
            newLines[r] = line.substring(0, caretCol - 1) + line.substring(caretCol);
        }
    }
    applyMultipleLineChanges(newLines);
    caretCol = Math.max(0, caretCol - 1);
    selection.begin(selection.minRow, caretCol);
    selection.moveTo(selection.maxRow, caretCol);
    renderEditor();
}

function handleDelete(lines) {
    if (selection.active && !selection.isCollapsed()) {
        deleteSelectedBlock(lines);
        return;
    }

    if (selection.active && selection.rowCount > 1) {
        deleteOnMultipleRows(lines);
        return;
    }

    const row = Math.min(caretRow, lines.length - 1);
    const line = lines[row] || '';
    if (caretCol >= line.length) return;

    const newLine = line.substring(0, caretCol) + line.substring(caretCol + 1);
    applyLineChange(row, newLine);
    renderEditor();
}

function deleteOnMultipleRows(lines) {
    const newLines = [...lines];
    for (let r = selection.minRow; r <= selection.maxRow; r++) {
        const line = newLines[r] || '';
        if (caretCol < line.length) {
            newLines[r] = line.substring(0, caretCol) + line.substring(caretCol + 1);
        }
    }
    applyMultipleLineChanges(newLines);
    renderEditor();
}

function deleteSelectedBlock(lines) {
    const result = selection.deleteTextFromLines(lines);
    applyMultipleLineChanges(result);
    caretCol = selection.minCol;
    caretRow = selection.minRow;
    selection.clear();
    renderEditor();
}

// ===== Apply Changes to State =====

function applyLineChange(displayIndex, newDisplayText) {
    const { visibleFiles, allFiles, showFullPath } = getState();
    const file = visibleFiles[displayIndex];
    if (!file) return;

    const globalIndex = allFiles.indexOf(file);
    if (globalIndex === -1) return;

    const rawName = showFullPath
        ? extractNameFromPath(newDisplayText)
        : newDisplayText;

    updateFileName(globalIndex, rawName.trimEnd());
}

function applyMultipleLineChanges(newDisplayLines) {
    const { visibleFiles, allFiles, showFullPath } = getState();

    for (let i = 0; i < newDisplayLines.length; i++) {
        const file = visibleFiles[i];
        if (!file) continue;

        const globalIndex = allFiles.indexOf(file);
        if (globalIndex === -1) continue;

        const rawName = showFullPath
            ? extractNameFromPath(newDisplayLines[i])
            : newDisplayLines[i];

        updateFileName(globalIndex, rawName.trimEnd());
    }
}

function applyBlockReplace(currentLines, pasteLines) {
    const result = selection.replaceTextInLines(currentLines, pasteLines);
    applyMultipleLineChanges(result);
}

function extractNameFromPath(displayText) {
    const lastSlash = displayText.lastIndexOf('/');
    return lastSlash >= 0 ? displayText.substring(lastSlash + 1) : displayText;
}

// ===== Scroll Sync =====

export function setupScrollSync() {
    // Line numbers and editor share the same scroll container,
    // so vertical scrolling is handled automatically.
    // Line numbers use position:sticky for horizontal scroll.
}
