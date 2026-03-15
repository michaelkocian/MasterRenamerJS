// ===== Editor Module =====
import { getState, updateFileName, onStateChange } from './state.js';
import { getDirectSubfolders } from './folderTree.js';
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
let searchPattern = null;
let lineMappings = [];

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
    const sampleCount = 100;
    probe.textContent = 'X'.repeat(sampleCount);
    document.body.appendChild(probe);

    const width = probe.getBoundingClientRect().width / sampleCount;
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
    const scrollEl = document.getElementById('editor-scroll');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

    const lines = getCurrentDisplayLines();
    buildLineMappings(lines);
    renderLineNumbers(lines.length);
    renderEditorLines(lines);
    renderSelectionOverlays();
    updateStatusInfo(lines.length);

    if (scrollEl) {
        scrollEl.scrollTop = scrollTop;
        scrollEl.scrollLeft = scrollLeft;
    }
}

function buildLineMappings(lines) {
    const { displayMode } = getState();
    if (displayMode !== 'green-red') {
        lineMappings = [];
        return;
    }
    const originals = getOriginalDisplayLines();
    lineMappings = lines.map((newText, i) => {
        const oldText = originals[i];
        if (newText === oldText) return null;
        const segments = computeCharDiff(oldText, newText);
        const m2v = [];
        const v2m = [];
        let mc = 0, vc = 0;
        for (const seg of segments) {
            if (seg.type === 'same' || seg.type === 'added') {
                for (let c = 0; c < seg.text.length; c++) {
                    m2v[mc] = vc;
                    v2m[vc] = mc;
                    mc++;
                    vc++;
                }
            } else if (seg.type === 'removed') {
                for (let c = 0; c < seg.text.length; c++) {
                    v2m[vc] = mc;
                    vc++;
                }
            }
        }
        m2v[mc] = vc;
        v2m[vc] = mc;
        return { m2v, v2m };
    });
}

function modelToVisualCol(row, modelCol) {
    if (!lineMappings[row]) return modelCol;
    const m2v = lineMappings[row].m2v;
    if (modelCol >= m2v.length) {
        const last = m2v.length - 1;
        return m2v[last] + (modelCol - last);
    }
    return m2v[modelCol];
}

function visualToModelCol(row, visualCol) {
    if (!lineMappings[row]) return visualCol;
    const v2m = lineMappings[row].v2m;
    if (visualCol >= v2m.length) {
        const last = v2m.length - 1;
        return v2m[last] + (visualCol - last);
    }
    return v2m[visualCol];
}

function getCurrentDisplayLines() {
    const { visibleFiles, allFiles, currentNames, pathMode, selectedTreeNode } = getState();
    return visibleFiles.map(f => {
        const idx = allFiles.indexOf(f);
        const name = currentNames[idx] || f.name;
        return formatDisplayName(f, name, pathMode, selectedTreeNode);
    });
}

function formatDisplayName(file, currentName, pathMode, selectedFolder) {
    if (pathMode === 'full') {
        return rebuildPath(file.path, currentName);
    }
    if (pathMode === 'relative') {
        const fullPath = rebuildPath(file.path, currentName);
        if (selectedFolder) {
            return stripFolderPrefix(fullPath, selectedFolder);
        }
        return fullPath;
    }
    return currentName;
}

function stripFolderPrefix(path, folderPath) {
    if (path.startsWith(folderPath + '/')) {
        return path.substring(folderPath.length + 1);
    }
    return path;
}

function rebuildPath(originalPath, currentName) {
    const lastSlash = originalPath.lastIndexOf('/');
    if (lastSlash === -1) return currentName;
    return originalPath.substring(0, lastSlash + 1) + currentName;
}

function getOriginalDisplayLines() {
    const { visibleFiles, allFiles, originalNames, pathMode, selectedTreeNode } = getState();
    return visibleFiles.map(f => {
        const idx = allFiles.indexOf(f);
        const name = originalNames[idx] || f.name;
        return formatDisplayName(f, name, pathMode, selectedTreeNode);
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
    const { displayMode } = getState();
    const isModified = text !== originalText;
    lineEl.classList.toggle('modified', isModified);
    lineEl.dataset.row = index;

    if (displayMode === 'old') {
        lineEl.innerHTML = renderWithSearchHighlight(originalText);
    } else if (displayMode === 'new' || !isModified) {
        lineEl.innerHTML = renderWithSearchHighlight(text);
    } else {
        const segments = computeCharDiff(originalText, text);
        const diffHtml = renderDiffHtml(segments, displayMode);
        lineEl.innerHTML = diffHtml;
        applySearchHighlightToElement(lineEl);
    }
}

function renderWithSearchHighlight(text) {
    if (!searchPattern) return escapeHtml(text);

    let result = '';
    let lastIndex = 0;
    const regex = new RegExp(searchPattern.source, searchPattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
        result += escapeHtml(text.substring(lastIndex, match.index));
        result += `<span class="search-highlight">${escapeHtml(match[0])}</span>`;
        lastIndex = regex.lastIndex;
        if (!regex.global) break;
    }

    result += escapeHtml(text.substring(lastIndex));
    return result;
}

function applySearchHighlightToElement(lineEl) {
    if (!searchPattern) return;

    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
        highlightTextNode(node);
    }
}

function highlightTextNode(textNode) {
    const text = textNode.textContent;
    const regex = new RegExp(searchPattern.source, searchPattern.flags);
    const match = regex.exec(text);
    if (!match) return;

    const span = document.createElement('span');
    span.className = 'search-highlight';
    span.textContent = match[0];

    const before = text.substring(0, match.index);
    const after = text.substring(match.index + match[0].length);
    const parent = textNode.parentNode;

    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(span, textNode);
    if (after) {
        const afterNode = document.createTextNode(after);
        parent.insertBefore(afterNode, textNode);
        highlightTextNode(afterNode);
    }
    parent.removeChild(textNode);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function setSearchHighlight(regex) {
    searchPattern = regex;
}

export function getSearchMatchCount() {
    if (!searchPattern) return 0;
    const { displayMode } = getState();
    const lines = displayMode === 'old'
        ? getOriginalDisplayLines()
        : getCurrentDisplayLines();
    let count = 0;
    for (const line of lines) {
        const matches = line.match(searchPattern);
        if (matches) count += matches.length;
    }
    return count;
}

function updateStatusInfo(count) {
    // Count files and folders
    const { visibleFiles, allFiles, selectedTreeNode, fileScope } = getState();
    let fileCount = 0, folderCount = 0;
    for (const f of visibleFiles) {
        if (f.isVirtualFolder) folderCount++;
        else fileCount++;
    }
    // In 'folder' (Files Only) mode, compute subfolder count from actual data
    if (fileScope === 'folder') {
        folderCount = getDirectSubfolders(allFiles, selectedTreeNode).size;
    }
    fileCountEl.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''}, ${folderCount} folder${folderCount !== 1 ? 's' : ''}`;

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
        const vMinCol = modelToVisualCol(r, minCol);
        const vMaxCol = modelToVisualCol(r, maxCol);
        const highlight = document.createElement('div');
        highlight.className = 'block-selection-highlight';
        highlight.style.top = `${r * 20 + 4}px`;
        highlight.style.left = `${vMinCol * charWidth + 8}px`;
        highlight.style.width = `${(vMaxCol - vMinCol) * charWidth}px`;
        highlight.style.height = '20px';
        editorEl.appendChild(highlight);
    }

    renderCaret();
}

function renderCaret() {
    const { charWidth } = getState();
    const visualCol = modelToVisualCol(caretRow, caretCol);
    const caret = document.createElement('div');
    caret.className = 'editor-caret';
    caret.style.top = `${caretRow * 20 + 4}px`;
    caret.style.left = `${visualCol * charWidth + 8}px`;
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
    const modelCol = visualToModelCol(clampedRow, col);

    startBlockSelection(clampedRow, modelCol);
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

    const modelCol = visualToModelCol(clampedRow, col);

    selection.moveTo(clampedRow, modelCol);
    caretRow = clampedRow;
    caretCol = modelCol;

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

function hasBlockWidth() {
    return selection.active && selection.colSpan > 0;
}

function hasMultiRowCursor() {
    return selection.active && selection.rowCount > 1;
}

function handleInput() {
    const text = hiddenInput.value;
    hiddenInput.value = '';
    if (!text) return;

    const lines = getCurrentDisplayLines();
    if (lines.length === 0) return;

    if (hasBlockWidth()) {
        replaceSelectionWithText(lines, text);
    } else if (hasMultiRowCursor()) {
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
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;
    const newLines = [...lines];
    for (let r = savedMinRow; r <= savedMaxRow; r++) {
        const line = newLines[r] || '';
        const padded = line.padEnd(caretCol, ' ');
        newLines[r] = padded.substring(0, caretCol) + text + padded.substring(caretCol);
    }

    applyMultipleLineChanges(newLines);
    caretCol += text.length;
    selection.begin(savedMinRow, caretCol);
    selection.moveTo(savedMaxRow, caretCol);
    renderEditor();
}

function replaceSelectionWithText(lines, text) {
    const textLines = text.split('\n').map(l => l.replace(/\r$/, ''));
    const pasteLines = buildPasteLines(textLines, selection.rowCount);
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;

    applyBlockReplace(lines, pasteLines);
    caretCol = selection.minCol + (pasteLines[0] || '').length;
    caretRow = savedMinRow;
    preserveMultiRowCursor(savedMinRow, savedMaxRow, caretCol);
    renderEditor();
}

function preserveMultiRowCursor(minRow, maxRow, col) {
    if (maxRow > minRow) {
        selection.begin(minRow, col);
        selection.moveTo(maxRow, col);
    } else {
        selection.clear();
    }
}

// ===== Copy / Cut / Paste =====

function handleCopy(lines) {
    if (!hasBlockWidth()) return;
    const text = selection.extractTextFromLines(lines);
    writeClipboardText(text);
}

async function handleCut(lines) {
    if (!hasBlockWidth()) return;
    const text = selection.extractTextFromLines(lines);
    await writeClipboardText(text);
    deleteSelectedBlock(lines);
}

async function handlePaste(lines) {
    const text = await readClipboardText();
    if (!text) return;

    const clipLines = splitClipboardLines(text);

    if (hasBlockWidth()) {
        pasteIntoBlockSelection(lines, clipLines);
    } else if (hasMultiRowCursor()) {
        pasteOntoMultipleCursors(lines, clipLines);
    } else {
        insertTextAtCaret(lines, clipLines[0] || '');
    }

    renderEditor();
}

function pasteIntoBlockSelection(lines, clipLines) {
    const pasteLines = buildPasteLines(clipLines, selection.rowCount);
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;

    applyBlockReplace(lines, pasteLines);
    caretCol = selection.minCol + (pasteLines[0] || '').length;
    caretRow = savedMinRow;
    preserveMultiRowCursor(savedMinRow, savedMaxRow, caretCol);
}

function pasteOntoMultipleCursors(lines, clipLines) {
    const rowCount = selection.maxRow - selection.minRow + 1;
    const pasteLines = buildPasteLines(clipLines, rowCount);
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;
    const newLines = [...lines];

    for (let r = savedMinRow; r <= savedMaxRow; r++) {
        const lineIdx = r - savedMinRow;
        const line = newLines[r] || '';
        const padded = line.padEnd(caretCol, ' ');
        const insert = pasteLines[lineIdx] || '';
        newLines[r] = padded.substring(0, caretCol) + insert + padded.substring(caretCol);
    }

    applyMultipleLineChanges(newLines);
    caretCol += (pasteLines[0] || '').length;
    preserveMultiRowCursor(savedMinRow, savedMaxRow, caretCol);
}

// ===== Backspace / Delete =====

function handleBackspace(lines) {
    if (hasBlockWidth()) {
        deleteSelectedBlock(lines);
        return;
    }

    if (caretCol === 0) return;

    if (hasMultiRowCursor()) {
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
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;
    const newLines = [...lines];
    for (let r = savedMinRow; r <= savedMaxRow; r++) {
        const line = newLines[r] || '';
        if (caretCol > 0 && caretCol <= line.length) {
            newLines[r] = line.substring(0, caretCol - 1) + line.substring(caretCol);
        }
    }
    applyMultipleLineChanges(newLines);
    caretCol = Math.max(0, caretCol - 1);
    selection.begin(savedMinRow, caretCol);
    selection.moveTo(savedMaxRow, caretCol);
    renderEditor();
}

function handleDelete(lines) {
    if (hasBlockWidth()) {
        deleteSelectedBlock(lines);
        return;
    }

    if (hasMultiRowCursor()) {
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
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;
    const newLines = [...lines];
    for (let r = savedMinRow; r <= savedMaxRow; r++) {
        const line = newLines[r] || '';
        if (caretCol < line.length) {
            newLines[r] = line.substring(0, caretCol) + line.substring(caretCol + 1);
        }
    }
    applyMultipleLineChanges(newLines);
    selection.begin(savedMinRow, caretCol);
    selection.moveTo(savedMaxRow, caretCol);
    renderEditor();
}

function deleteSelectedBlock(lines) {
    const savedMinRow = selection.minRow;
    const savedMaxRow = selection.maxRow;
    const result = selection.deleteTextFromLines(lines);

    applyMultipleLineChanges(result);
    caretCol = selection.minCol;
    caretRow = savedMinRow;
    preserveMultiRowCursor(savedMinRow, savedMaxRow, caretCol);
    renderEditor();
}

// ===== Apply Changes to State =====

function applyLineChange(displayIndex, newDisplayText) {
    const { visibleFiles, allFiles, pathMode, originalNames } = getState();
    const file = visibleFiles[displayIndex];
    if (!file) return;

    const globalIndex = allFiles.indexOf(file);
    if (globalIndex === -1) return;

    const rawName = (pathMode !== 'name')
        ? extractNameFromPath(newDisplayText)
        : newDisplayText;

    const trimmed = rawName.trimEnd();
    updateFileName(globalIndex, trimmed || originalNames[globalIndex]);
}

function applyMultipleLineChanges(newDisplayLines) {
    const { visibleFiles, allFiles, pathMode, originalNames } = getState();

    for (let i = 0; i < newDisplayLines.length; i++) {
        const file = visibleFiles[i];
        if (!file) continue;

        const globalIndex = allFiles.indexOf(file);
        if (globalIndex === -1) continue;

        const rawName = (pathMode !== 'name')
            ? extractNameFromPath(newDisplayLines[i])
            : newDisplayLines[i];

        const trimmed = rawName.trimEnd();
        updateFileName(globalIndex, trimmed || originalNames[globalIndex]);
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
