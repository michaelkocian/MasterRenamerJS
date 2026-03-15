// ===== Folder Tree Panel =====
import { getState, setVisibleFiles, setSelectedTreeNode, onStateChange } from './state.js';
import { buildFolderTree } from './fileSystem.js';

let treeContainer = null;

export function initFolderTree() {
    treeContainer = document.getElementById('tree-container');
    onStateChange('file-scope-changed', () => refilterFiles());
    onStateChange('sort-order-changed', () => refilterFiles());
}

export function renderTree() {
    const { allFiles, directoryHandle } = getState();
    treeContainer.innerHTML = '';

    if (!allFiles.length) return;

    const tree = buildFolderTree(allFiles);
    const rootNode = createRootNode(directoryHandle.name, tree);
    treeContainer.appendChild(rootNode);
}

function createRootNode(name, tree) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const row = createTreeRow(name, 0, true, true);
    node.appendChild(row);

    const childrenContainer = createChildrenContainer(tree, 1);
    const infoRow = createFileCountRow(tree.files.length, 1);
    childrenContainer.insertBefore(infoRow, childrenContainer.firstChild);
    node.appendChild(childrenContainer);

    row.addEventListener('click', () => {
        handleFolderClick(row, childrenContainer, null);
    });

    return node;
}

function createTreeRow(label, depth, isFolder, expanded) {
    const row = document.createElement('div');
    row.className = 'tree-node-row';

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

        const row = createTreeRow(name, depth, true, false);
        folderNode.appendChild(row);

        const childContainer = createChildrenContainer(child, depth + 1);
        const infoRow = createFileCountRow(child.files.length, depth + 1);
        childContainer.insertBefore(infoRow, childContainer.firstChild);
        childContainer.classList.add('collapsed');
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

    clearAllActive();
    row.classList.add('active');

    setSelectedTreeNode(folderPath);
    refilterFiles();
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
        return allFiles.filter(f => f.path.startsWith(folderPath + '/'));
    }

    if (scope === 'folder') {
        return allFiles.filter(f => isDirectChildFile(f, folderPath));
    }

    // files-and-folders: direct children files + direct subfolder virtual entries
    const directFiles = allFiles.filter(f => isDirectChildFile(f, folderPath));
    const subfolderNames = new Set();
    for (const f of allFiles) {
        if (!f.path.startsWith(folderPath + '/')) continue;
        const remainder = f.path.substring(folderPath.length + 1);
        const slashIdx = remainder.indexOf('/');
        if (slashIdx !== -1) {
            subfolderNames.add(remainder.substring(0, slashIdx));
        }
    }
    const folderEntries = Array.from(subfolderNames).sort().map(name => ({
        handle: null,
        parentHandle: null,
        name: '\uD83D\uDCC1 ' + name,
        path: folderPath + '/' + name,
        isVirtualFolder: true,
    }));
    return [...folderEntries, ...directFiles];
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
