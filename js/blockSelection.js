// ===== Block (Rectangular) Selection =====
import { getState } from './state.js';

export class BlockSelection {
    constructor() {
        this.active = false;
        this.startRow = 0;
        this.startCol = 0;
        this.endRow = 0;
        this.endCol = 0;
    }

    get minRow() { return Math.min(this.startRow, this.endRow); }
    get maxRow() { return Math.max(this.startRow, this.endRow); }
    get minCol() { return Math.min(this.startCol, this.endCol); }
    get maxCol() { return Math.max(this.startCol, this.endCol); }

    get rowCount() { return this.maxRow - this.minRow + 1; }
    get colSpan() { return this.maxCol - this.minCol; }

    begin(row, col) {
        this.active = true;
        this.startRow = row;
        this.startCol = col;
        this.endRow = row;
        this.endCol = col;
    }

    moveTo(row, col) {
        this.endRow = row;
        this.endCol = col;
    }

    clear() {
        this.active = false;
    }

    isCollapsed() {
        return this.startRow === this.endRow && this.startCol === this.endCol;
    }

    clampToLines(lines) {
        this.startRow = clampIndex(this.startRow, lines.length);
        this.endRow = clampIndex(this.endRow, lines.length);
    }

    extractTextFromLines(lines) {
        const rows = [];
        for (let r = this.minRow; r <= this.maxRow; r++) {
            const line = lines[r] || '';
            const start = Math.min(this.minCol, line.length);
            const end = Math.min(this.maxCol, line.length);
            rows.push(line.substring(start, end));
        }
        return rows.join('\n');
    }

    deleteTextFromLines(lines) {
        const result = [...lines];
        for (let r = this.minRow; r <= this.maxRow; r++) {
            const line = result[r] || '';
            const before = line.substring(0, Math.min(this.minCol, line.length));
            const after = line.substring(Math.min(this.maxCol, line.length));
            result[r] = before + after;
        }
        return result;
    }

    insertTextIntoLines(lines, textLines) {
        const result = [...lines];
        const multiLine = textLines.length > 1;

        for (let r = this.minRow; r <= this.maxRow; r++) {
            const lineIndex = r - this.minRow;
            const insertText = multiLine
                ? (textLines[lineIndex] || '')
                : (textLines[0] || '');

            result[r] = spliceString(
                result[r] || '',
                this.minCol,
                this.maxCol,
                insertText
            );
        }

        return result;
    }

    replaceTextInLines(lines, textLines) {
        const deleted = this.deleteTextFromLines(lines);
        const collapsed = new BlockSelection();
        collapsed.active = true;
        collapsed.startRow = this.minRow;
        collapsed.startCol = this.minCol;
        collapsed.endRow = this.maxRow;
        collapsed.endCol = this.minCol;
        return collapsed.insertTextIntoLines(deleted, textLines);
    }
}

function clampIndex(index, length) {
    return Math.max(0, Math.min(index, length - 1));
}

function spliceString(str, start, end, insert) {
    const paddedStr = str.padEnd(end, ' ');
    const before = paddedStr.substring(0, Math.min(start, paddedStr.length));
    const after = paddedStr.substring(Math.min(end, paddedStr.length));
    return before + insert + after;
}

// ===== Coordinate Calculation =====

export function pixelToRowCol(editorEl, x, y, charWidth) {
    const rect = editorEl.getBoundingClientRect();

    const relativeY = y - rect.top - 4;
    const relativeX = x - rect.left - 8;

    const row = Math.max(0, Math.floor(relativeY / 20));
    const col = Math.max(0, Math.round(relativeX / charWidth));

    return { row, col };
}

export function rowColToPixel(row, col, charWidth) {
    return {
        x: col * charWidth + 8,
        y: row * 20 + 4,
    };
}
