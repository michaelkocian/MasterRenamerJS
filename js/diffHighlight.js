// ===== Diff Highlighting =====

export function computeCharDiff(original, modified) {
    if (original === modified) {
        return [{ type: 'same', text: modified }];
    }

    const ops = buildEditOps(original, modified);
    return opsToSegments(ops, original, modified);
}

function buildEditOps(original, modified) {
    const n = original.length;
    const m = modified.length;
    const dp = createDpTable(n, m);
    fillDpTable(dp, original, modified, n, m);
    return backtrackOps(dp, original, modified, n, m);
}

function createDpTable(n, m) {
    const dp = [];
    for (let i = 0; i <= n; i++) {
        dp[i] = new Array(m + 1).fill(0);
        dp[i][0] = i;
    }
    for (let j = 0; j <= m; j++) {
        dp[0][j] = j;
    }
    return dp;
}

function fillDpTable(dp, original, modified, n, m) {
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (original[i - 1] === modified[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],
                    dp[i][j - 1],
                    dp[i - 1][j - 1]
                );
            }
        }
    }
}

function backtrackOps(dp, original, modified, n, m) {
    const ops = [];
    let i = n, j = m;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && original[i - 1] === modified[j - 1]) {
            ops.push({ type: 'same', char: modified[j - 1] });
            i--; j--;
        } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
            ops.push({ type: 'replace', oldChar: original[i - 1], newChar: modified[j - 1] });
            i--; j--;
        } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            ops.push({ type: 'add', char: modified[j - 1] });
            j--;
        } else {
            ops.push({ type: 'remove', char: original[i - 1] });
            i--;
        }
    }

    return ops.reverse();
}

function opsToSegments(ops, original, modified) {
    const segments = [];
    let buffer = '';
    let currentType = null;
    let pendingRemoved = '';
    let pendingAdded = '';

    function pushSegment(type, text) {
        if (!text) {
            return;
        }

        const last = segments[segments.length - 1];
        if (last && last.type === type) {
            last.text += text;
            return;
        }

        segments.push({ type, text });
    }

    function flushBuffer() {
        if (!buffer) {
            return;
        }

        pushSegment(currentType, buffer);
        buffer = '';
    }

    function flushPendingReplacement() {
        if (!pendingRemoved && !pendingAdded) {
            return;
        }

        pushSegment('removed', pendingRemoved);
        pushSegment('added', pendingAdded);
        pendingRemoved = '';
        pendingAdded = '';
    }

    for (const op of ops) {
        if (op.type === 'replace') {
            flushBuffer();
            pendingRemoved += op.oldChar;
            pendingAdded += op.newChar;
            continue;
        }

        flushPendingReplacement();
        const segType = mapOpType(op);
        const segText = mapOpText(op);

        if (segType === currentType) {
            buffer += segText;
        } else {
            flushBuffer();
            currentType = segType;
            buffer = segText;
        }
    }

    flushBuffer();
    flushPendingReplacement();
    return segments;
}

function mapOpType(op) {
    if (op.type === 'same') return 'same';
    if (op.type === 'add') return 'added';
    if (op.type === 'remove') return 'removed';
    return 'added';
}

function mapOpText(op) {
    if (op.type === 'replace') return op.newChar;
    return op.char;
}

export function renderDiffHtml(segments, displayMode) {
    return segments.map(seg => renderSegment(seg, displayMode)).join('');
}

function renderSegment(seg, mode) {
    if (seg.type === 'same') return escapeHtml(seg.text);

    if (seg.type === 'added') {
        return renderAddedSegment(seg, mode);
    }
    if (seg.type === 'removed') {
        return renderRemovedSegment(seg, mode);
    }
    return escapeHtml(seg.text);
}

function renderAddedSegment(seg, mode) {
    const showAdded = mode === 'green' || mode === 'green-red' || mode === 'green-line';
    if (showAdded) {
        return `<span class="diff-added">${escapeHtml(seg.text)}</span>`;
    }
    return escapeHtml(seg.text);
}

function renderRemovedSegment(seg, mode) {
    if (mode === 'green-red') {
        return `<span class="diff-removed">${escapeHtml(seg.text)}</span>`;
    }
    if (mode === 'green-line') {
        return '<span class="diff-delete-line">&hairsp;</span>';
    }
    return '';
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
