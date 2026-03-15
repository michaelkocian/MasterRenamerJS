// ===== Clipboard Handling =====

export async function readClipboardText() {
    try {
        return await navigator.clipboard.readText();
    } catch {
        return '';
    }
}

export async function writeClipboardText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Clipboard write failed:', err);
    }
}

export function splitClipboardLines(text) {
    return text.split('\n').map(line => line.replace(/\r$/, ''));
}

export function buildPasteLines(clipboardLines, rowCount) {
    const isMultiLine = clipboardLines.length > 1;

    if (isMultiLine && clipboardLines.length === rowCount) {
        return clipboardLines;
    }

    if (isMultiLine) {
        return padOrTrimLines(clipboardLines, rowCount);
    }

    return new Array(rowCount).fill(clipboardLines[0] || '');
}

function padOrTrimLines(lines, targetCount) {
    const result = [];
    for (let i = 0; i < targetCount; i++) {
        result.push(i < lines.length ? lines[i] : '');
    }
    return result;
}
