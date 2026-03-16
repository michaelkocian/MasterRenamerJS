// ===== Folder Tree Panel =====
import { getState, setVisibleFiles, setSelectedTreeNode, onStateChange } from './state.js';
import { buildFolderTree } from './fileSystem.js';

let treeContainer = null;
let treeHeaderStatus = null;
let expandedNodes = new Set([null]);

export function initFolderTree() {
    treeContainer = document.getElementById('tree-container');
    treeHeaderStatus = document.getElementById('tree-header-status');
    onStateChange('file-scope-changed', () => refilterFiles());
    onStateChange('sort-order-changed', () => refilterFiles());
    onStateChange('files-changed', handleFilesChanged);
    onStateChange('scan-progress', renderTree);
    onStateChange('tree-selection-changed', renderTree);
}

export function renderTree() {
    const { allFiles, directoryHandle, scan } = getState();
    treeContainer.innerHTML = '';
    updateHeaderStatus(scan);

    if (!directoryHandle) return;

    const tree = buildFolderTree(allFiles);
    const rootNode = createRootNode(directoryHandle.name, tree, scan);
    treeContainer.appendChild(rootNode);
}

function createRootNode(name, tree, scan) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const expanded = expandedNodes.has(null);
    const row = createTreeRow(name, 0, true, expanded, {
        badgeText: scan.isLoading ? 'Loading' : '',
        isActive: getState().selectedTreeNode === null,
    });
    node.appendChild(row);

    const childrenContainer = createChildrenContainer(tree, 1);
    const infoRow = createFileCountRow(tree.files.length, 1);
    childrenContainer.insertBefore(infoRow, childrenContainer.firstChild);
    childrenContainer.classList.toggle('collapsed', !expanded);
    node.appendChild(childrenContainer);

    row.addEventListener('click', () => {
        handleFolderClick(row, childrenContainer, null);
    });

    return node;
}

function createTreeRow(label, depth, isFolder, expanded, options = {}) {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    row.classList.toggle('active', Boolean(options.isActive));

    for (let i = 0; i < depth; i++) {
        const indent = document.createElement('span');
        indent.className = 'tree-indent';
        row.appendChild(indent);
    }

    const toggle = document.createElement('span');
    toggle.className = `tree-toggle ${isFolder ? (expanded ? 'expanded' : '') : 'leaf'}`;
    toggle.textContent = '▶';
    row.appendChild(toggle);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = isFolder ? (expanded ? '📂' : '📁') : '📄';
    row.appendChild(icon);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'tree-label';
    labelSpan.textContent = label;
    row.appendChild(labelSpan);

    if (options.badgeText) {
        const badge = document.createElement('span');
        badge.className = options.badgeClassName || 'tree-node-badge';
        badge.textContent = options.badgeText;
        row.appendChild(badge);
    }

    return row;
}

function createFileCountRow(count, depth) {
    const row = document.createElement('div');
    row.className = 'tree-file-info';

    for (let i = 0; i < depth; i++) {
        const indent = document.createElement('span');
        indent.className = 'tree-indent';
        row.appendChild(indent);
    }

    // spacer for toggle + icon width
    const spacer = document.createElement('span');
    spacer.className = 'tree-indent';
    row.appendChild(spacer);

    const label = document.createElement('span');
    label.className = 'tree-file-count-label';
    label.textContent = `(${count} file${count !== 1 ? 's' : ''})`;
    row.appendChild(label);

    return row;
}

function createChildrenContainer(treeNode, depth) {
    const container = document.createElement('div');
    container.className = 'tree-children';

    appendFolderChildren(container, treeNode, depth);

    return container;
}

function appendFolderChildren(container, treeNode, depth) {
    for (const [name, child] of treeNode.children) {
        const folderNode = document.createElement('div');
        folderNode.className = 'tree-node';

        const expanded = expandedNodes.has(child.path);
        const row = createTreeRow(name, depth, true, expanded, {
            badgeText: child.isDepthLimited ? `Max depth ${getState().scan.maxDepth}` : '',
            badgeClassName: child.isDepthLimited ? 'tree-node-badge tree-node-badge-warning' : 'tree-node-badge',
            isActive: getState().selectedTreeNode === child.path,
        });
        folderNode.appendChild(row);

        const childContainer = createChildrenContainer(child, depth + 1);
        const infoRow = createFileCountRow(child.files.length, depth + 1);
        childContainer.insertBefore(infoRow, childContainer.firstChild);
        childContainer.classList.toggle('collapsed', !expanded);

        if (child.isDepthLimited) {
            childContainer.appendChild(createDepthLimitRow(depth + 1, getState().scan.maxDepth));
        }

        folderNode.appendChild(childContainer);

        row.addEventListener('click', () => {
            handleFolderClick(row, childContainer, child.path);
        });

        container.appendChild(folderNode);
    }
}

function handleFolderClick(row, childContainer, folderPath) {
    const isCollapsed = childContainer.classList.toggle('collapsed');
    const toggle = row.querySelector('.tree-toggle');
    const icon = row.querySelector('.tree-icon');

    toggle.classList.toggle('expanded', !isCollapsed);
    icon.textContent = isCollapsed ? '📁' : '📂';

    if (isCollapsed) {
        expandedNodes.delete(folderPath);
    } else {
        expandedNodes.add(folderPath);
    }

    clearAllActive();
    row.classList.add('active');

    setSelectedTreeNode(folderPath);
    refilterFiles();
}

function createDepthLimitRow(depth, maxDepth) {
    const row = document.createElement('div');
    row.className = 'tree-file-info tree-file-info-warning';

    for (let i = 0; i < depth; i++) {
        const indent = document.createElement('span');
        indent.className = 'tree-indent';
        row.appendChild(indent);
    }

    const spacer = document.createElement('span');
    spacer.className = 'tree-indent';
    row.appendChild(spacer);

    const label = document.createElement('span');
    label.className = 'tree-file-count-label';
    label.textContent = `Nested content hidden after depth ${maxDepth}`;
    row.appendChild(label);

    return row;
}

function handleFilesChanged() {
    const { allFiles } = getState();
    if (allFiles.length === 0) {
        expandedNodes = new Set([null]);
    }

    renderTree();
    refilterFiles();
}

function updateHeaderStatus(scan) {
    if (!treeHeaderStatus) return;

    if (scan.isLoading && scan.isPaused) {
        treeHeaderStatus.textContent = 'Paused';
        treeHeaderStatus.className = 'tree-header-status warning';
        return;
    }

    if (scan.isLoading) {
        treeHeaderStatus.textContent = scan.depthLimitHit
            ? `Loading • depth ${scan.maxDepth}`
            : 'Loading';
        treeHeaderStatus.className = scan.depthLimitHit
            ? 'tree-header-status warning'
            : 'tree-header-status';
        return;
    }

    if (scan.depthLimitHit) {
        treeHeaderStatus.textContent = `Partial • depth ${scan.maxDepth}`;
        treeHeaderStatus.className = 'tree-header-status warning';
        return;
    }

    treeHeaderStatus.textContent = '';
    treeHeaderStatus.className = 'tree-header-status';
}

function clearAllActive() {
    treeContainer.querySelectorAll('.tree-node-row.active')
        .forEach(r => r.classList.remove('active'));
}

export function refilterFiles() {
    const { allFiles, selectedTreeNode, fileScope, sortOrder } = getState();
    const folderPath = selectedTreeNode;

    let filtered = filterByScope(allFiles, folderPath, fileScope);

    sortFiles(filtered, sortOrder);
    setVisibleFiles(filtered);
}

function filterByScope(allFiles, folderPath, scope) {
    if (scope === 'recursive') {
        if (!folderPath) return [...allFiles];
        return allFiles.filter(f => f.path.startsWith(folderPath + '/'));
    }

    if (scope === 'folder') {
        return allFiles.filter(f => isDirectChildFile(f, folderPath));
    }

    // files-and-folders: direct children files + direct subfolder virtual entries
    const directFiles = allFiles.filter(f => isDirectChildFile(f, folderPath));
    const subfolderNames = getDirectSubfolders(allFiles, folderPath);
    const prefix = folderPath ? folderPath + '/' : '';
    const folderEntries = Array.from(subfolderNames).sort().map(name => ({
        handle: null,
        parentHandle: null,
        name: '\uD83D\uDCC1 ' + name,
        path: prefix + name,
        isVirtualFolder: true,
    }));
    return [...folderEntries, ...directFiles];
}

export function getDirectSubfolders(allFiles, folderPath) {
    const subfolderNames = new Set();
    for (const f of allFiles) {
        if (folderPath) {
            if (!f.path.startsWith(folderPath + '/')) continue;
            const remainder = f.path.substring(folderPath.length + 1);
            const slashIdx = remainder.indexOf('/');
            if (slashIdx !== -1) {
                subfolderNames.add(remainder.substring(0, slashIdx));
            }
        } else {
            const slashIdx = f.path.indexOf('/');
            if (slashIdx !== -1) {
                subfolderNames.add(f.path.substring(0, slashIdx));
            }
        }
    }
    return subfolderNames;
}

function isDirectChildFile(file, folderPath) {
    if (!folderPath) {
        // Root: direct child if no slashes in path
        return !file.path.includes('/');
    }
    if (!file.path.startsWith(folderPath + '/')) return false;
    const remainder = file.path.substring(folderPath.length + 1);
    return !remainder.includes('/');
}

function sortFiles(files, sortOrder) {
    const getExt = f => {
        const dot = f.name.lastIndexOf('.');
        return dot > 0 ? f.name.substring(dot + 1).toLowerCase() : '';
    };

    switch (sortOrder) {
        case 'name-desc':
            files.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'ext-asc':
            files.sort((a, b) => getExt(a).localeCompare(getExt(b)) || a.name.localeCompare(b.name));
            break;
        case 'ext-desc':
            files.sort((a, b) => getExt(b).localeCompare(getExt(a)) || a.name.localeCompare(b.name));
            break;
        default: // 'name-asc'
            files.sort((a, b) => a.name.localeCompare(b.name));
            break;
    }
}
