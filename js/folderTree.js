// ===== Folder Tree Panel =====
import { getState, setVisibleFiles, setSelectedTreeNode, onStateChange } from './state.js';
import { buildFolderTree } from './fileSystem.js';

let treeContainer = null;

export function initFolderTree() {
    treeContainer = document.getElementById('tree-container');
    onStateChange('file-scope-changed', () => refilterFiles());
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

function createChildrenContainer(treeNode, depth) {
    const container = document.createElement('div');
    container.className = 'tree-children';

    appendFolderChildren(container, treeNode, depth);
    appendFileChildren(container, treeNode, depth);

    return container;
}

function appendFolderChildren(container, treeNode, depth) {
    for (const [name, child] of treeNode.children) {
        const folderNode = document.createElement('div');
        folderNode.className = 'tree-node';

        const row = createTreeRow(name, depth, true, false);
        folderNode.appendChild(row);

        const childContainer = createChildrenContainer(child, depth + 1);
        childContainer.classList.add('collapsed');
        folderNode.appendChild(childContainer);

        row.addEventListener('click', () => {
            handleFolderClick(row, childContainer, child.path);
        });

        container.appendChild(folderNode);
    }
}

function appendFileChildren(container, treeNode, depth) {
    for (const file of treeNode.files) {
        const fileNode = document.createElement('div');
        fileNode.className = 'tree-node';

        const row = createTreeRow(file.name, depth, false, false);
        fileNode.appendChild(row);

        container.appendChild(fileNode);
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
    const { allFiles, selectedTreeNode, fileScope } = getState();
    const folderPath = selectedTreeNode;

    if (folderPath === null) {
        setVisibleFiles(allFiles);
        return;
    }

    const filtered = filterByScope(allFiles, folderPath, fileScope);
    setVisibleFiles(filtered);
}

function filterByScope(allFiles, folderPath, scope) {
    if (scope === 'recursive') {
        return allFiles.filter(f => f.path.startsWith(folderPath + '/'));
    }

    if (scope === 'folder') {
        return allFiles.filter(f => isDirectChildFile(f, folderPath));
    }

    // files-and-folders: direct children files + all subfolder files grouped
    return allFiles.filter(f => f.path.startsWith(folderPath + '/'));
}

function isDirectChildFile(file, folderPath) {
    if (!file.path.startsWith(folderPath + '/')) return false;
    const remainder = file.path.substring(folderPath.length + 1);
    return !remainder.includes('/');
}
