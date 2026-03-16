// ===== Application State =====

const state = {
    directoryHandle: null,
    allFiles: [],
    visibleFiles: [],
    originalNames: [],
    currentNames: [],
    pathMode: 'name',        // 'full', 'relative', 'name'
    displayMode: 'green-line', // 'new', 'old', 'green', 'green-red', 'green-line'
    fileScope: 'files-and-folders',   // 'folder', 'files-and-folders', 'recursive'
    sortOrder: 'name-asc',     // 'name-asc', 'name-desc', 'ext-asc', 'ext-desc'
    selectedTreeNode: null,
    charWidth: 0,
    listeners: new Map(),
    historyPast: [],
    historyFuture: [],
};

export function getState() {
    return state;
}

export function setFiles(files) {
    state.allFiles = files;
    state.originalNames = files.map(f => f.name);
    state.currentNames = [...state.originalNames];
    state.historyPast = [];
    state.historyFuture = [];
    notifyListeners('files-changed');
}

export function setVisibleFiles(files) {
    state.visibleFiles = files;
    notifyListeners('visible-files-changed');
}

export function updateFileName(index, newName) {
    if (state.currentNames[index] === newName) return;
    state.currentNames[index] = newName;
    notifyListeners('name-changed', { index, newName });
}

export function setCurrentNames(names, event = 'names-reset') {
    state.currentNames = [...names];
    notifyListeners(event);
}

export function setPathMode(mode) {
    state.pathMode = mode;
    notifyListeners('display-mode-changed');
}

export function setDisplayMode(mode) {
    state.displayMode = mode;
    notifyListeners('display-mode-changed');
}

export function setFileScope(scope) {
    state.fileScope = scope;
    notifyListeners('file-scope-changed');
}

export function setSortOrder(order) {
    state.sortOrder = order;
    notifyListeners('sort-order-changed');
}

export function setDirectoryHandle(handle) {
    state.directoryHandle = handle;
}

export function setSelectedTreeNode(path) {
    state.selectedTreeNode = path;
    notifyListeners('tree-selection-changed');
}

export function resetAllNames() {
    if (areNameListsEqual(state.currentNames, state.originalNames)) return;
    saveHistorySnapshot();
    state.currentNames = [...state.originalNames];
    notifyListeners('names-reset');
}

export function getChangedFiles() {
    const changes = [];
    for (let i = 0; i < state.allFiles.length; i++) {
        if (state.originalNames[i] !== state.currentNames[i]) {
            changes.push({
                index: i,
                file: state.allFiles[i],
                oldName: state.originalNames[i],
                newName: state.currentNames[i],
            });
        }
    }
    return changes;
}

export function commitRenames() {
    state.originalNames = [...state.currentNames];
    state.historyPast = [];
    state.historyFuture = [];
    notifyListeners('names-committed');
}

export function setCharWidth(width) {
    state.charWidth = width;
}

export function saveHistorySnapshot() {
    if (!state.currentNames.length) return false;

    const snapshot = [...state.currentNames];
    const last = state.historyPast[state.historyPast.length - 1];
    if (last && areNameListsEqual(last, snapshot)) {
        return false;
    }

    state.historyPast.push(snapshot);
    if (state.historyPast.length > 200) {
        state.historyPast.shift();
    }
    state.historyFuture = [];
    notifyListeners('history-changed');
    return true;
}

export function undoRenameHistory() {
    if (state.historyPast.length === 0) return false;
    state.historyFuture.push([...state.currentNames]);
    state.currentNames = state.historyPast.pop();
    notifyListeners('names-reset');
    notifyListeners('history-changed');
    return true;
}

export function redoRenameHistory() {
    if (state.historyFuture.length === 0) return false;
    state.historyPast.push([...state.currentNames]);
    state.currentNames = state.historyFuture.pop();
    notifyListeners('names-reset');
    notifyListeners('history-changed');
    return true;
}

export function canUndoHistory() {
    return state.historyPast.length > 0;
}

export function canRedoHistory() {
    return state.historyFuture.length > 0;
}

// ===== Event System =====

export function onStateChange(event, callback) {
    if (!state.listeners.has(event)) {
        state.listeners.set(event, []);
    }
    state.listeners.get(event).push(callback);
}

function notifyListeners(event, data) {
    const callbacks = state.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
}

function areNameListsEqual(left, right) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) return false;
    }
    return true;
}
