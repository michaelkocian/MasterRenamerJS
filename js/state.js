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
};

export function getState() {
    return state;
}

export function setFiles(files) {
    state.allFiles = files;
    state.originalNames = files.map(f => f.name);
    state.currentNames = [...state.originalNames];
    notifyListeners('files-changed');
}

export function setVisibleFiles(files) {
    state.visibleFiles = files;
    notifyListeners('visible-files-changed');
}

export function updateFileName(index, newName) {
    state.currentNames[index] = newName;
    notifyListeners('name-changed', { index, newName });
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
    notifyListeners('names-committed');
}

export function setCharWidth(width) {
    state.charWidth = width;
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
