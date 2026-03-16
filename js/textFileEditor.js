import { BlockSelection, pixelToRowCol } from './blockSelection.js';
import { readClipboardText, writeClipboardText, splitClipboardLines, buildPasteLines } from './clipboard.js';
import { computeCharDiff, renderDiffHtml } from './diffHighlight.js';
import { getActiveVisibleFile } from './editor.js';
import { readTextFile, writeTextFile } from './fileSystem.js';
import { getState } from './state.js';

const selection = new BlockSelection();
const session = {
    file: null,
    mode: 'file',
    downloadName: 'untitled.txt',
    originalLines: [''],
    currentLines: [''],
    eol: '\n',
    encoding: 'utf-8',
    hasBom: false,
    displayMode: 'green-line',
    searchPattern: null,
    historyPast: [],
    historyFuture: [],
    lineMappings: [],
    caretRow: 0,
    caretCol: 0,
    isDraggingSelection: false,
    isDirty: false,
    isOpen: false,
    isMaximized: false,
    dragState: null,
    restoreBounds: null,
};

let modalEl = null;
let windowEl = null;
let headerEl = null;
let pathEl = null;
let nameInput = null;
let saveButton = null;
let sizeToggleButton = null;
let statusEl = null;
let lineNumbersEl = null;
let surfaceEl = null;
let scrollEl = null;
let hiddenInput = null;
let displaySelect = null;
let findInput = null;
let replaceInput = null;
let regexCheckbox = null;
let caseCheckbox = null;
let searchInfoEl = null;
let charWidth = 8;

export function initTextFileEditor() {
    modalEl = document.getElementById('text-editor-modal');
    windowEl = document.getElementById('text-editor-window');
    headerEl = document.getElementById('text-editor-header');
    pathEl = document.getElementById('text-editor-path');
    nameInput = document.getElementById('text-editor-name');
    saveButton = document.getElementById('btn-text-editor-save');
    sizeToggleButton = document.getElementById('btn-text-editor-toggle-size');
    statusEl = document.getElementById('text-editor-status');
    lineNumbersEl = document.getElementById('text-editor-line-numbers');
    surfaceEl = document.getElementById('text-editor-surface');
    scrollEl = document.getElementById('text-editor-scroll');
    displaySelect = document.getElementById('sel-text-display');
    findInput = document.getElementById('text-editor-find');
    replaceInput = document.getElementById('text-editor-replace');
    regexCheckbox = document.getElementById('text-editor-regex');
    caseCheckbox = document.getElementById('text-editor-case-sensitive');
    searchInfoEl = document.getElementById('text-editor-search-info');

    createHiddenInput();
    measureCharWidth();
    bindModalEvents();
    bindSourceEditorEvents();
}

export function isTextEditorOpen() {
    return Boolean(session.isOpen);
}

export async function openActiveTextFileFromRenameEditor() {
    const file = getActiveVisibleFile();
    if (!file || file.isVirtualFolder) {
        await openStandaloneTextEditor();
        return;
    }

    await openTextFileEditor(file);
}

export async function openStandaloneTextEditor(initialText = '', suggestedName = 'untitled.txt') {
    if (session.isOpen && session.isDirty && !window.confirm('Discard unsaved text changes?')) {
        return;
    }

    const normalizedName = sanitizeDownloadName(suggestedName || 'untitled.txt');
    session.file = null;
    session.mode = 'standalone';
    session.downloadName = normalizedName;
    session.originalLines = [''];
    session.currentLines = parseTextToLines(initialText);
    session.eol = '\n';
    session.encoding = 'utf-8';
    session.hasBom = false;
    session.displayMode = displaySelect.value || 'green-line';
    session.searchPattern = null;
    session.historyPast = [];
    session.historyFuture = [];
    session.lineMappings = [];
    session.caretRow = 0;
    session.caretCol = 0;
    session.isDirty = initialText.length > 0;
    session.isOpen = true;
    session.isDraggingSelection = false;
    selection.clear();

    resetSearchControls();
    applyInitialWindowBounds();
    modalEl.classList.remove('hidden');
    updateHeader();
    updateSaveButton();
    updateWindowToggleButton();
    renderEditor();
    hiddenInput.focus();
}

export async function openTextFileEditor(fileEntry) {
    if (!fileEntry || fileEntry.isVirtualFolder) {
        showToast('Select a file to open in the text editor', 3200, 'toast-error');
        return;
    }

    if (session.isOpen && session.isDirty && !window.confirm('Discard unsaved text changes?')) {
        return;
    }

    const result = await readTextFile(fileEntry);
    if (!result.ok) {
        showToast(result.reason || 'This file cannot be opened as text', 4500, 'toast-error');
        return;
    }

    session.file = fileEntry;
    session.mode = 'file';
    session.downloadName = sanitizeDownloadName(fileEntry.name || 'untitled.txt');
    session.originalLines = parseTextToLines(result.text);
    session.currentLines = [...session.originalLines];
    session.eol = detectEol(result.text);
    session.encoding = result.encoding || 'utf-8';
    session.hasBom = Boolean(result.hasBom);
    session.displayMode = displaySelect.value || 'green-line';
    session.searchPattern = null;
    session.historyPast = [];
    session.historyFuture = [];
    session.lineMappings = [];
    session.caretRow = 0;
    session.caretCol = 0;
    session.isDirty = false;
    session.isOpen = true;
    session.isDraggingSelection = false;
    selection.clear();

    resetSearchControls();
    applyInitialWindowBounds();
    modalEl.classList.remove('hidden');
    updateHeader();
    updateSaveButton();
    updateWindowToggleButton();
    renderEditor();
    hiddenInput.focus();
}

function bindModalEvents() {
    document.getElementById('btn-text-editor-close').addEventListener('click', closeTextEditor);
    saveButton.addEventListener('click', saveCurrentFile);
    sizeToggleButton.addEventListener('click', toggleWindowSize);
    document.getElementById('btn-text-editor-apply').addEventListener('click', applyReplaceAll);
    document.getElementById('btn-text-editor-clear').addEventListener('click', clearSearch);
    nameInput.addEventListener('input', () => {
        session.downloadName = sanitizeDownloadName(nameInput.value || 'untitled.txt');
        if (nameInput.value !== session.downloadName) {
            nameInput.value = session.downloadName;
        }
    });

    displaySelect.addEventListener('change', () => {
        session.displayMode = displaySelect.value;
        renderEditor();
    });

    findInput.addEventListener('input', updateSearchFromInputs);
    replaceInput.addEventListener('keydown', handleSearchFieldKeyDown);
    findInput.addEventListener('keydown', handleSearchFieldKeyDown);
    regexCheckbox.addEventListener('change', updateSearchFromInputs);
    caseCheckbox.addEventListener('change', updateSearchFromInputs);

    modalEl.addEventListener('mousedown', event => {
        if (event.target === modalEl) {
            hiddenInput.focus();
        }
    });

    headerEl.addEventListener('mousedown', beginWindowDrag);
    headerEl.addEventListener('dblclick', event => {
        if (event.target.closest('button,select,input,label')) return;
        toggleWindowSize();
    });

    surfaceEl.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    surfaceEl.addEventListener('focus', () => hiddenInput.focus());
    hiddenInput.addEventListener('keydown', handleKeyDown);
    hiddenInput.addEventListener('input', handleInput);
}

function bindSourceEditorEvents() {
    const renameSurface = document.getElementById('editor');
    if (!renameSurface) return;

    renameSurface.addEventListener('dblclick', async event => {
        const lineEl = event.target.closest('.editor-line');
        if (!lineEl) return;

        const row = Number(lineEl.dataset.row);
        const activeFile = getFileFromSourceRow(row);
        if (activeFile) {
            await openTextFileEditor(activeFile);
        }
    });
}

function getFileFromSourceRow(row) {
    const { visibleFiles } = getState();
    return visibleFiles[row] || null;
}

function createHiddenInput() {
    hiddenInput = document.createElement('textarea');
    hiddenInput.className = 'editor-hidden-input';
    hiddenInput.setAttribute('autocomplete', 'off');
    hiddenInput.setAttribute('autocorrect', 'off');
    hiddenInput.setAttribute('spellcheck', 'false');
    surfaceEl.appendChild(hiddenInput);
}

function measureCharWidth() {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;font-family:'Consolas','Courier New',monospace;font-size:13px;white-space:pre;`;
    probe.textContent = 'X'.repeat(100);
    document.body.appendChild(probe);
    charWidth = probe.getBoundingClientRect().width / 100;
    document.body.removeChild(probe);
}

function updateHeader() {
    const isStandalone = session.mode === 'standalone';
    nameInput.classList.toggle('hidden', !isStandalone);
    pathEl.classList.toggle('hidden', isStandalone);

    if (isStandalone) {
        nameInput.value = session.downloadName;
        pathEl.textContent = 'Blank editor mode';
        return;
    }

    pathEl.textContent = `${session.file.path}${session.isDirty ? ' • unsaved changes' : ''}`;
}

function updateSaveButton() {
    if (session.mode === 'standalone') {
        saveButton.textContent = '⬇ Download';
        saveButton.title = 'Download file';
        return;
    }

    saveButton.textContent = '💾 Save File';
    saveButton.title = 'Save file';
}

function updateWindowToggleButton() {
    sizeToggleButton.textContent = session.isMaximized ? '❐' : '□';
    sizeToggleButton.title = session.isMaximized ? 'Restore' : 'Maximize';
}

function renderEditor() {
    const scrollTop = scrollEl.scrollTop;
    const scrollLeft = scrollEl.scrollLeft;
    const lines = getRenderedLines();

    clampCaret(lines.length);
    buildLineMappings(lines);
    renderLineNumbers(lines.length);
    renderLines(lines);
    renderSelectionOverlays();
    updateStatus();

    scrollEl.scrollTop = scrollTop;
    scrollEl.scrollLeft = scrollLeft;
}

function getRenderedLines() {
    return session.displayMode === 'old' ? session.originalLines : session.currentLines;
}

function clampCaret(lineCount) {
    if (lineCount <= 0) {
        session.caretRow = 0;
        session.caretCol = 0;
        selection.clear();
        return;
    }

    session.caretRow = Math.max(0, Math.min(session.caretRow, lineCount - 1));
    const lineLength = (getRenderedLines()[session.caretRow] || '').length;
    session.caretCol = Math.max(0, Math.min(session.caretCol, lineLength));
    if (selection.active) {
        selection.clampToLines(getRenderedLines());
    }
}

function buildLineMappings(lines) {
    if (session.displayMode !== 'green-red') {
        session.lineMappings = [];
        return;
    }

    session.lineMappings = lines.map((line, index) => {
        const originalLine = session.originalLines[index] || '';
        if (line === originalLine) return null;

        const segments = computeCharDiff(originalLine, line);
        const modelToVisual = [];
        const visualToModel = [];
        let modelCol = 0;
        let visualCol = 0;

        for (const segment of segments) {
            if (segment.type === 'same' || segment.type === 'added') {
                for (let i = 0; i < segment.text.length; i++) {
                    modelToVisual[modelCol] = visualCol;
                    visualToModel[visualCol] = modelCol;
                    modelCol++;
                    visualCol++;
                }
                continue;
            }

            for (let i = 0; i < segment.text.length; i++) {
                visualToModel[visualCol] = modelCol;
                visualCol++;
            }
        }

        modelToVisual[modelCol] = visualCol;
        visualToModel[visualCol] = modelCol;
        return { modelToVisual, visualToModel };
    });
}

function renderLineNumbers(count) {
    lineNumbersEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const lineEl = document.createElement('div');
        lineEl.className = 'line-number';
        lineEl.textContent = i + 1;
        lineNumbersEl.appendChild(lineEl);
    }
}

function renderLines(lines) {
    const currentNodes = Array.from(surfaceEl.querySelectorAll('.editor-line'));
    while (currentNodes.length > lines.length) {
        currentNodes.pop().remove();
    }

    for (let i = 0; i < lines.length; i++) {
        const lineEl = currentNodes[i] || createLineElement();
        const currentLine = session.currentLines[i] || '';
        const originalLine = session.originalLines[i] || '';
        const renderedLine = lines[i] || '';
        const isModified = currentLine !== originalLine;

        lineEl.dataset.row = i;
        lineEl.classList.toggle('modified', isModified);
        lineEl.classList.toggle('text-editor-line', true);
        lineEl.classList.toggle('is-modified', isModified);
        lineEl.classList.toggle('is-readonly', session.displayMode === 'old');

        let contentHtml = '';
        if (session.displayMode === 'old') {
            contentHtml = renderWithSearchHighlight(renderedLine);
        } else if (session.displayMode === 'new' || !isModified) {
            contentHtml = renderWithSearchHighlight(renderedLine);
        } else {
            contentHtml = renderDiffHtml(computeCharDiff(originalLine, currentLine), session.displayMode);
        }

        lineEl.innerHTML = `<span class="editor-line-text">${contentHtml}</span>`;
        if (session.displayMode !== 'new' && session.displayMode !== 'old' && isModified) {
            applySearchHighlightToElement(lineEl.querySelector('.editor-line-text'));
        }

        if (!lineEl.parentNode || lineEl.parentNode !== surfaceEl) {
            surfaceEl.insertBefore(lineEl, hiddenInput);
        }
    }
}

function createLineElement() {
    const lineEl = document.createElement('div');
    lineEl.className = 'editor-line';
    return lineEl;
}

function renderSelectionOverlays() {
    clearOverlays();
    if (!selection.active || selection.isCollapsed()) {
        renderCaret();
        return;
    }

    for (let row = selection.minRow; row <= selection.maxRow; row++) {
        const minCol = modelToVisualCol(row, selection.minCol);
        const maxCol = modelToVisualCol(row, selection.maxCol);
        const highlight = document.createElement('div');
        highlight.className = 'block-selection-highlight';
        highlight.style.top = `${row * 20 + 4}px`;
        highlight.style.left = `${minCol * charWidth + 8}px`;
        highlight.style.width = `${Math.max(maxCol - minCol, 1) * charWidth}px`;
        highlight.style.height = '20px';
        surfaceEl.appendChild(highlight);
    }

    renderCaret();
}

function renderCaret() {
    const caret = document.createElement('div');
    caret.className = 'editor-caret';
    caret.style.top = `${session.caretRow * 20 + 4}px`;
    caret.style.left = `${modelToVisualCol(session.caretRow, session.caretCol) * charWidth + 8}px`;
    surfaceEl.appendChild(caret);
}

function clearOverlays() {
    surfaceEl.querySelectorAll('.block-selection-highlight, .editor-caret').forEach(node => node.remove());
}

function updateStatus() {
    const modifiedLines = countModifiedLines();
    const extraRemoved = Math.max(session.originalLines.length - session.currentLines.length, 0);
    const modeText = session.mode === 'standalone' ? 'Blank editor' : 'File editor';
    if (selection.active && !selection.isCollapsed()) {
        statusEl.textContent = `${modeText} • Sel ${selection.rowCount}×${selection.colSpan} • ${modifiedLines} modified lines${extraRemoved ? ` • ${extraRemoved} deleted line${extraRemoved !== 1 ? 's' : ''} not shown inline` : ''}`;
        return;
    }

    statusEl.textContent = `${modeText} • Ln ${session.caretRow + 1}, Col ${session.caretCol + 1} • ${modifiedLines} modified lines${session.isDirty ? ' • unsaved' : ''}${extraRemoved ? ` • ${extraRemoved} deleted line${extraRemoved !== 1 ? 's' : ''} not shown inline` : ''}`;
}

function countModifiedLines() {
    const maxLineCount = Math.max(session.originalLines.length, session.currentLines.length);
    let changed = 0;
    for (let i = 0; i < maxLineCount; i++) {
        if ((session.originalLines[i] || '') !== (session.currentLines[i] || '')) {
            changed++;
        }
    }
    return changed;
}

function handleMouseDown(event) {
    if (!session.isOpen) return;
    event.preventDefault();
    hiddenInput.focus();

    const lines = getRenderedLines();
    if (!lines.length) return;

    const position = pixelToRowCol(surfaceEl, event.clientX, event.clientY, charWidth);
    const row = Math.max(0, Math.min(position.row, lines.length - 1));
    const col = visualToModelCol(row, position.col);

    session.caretRow = row;
    session.caretCol = Math.max(0, Math.min(col, (lines[row] || '').length));

    if (event.altKey && session.displayMode !== 'old') {
        selection.begin(session.caretRow, session.caretCol);
        session.isDraggingSelection = true;
    } else {
        selection.clear();
        session.isDraggingSelection = false;
    }

    renderSelectionOverlays();
    updateStatus();
}

function handleMouseMove(event) {
    if (session.dragState) {
        dragWindow(event);
        return;
    }

    if (!session.isDraggingSelection) return;
    const lines = getRenderedLines();
    if (!lines.length) return;

    const position = pixelToRowCol(surfaceEl, event.clientX, event.clientY, charWidth);
    const row = Math.max(0, Math.min(position.row, lines.length - 1));
    const col = visualToModelCol(row, position.col);
    selection.moveTo(row, Math.max(0, col));
    session.caretRow = row;
    session.caretCol = Math.max(0, col);
    renderSelectionOverlays();
    updateStatus();
}

function handleMouseUp() {
    session.isDraggingSelection = false;
    session.dragState = null;
}

function handleKeyDown(event) {
    if (!session.isOpen) return;

    if (handleCommandShortcut(event)) return;

    const lines = getRenderedLines();
    if (!lines.length) return;

    if (handleNavigationKeys(event, lines)) return;
    if (handleClipboardKeys(event, lines)) return;
    if (handleEditingKeys(event, lines)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll(lines);
    }
}

function handleCommandShortcut(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCurrentFile();
        return true;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        findInput.focus();
        findInput.select();
        return true;
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        closeTextEditor();
        return true;
    }

    return false;
}

function handleNavigationKeys(event, lines) {
    const extendSelection = event.altKey && event.shiftKey && session.displayMode !== 'old';
    const handlers = {
        ArrowLeft: () => moveCaret(0, -1, extendSelection, lines),
        ArrowRight: () => moveCaret(0, 1, extendSelection, lines),
        ArrowUp: () => moveCaret(-1, 0, extendSelection, lines),
        ArrowDown: () => moveCaret(1, 0, extendSelection, lines),
        Home: () => moveToLineStart(extendSelection, lines),
        End: () => moveToLineEnd(extendSelection, lines),
    };

    const handler = handlers[event.key];
    if (!handler) return false;

    event.preventDefault();
    handler();
    return true;
}

function moveCaret(rowDelta, colDelta, extendSelection, lines) {
    const nextRow = Math.max(0, Math.min(session.caretRow + rowDelta, lines.length - 1));
    const nextCol = Math.max(0, session.caretCol + colDelta);

    if (extendSelection) {
        if (!selection.active) {
            selection.begin(session.caretRow, session.caretCol);
        }
        selection.moveTo(nextRow, nextCol);
    } else {
        selection.clear();
    }

    session.caretRow = nextRow;
    session.caretCol = Math.min(nextCol, (lines[nextRow] || '').length);
    renderSelectionOverlays();
    updateStatus();
}

function moveToLineStart(extendSelection, lines) {
    if (extendSelection) {
        if (!selection.active) {
            selection.begin(session.caretRow, session.caretCol);
        }
        selection.moveTo(session.caretRow, 0);
    } else {
        selection.clear();
    }
    session.caretCol = 0;
    renderSelectionOverlays();
    updateStatus();
}

function moveToLineEnd(extendSelection, lines) {
    const endCol = (lines[session.caretRow] || '').length;
    if (extendSelection) {
        if (!selection.active) {
            selection.begin(session.caretRow, session.caretCol);
        }
        selection.moveTo(session.caretRow, endCol);
    } else {
        selection.clear();
    }
    session.caretCol = endCol;
    renderSelectionOverlays();
    updateStatus();
}

function handleClipboardKeys(event, lines) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (hasBlockWidth()) {
            void writeClipboardText(selection.extractTextFromLines(session.currentLines));
        }
        return true;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        if (hasBlockWidth()) {
            void cutBlockSelection();
        }
        return true;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void pasteClipboard();
        return true;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoContentHistory();
        return true;
    }

    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        redoContentHistory();
        return true;
    }

    return false;
}

function handleEditingKeys(event, lines) {
    if (session.displayMode === 'old') {
        return false;
    }

    if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
        return true;
    }

    if (event.key === 'Delete') {
        event.preventDefault();
        handleDelete();
        return true;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        insertTextAtCaret('\n');
        return true;
    }

    if (event.key === 'Tab') {
        event.preventDefault();
        insertTextAtCaret('    ');
        return true;
    }

    return false;
}

function handleInput() {
    const text = hiddenInput.value;
    hiddenInput.value = '';
    if (!text || session.displayMode === 'old') return;

    if (hasBlockWidth()) {
        replaceBlockSelection(text);
        return;
    }

    if (hasMultiRowCursor()) {
        insertTextOnMultipleRows(text);
        return;
    }

    insertTextAtCaret(text);
}

function insertTextAtCaret(text) {
    const row = Math.max(0, Math.min(session.caretRow, session.currentLines.length - 1));
    const line = session.currentLines[row] || '';
    const paddedLine = line.padEnd(session.caretCol, ' ');
    const parts = splitClipboardLines(text);

    if (parts.length === 1) {
        const updatedLine = paddedLine.substring(0, session.caretCol) + text + paddedLine.substring(session.caretCol);
        const nextLines = [...session.currentLines];
        nextLines[row] = updatedLine;
        commitContentChange(nextLines);
        session.caretCol += text.length;
        selection.clear();
        renderEditor();
        return;
    }

    const before = paddedLine.substring(0, session.caretCol);
    const after = paddedLine.substring(session.caretCol);
    const nextLines = [
        ...session.currentLines.slice(0, row),
        before + parts[0],
        ...parts.slice(1, -1),
        parts[parts.length - 1] + after,
        ...session.currentLines.slice(row + 1),
    ];

    commitContentChange(nextLines);
    session.caretRow = row + parts.length - 1;
    session.caretCol = parts[parts.length - 1].length;
    selection.clear();
    renderEditor();
}

function insertTextOnMultipleRows(text) {
    const nextLines = [...session.currentLines];
    const startRow = selection.minRow;
    const endRow = selection.maxRow;
    for (let row = startRow; row <= endRow; row++) {
        const line = nextLines[row] || '';
        const paddedLine = line.padEnd(session.caretCol, ' ');
        nextLines[row] = paddedLine.substring(0, session.caretCol) + text + paddedLine.substring(session.caretCol);
    }

    commitContentChange(nextLines);
    session.caretCol += text.length;
    selection.begin(startRow, session.caretCol);
    selection.moveTo(endRow, session.caretCol);
    renderEditor();
}

function replaceBlockSelection(text) {
    const textLines = splitClipboardLines(text);
    const pasteLines = buildPasteLines(textLines, selection.rowCount);
    const result = selection.replaceTextInLines(session.currentLines, pasteLines);
    const minRow = selection.minRow;
    const maxRow = selection.maxRow;
    const nextCol = selection.minCol + (pasteLines[0] || '').length;

    commitContentChange(result);
    session.caretRow = minRow;
    session.caretCol = nextCol;
    preserveMultiRowCursor(minRow, maxRow, nextCol);
    renderEditor();
}

function handleBackspace() {
    if (hasBlockWidth()) {
        deleteSelectedBlock();
        return;
    }

    if (hasMultiRowCursor()) {
        const nextLines = [...session.currentLines];
        for (let row = selection.minRow; row <= selection.maxRow; row++) {
            const line = nextLines[row] || '';
            if (session.caretCol > 0 && session.caretCol <= line.length) {
                nextLines[row] = line.substring(0, session.caretCol - 1) + line.substring(session.caretCol);
            }
        }
        commitContentChange(nextLines);
        session.caretCol = Math.max(0, session.caretCol - 1);
        selection.begin(selection.minRow, session.caretCol);
        selection.moveTo(selection.maxRow, session.caretCol);
        renderEditor();
        return;
    }

    if (session.caretCol > 0) {
        const nextLines = [...session.currentLines];
        const line = nextLines[session.caretRow] || '';
        nextLines[session.caretRow] = line.substring(0, session.caretCol - 1) + line.substring(session.caretCol);
        commitContentChange(nextLines);
        session.caretCol--;
        renderEditor();
        return;
    }

    if (session.caretRow === 0) {
        return;
    }

    const nextLines = [...session.currentLines];
    const previousLine = nextLines[session.caretRow - 1] || '';
    const currentLine = nextLines[session.caretRow] || '';
    nextLines.splice(session.caretRow - 1, 2, previousLine + currentLine);
    commitContentChange(nextLines);
    session.caretRow--;
    session.caretCol = previousLine.length;
    selection.clear();
    renderEditor();
}

function handleDelete() {
    if (hasBlockWidth()) {
        deleteSelectedBlock();
        return;
    }

    if (hasMultiRowCursor()) {
        const nextLines = [...session.currentLines];
        for (let row = selection.minRow; row <= selection.maxRow; row++) {
            const line = nextLines[row] || '';
            if (session.caretCol < line.length) {
                nextLines[row] = line.substring(0, session.caretCol) + line.substring(session.caretCol + 1);
            }
        }
        commitContentChange(nextLines);
        selection.begin(selection.minRow, session.caretCol);
        selection.moveTo(selection.maxRow, session.caretCol);
        renderEditor();
        return;
    }

    const nextLines = [...session.currentLines];
    const line = nextLines[session.caretRow] || '';
    if (session.caretCol < line.length) {
        nextLines[session.caretRow] = line.substring(0, session.caretCol) + line.substring(session.caretCol + 1);
        commitContentChange(nextLines);
        renderEditor();
        return;
    }

    if (session.caretRow >= nextLines.length - 1) {
        return;
    }

    nextLines.splice(session.caretRow, 2, line + (nextLines[session.caretRow + 1] || ''));
    commitContentChange(nextLines);
    renderEditor();
}

function deleteSelectedBlock() {
    const result = selection.deleteTextFromLines(session.currentLines);
    const minRow = selection.minRow;
    const maxRow = selection.maxRow;
    const nextCol = selection.minCol;
    commitContentChange(result);
    session.caretRow = minRow;
    session.caretCol = nextCol;
    preserveMultiRowCursor(minRow, maxRow, nextCol);
    renderEditor();
}

async function cutBlockSelection() {
    const text = selection.extractTextFromLines(session.currentLines);
    await writeClipboardText(text);
    deleteSelectedBlock();
}

async function pasteClipboard() {
    const text = await readClipboardText();
    if (!text || session.displayMode === 'old') return;

    const clipLines = splitClipboardLines(text);
    if (hasBlockWidth()) {
        const pasteLines = buildPasteLines(clipLines, selection.rowCount);
        const result = selection.replaceTextInLines(session.currentLines, pasteLines);
        const minRow = selection.minRow;
        const maxRow = selection.maxRow;
        const nextCol = selection.minCol + (pasteLines[0] || '').length;
        commitContentChange(result);
        session.caretRow = minRow;
        session.caretCol = nextCol;
        preserveMultiRowCursor(minRow, maxRow, nextCol);
        renderEditor();
        return;
    }

    if (hasMultiRowCursor()) {
        const pasteLines = buildPasteLines(clipLines, selection.rowCount);
        const nextLines = [...session.currentLines];
        for (let row = selection.minRow; row <= selection.maxRow; row++) {
            const lineIndex = row - selection.minRow;
            const line = nextLines[row] || '';
            const paddedLine = line.padEnd(session.caretCol, ' ');
            nextLines[row] = paddedLine.substring(0, session.caretCol) + (pasteLines[lineIndex] || '') + paddedLine.substring(session.caretCol);
        }
        commitContentChange(nextLines);
        session.caretCol += (pasteLines[0] || '').length;
        selection.begin(selection.minRow, session.caretCol);
        selection.moveTo(selection.maxRow, session.caretCol);
        renderEditor();
        return;
    }

    insertTextAtCaret(text);
}

function selectAll(lines) {
    if (!lines.length) return;
    const maxCol = Math.max(...lines.map(line => line.length), 0);
    selection.begin(0, 0);
    selection.moveTo(lines.length - 1, maxCol);
    session.caretRow = lines.length - 1;
    session.caretCol = maxCol;
    renderSelectionOverlays();
    updateStatus();
}

function hasBlockWidth() {
    return selection.active && selection.colSpan > 0;
}

function hasMultiRowCursor() {
    return selection.active && selection.rowCount > 1 && selection.colSpan === 0;
}

function preserveMultiRowCursor(minRow, maxRow, col) {
    if (maxRow > minRow) {
        selection.begin(minRow, col);
        selection.moveTo(maxRow, col);
    } else {
        selection.clear();
    }
}

function commitContentChange(nextLines) {
    const normalized = normalizeLines(nextLines);
    if (areLinesEqual(session.currentLines, normalized)) {
        return;
    }

    saveHistorySnapshot();
    session.currentLines = normalized;
    session.isDirty = !areLinesEqual(session.currentLines, session.originalLines);
    updateHeader();
}

function saveHistorySnapshot() {
    const snapshot = [...session.currentLines];
    const last = session.historyPast[session.historyPast.length - 1];
    if (last && areLinesEqual(last, snapshot)) {
        return;
    }

    session.historyPast.push(snapshot);
    if (session.historyPast.length > 150) {
        session.historyPast.shift();
    }
    session.historyFuture = [];
}

function undoContentHistory() {
    if (session.historyPast.length === 0) return;
    session.historyFuture.push([...session.currentLines]);
    session.currentLines = normalizeLines(session.historyPast.pop());
    session.isDirty = !areLinesEqual(session.currentLines, session.originalLines);
    updateHeader();
    clampCaret(session.currentLines.length);
    renderEditor();
    showToast('Undo text change');
}

function redoContentHistory() {
    if (session.historyFuture.length === 0) return;
    session.historyPast.push([...session.currentLines]);
    session.currentLines = normalizeLines(session.historyFuture.pop());
    session.isDirty = !areLinesEqual(session.currentLines, session.originalLines);
    updateHeader();
    clampCaret(session.currentLines.length);
    renderEditor();
    showToast('Redo text change');
}

async function saveCurrentFile() {
    if (session.mode === 'standalone') {
        downloadCurrentContents();
        return;
    }

    if (!session.file) return;

    const text = joinLines(session.currentLines, session.eol);
    const saved = await writeTextFile(session.file, text, {
        encoding: session.encoding,
        hasBom: session.hasBom,
    });
    if (!saved) {
        return;
    }

    session.originalLines = [...session.currentLines];
    session.isDirty = false;
    session.historyPast = [];
    session.historyFuture = [];
    updateHeader();
    renderEditor();
    showToast(`Saved ${session.file.name}`);
}

function downloadCurrentContents() {
    const text = joinLines(session.currentLines, session.eol);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const downloadName = sanitizeDownloadName(nameInput.value || session.downloadName || 'untitled.txt');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    session.downloadName = downloadName;
    session.originalLines = [...session.currentLines];
    session.isDirty = false;
    session.historyPast = [];
    session.historyFuture = [];
    updateHeader();
    renderEditor();
    showToast(`Downloaded ${downloadName}`);
}

function closeTextEditor() {
    if (session.isDirty && !window.confirm('Discard unsaved text changes?')) {
        return;
    }

    modalEl.classList.add('hidden');
    selection.clear();
    session.file = null;
    session.mode = 'file';
    session.downloadName = 'untitled.txt';
    session.isOpen = false;
    session.isDirty = false;
    session.isDraggingSelection = false;

    if (!getState().directoryHandle) {
        const welcomeModal = document.getElementById('welcome-modal');
        if (welcomeModal) {
            welcomeModal.classList.remove('hidden');
        }
    }
}

function updateSearchFromInputs() {
    const pattern = findInput.value;
    if (!pattern) {
        clearSearchState();
        renderEditor();
        return;
    }

    try {
        const flags = caseCheckbox.checked ? 'g' : 'gi';
        const source = regexCheckbox.checked ? pattern : escapeRegex(pattern);
        session.searchPattern = new RegExp(source, flags);
        findInput.classList.remove('invalid');
        const count = getSearchMatchCount();
        searchInfoEl.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
        renderEditor();
    } catch {
        session.searchPattern = null;
        findInput.classList.add('invalid');
        searchInfoEl.textContent = 'Invalid regex';
    }
}

function applyReplaceAll() {
    const pattern = findInput.value;
    if (!pattern || session.displayMode === 'old') return;

    let regex;
    try {
        regex = new RegExp(regexCheckbox.checked ? pattern : escapeRegex(pattern), caseCheckbox.checked ? 'g' : 'gi');
    } catch {
        findInput.classList.add('invalid');
        searchInfoEl.textContent = 'Invalid regex';
        return;
    }

    const originalText = joinLines(session.currentLines, session.eol);
    const replacedText = originalText.replace(regex, replaceInput.value);
    if (replacedText === originalText) {
        showToast('No matches replaced', 2800, 'toast-warning');
        return;
    }

    const matchCount = countMatches(originalText, regex);
    commitContentChange(parseTextToLines(replacedText));
    showToast(`Replaced ${matchCount} match${matchCount !== 1 ? 'es' : ''}`);
    renderEditor();
    updateSearchFromInputs();
}

function clearSearch() {
    resetSearchControls();
    clearSearchState();
    renderEditor();
}

function resetSearchControls() {
    findInput.value = '';
    replaceInput.value = '';
    regexCheckbox.checked = false;
    caseCheckbox.checked = false;
    clearSearchState();
}

function clearSearchState() {
    session.searchPattern = null;
    searchInfoEl.textContent = '';
    findInput.classList.remove('invalid');
}

function renderWithSearchHighlight(text) {
    if (!session.searchPattern) {
        return escapeHtml(text);
    }

    let result = '';
    let lastIndex = 0;
    const regex = new RegExp(session.searchPattern.source, session.searchPattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
        result += escapeHtml(text.substring(lastIndex, match.index));
        result += `<span class="search-highlight">${escapeHtml(match[0])}</span>`;
        lastIndex = regex.lastIndex;
        if (match[0].length === 0) {
            regex.lastIndex++;
            lastIndex = regex.lastIndex;
        }
        if (!regex.global) break;
    }

    result += escapeHtml(text.substring(lastIndex));
    return result;
}

function applySearchHighlightToElement(lineEl) {
    if (!session.searchPattern || !lineEl) return;

    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
        highlightTextNode(textNode);
    }
}

function highlightTextNode(textNode) {
    const regex = new RegExp(session.searchPattern.source, session.searchPattern.flags);
    const text = textNode.textContent;
    const match = regex.exec(text);
    if (!match) return;

    const before = text.substring(0, match.index);
    const after = text.substring(match.index + match[0].length);
    const parent = textNode.parentNode;
    const highlight = document.createElement('span');
    highlight.className = 'search-highlight';
    highlight.textContent = match[0];

    if (before) {
        parent.insertBefore(document.createTextNode(before), textNode);
    }
    parent.insertBefore(highlight, textNode);
    if (after) {
        const afterNode = document.createTextNode(after);
        parent.insertBefore(afterNode, textNode);
        highlightTextNode(afterNode);
    }
    parent.removeChild(textNode);
}

function getSearchMatchCount() {
    if (!session.searchPattern) return 0;
    const lines = getRenderedLines();
    let count = 0;
    for (const line of lines) {
        const regex = new RegExp(session.searchPattern.source, session.searchPattern.flags);
        let match;
        while ((match = regex.exec(line)) !== null) {
            count++;
            if (!regex.global) break;
            if (match[0].length === 0) {
                regex.lastIndex++;
            }
        }
    }
    return count;
}

function handleSearchFieldKeyDown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        applyReplaceAll();
    }
}

function beginWindowDrag(event) {
    if (session.isMaximized || event.target.closest('button,select,input,label')) {
        return;
    }

    const rect = windowEl.getBoundingClientRect();
    session.dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
    };
}

function dragWindow(event) {
    if (!session.dragState || session.isMaximized) return;

    const nextLeft = Math.max(8, Math.min(window.innerWidth - windowEl.offsetWidth - 8, event.clientX - session.dragState.offsetX));
    const nextTop = Math.max(8, Math.min(window.innerHeight - windowEl.offsetHeight - 8, event.clientY - session.dragState.offsetY));
    windowEl.style.left = `${nextLeft}px`;
    windowEl.style.top = `${nextTop}px`;
}

function toggleWindowSize() {
    if (!session.isOpen) return;

    if (!session.isMaximized) {
        session.restoreBounds = getWindowBounds();
        session.isMaximized = true;
        windowEl.classList.add('is-maximized');
        windowEl.style.left = '24px';
        windowEl.style.top = '24px';
        windowEl.style.width = `calc(100vw - 48px)`;
        windowEl.style.height = `calc(100vh - 48px)`;
        updateWindowToggleButton();
        return;
    }

    session.isMaximized = false;
    windowEl.classList.remove('is-maximized');
    const bounds = session.restoreBounds || buildCenteredBounds(Math.min(window.innerWidth - 32, 900), Math.min(window.innerHeight - 32, 620));
    applyWindowBounds(bounds);
    updateWindowToggleButton();
}

function applyInitialWindowBounds() {
    session.isMaximized = false;
    windowEl.classList.remove('is-maximized');
    updateWindowToggleButton();

    if (session.restoreBounds) {
        applyWindowBounds(session.restoreBounds);
        return;
    }

    const width = Math.min(window.innerWidth - 32, 1080);
    const height = Math.min(window.innerHeight - 32, 760);
    applyWindowBounds(buildCenteredBounds(width, height));
}

function buildCenteredBounds(width, height) {
    return {
        width,
        height,
        left: Math.max(8, Math.round((window.innerWidth - width) / 2)),
        top: Math.max(8, Math.round((window.innerHeight - height) / 2)),
    };
}

function getWindowBounds() {
    const rect = windowEl.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
    };
}

function applyWindowBounds(bounds) {
    windowEl.style.width = `${bounds.width}px`;
    windowEl.style.height = `${bounds.height}px`;
    windowEl.style.left = `${bounds.left}px`;
    windowEl.style.top = `${bounds.top}px`;
}

function modelToVisualCol(row, modelCol) {
    const mapping = session.lineMappings[row];
    if (!mapping) {
        return modelCol;
    }

    if (modelCol >= mapping.modelToVisual.length) {
        const lastIndex = mapping.modelToVisual.length - 1;
        return mapping.modelToVisual[lastIndex] + (modelCol - lastIndex);
    }

    return mapping.modelToVisual[modelCol];
}

function visualToModelCol(row, visualCol) {
    const mapping = session.lineMappings[row];
    if (!mapping) {
        return visualCol;
    }

    if (visualCol >= mapping.visualToModel.length) {
        const lastIndex = mapping.visualToModel.length - 1;
        return mapping.visualToModel[lastIndex] + (visualCol - lastIndex);
    }

    return mapping.visualToModel[visualCol];
}

function parseTextToLines(text) {
    if (!text) {
        return [''];
    }
    return text.split(/\r?\n/);
}

function detectEol(text) {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

function joinLines(lines, eol) {
    return normalizeLines(lines).join(eol);
}

function normalizeLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return [''];
    }
    return lines.map(line => String(line));
}

function areLinesEqual(left, right) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false;
    }
    return true;
}

function countMatches(text, regex) {
    const localRegex = new RegExp(regex.source, regex.flags);
    let count = 0;
    let match;
    while ((match = localRegex.exec(text)) !== null) {
        count++;
        if (!localRegex.global) break;
        if (match[0].length === 0) {
            localRegex.lastIndex++;
        }
    }
    return count;
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sanitizeDownloadName(name) {
    const trimmed = String(name || '').trim();
    const fallback = 'untitled.txt';
    const normalized = (trimmed || fallback).replace(/[\\/:*?"<>|]/g, '_');
    return normalized || fallback;
}

function showToast(message, duration = 3000, className = '') {
    if (window.showToast) {
        window.showToast(message, duration, className);
    }
}